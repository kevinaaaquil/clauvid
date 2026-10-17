import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/api";
import { fmtDuration } from "@/lib/format";
import { encodeWav } from "@/lib/wav";
import { cn } from "@/lib/utils";

type Phase = "countdown" | "recording" | "paused" | "saving";

// Passes raw mic samples to the page in small blocks.
const WORKLET = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("clauvid-tap", Tap);`;

const LIVE_BARS = 48, COUNTDOWN = 3;
const red = "bg-[#DC2626] text-white hover:bg-[#B91C1C] dark:bg-[#DC2626] dark:hover:bg-[#B91C1C]";

const Bars = ({ peaks }: { peaks: number[] }) => (
  <div className="flex h-7 min-w-24 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden="true">
    {peaks.map((p, i) => (
      <span key={i} style={{ height: `${Math.round(p * 100)}%`, flex: "1 1 0", maxWidth: 4, minWidth: 1, borderRadius: 2 }}
        className="bg-[#F87171]" />
    ))}
  </div>
);

/**
 * Takes the place of the script toolbar while in use: 3 s countdown, then recording with a live
 * waveform. Stop saves a 16-bit mono WAV straight into the video's assets/ as `name`.wav.
 */
export function Recorder({ project, video, name, onClose, onSaved }: {
  project: string; video: string; name: string; onClose: () => void; onSaved: (file: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("countdown");
  const [count, setCount] = useState(COUNTDOWN);
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<number[]>(() => Array(LIVE_BARS).fill(0.06));

  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const samples = useRef(0);
  const paused = useRef(false);
  const rate = useRef(48000);

  const stopMic = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
  };

  // Open the mic during the countdown (so permission is asked up front), keep samples only after it.
  useEffect(() => {
    let cancelled = false;
    setPhase("countdown"); setCount(COUNTDOWN); setElapsed(0); setLive(Array(LIVE_BARS).fill(0.06));
    chunks.current = []; samples.current = 0; paused.current = false;
    let keep = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        const c = new AudioContext();
        await c.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
        const tap = new AudioWorkletNode(c, "clauvid-tap");
        rate.current = c.sampleRate;
        let peak = 0, frames = 0;
        tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
          if (!keep || paused.current) return;
          chunks.current.push(e.data);
          samples.current += e.data.length;
          for (let i = 0; i < e.data.length; i += 8) peak = Math.max(peak, Math.abs(e.data[i]));
          if (++frames % 8 === 0) {
            const p = Math.max(0.06, Math.min(1, peak * 2.2));
            setLive((l) => [...l.slice(1), p]);
            setElapsed(samples.current / rate.current);
            peak = 0;
          }
        };
        c.createMediaStreamSource(s).connect(tap);
        ctx.current = c; stream.current = s;
      } catch (e) {
        if (cancelled) return;
        stopMic();
        toast.error(e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone blocked. Allow it in the browser's site settings, then try again."
          : "Couldn't start the microphone.");
        onClose();
      }
    })();
    let n = COUNTDOWN;
    const tick = setInterval(() => {
      n -= 1;
      if (n > 0) setCount(n);
      else { clearInterval(tick); keep = true; setPhase("recording"); }
    }, 1000);
    return () => { cancelled = true; clearInterval(tick); stopMic(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A running recording asks before the page is left.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const togglePause = () => { paused.current = !paused.current; setPhase(paused.current ? "paused" : "recording"); };
  const stop = async () => {
    const blob = encodeWav(chunks.current, rate.current);
    const seconds = samples.current / rate.current;
    chunks.current = [];
    stopMic();
    setPhase("saving");
    try {
      const r = await api.upload(project, video, "assets", new File([blob], `${name}.wav`, { type: "audio/wav" }), () => {});
      toast.success(`Saved ${r.name} · ${fmtDuration(seconds)}`);
      onSaved(r.name);
      onClose();
    } catch (e) {
      // Keep the take rather than lose it: hand it over as a download.
      toast.error(`${errorText(e)} The take was downloaded instead.`);
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${name}.wav` });
      a.click();
      onClose();
    }
  };

  const recording = phase === "recording" || phase === "paused";
  const bar = cn("flex flex-wrap items-center gap-3 rounded-[10px] border p-1.5 pl-3.5", recording ? "border-[#F87171]/45 bg-[#1A1515]" : "bg-card");

  if (phase === "countdown") return (
    <div className={bar} role="status" aria-live="assertive">
      <span className="grid size-[34px] place-items-center rounded-full border-2 border-[#F87171] font-mono text-base font-semibold text-[#F87171] tabular-nums">{count}</span>
      <span className="text-muted-foreground">Recording starts in {count}…</span>
      <Button variant="outline" className="ml-auto h-[34px] border-border bg-raised dark:bg-raised" onClick={onClose}>Cancel</Button>
    </div>
  );

  if (recording) return (
    <div className={bar} role="region" aria-label="Recording">
      <span className={cn("size-2.5 rounded-full bg-[#F87171]", phase === "recording" ? "shadow-[0_0_0_4px_rgb(248_113_113/0.2)] animate-pulse" : "opacity-40")} />
      <span className="font-mono text-[15px] font-medium tabular-nums">{fmtDuration(elapsed)}</span>
      {phase === "paused" && <span className="text-xs text-muted-foreground">Paused</span>}
      <Bars peaks={live} />
      <Button variant="outline" className="h-[34px] border-[#3A2A2A] bg-[#221A1A] dark:bg-[#221A1A] dark:hover:bg-[#2A1F1F]" onClick={togglePause}>
        {phase === "paused" ? <><PlayIcon />Resume</> : <><PauseIcon />Pause</>}
      </Button>
      <Button className={cn("h-[34px] px-3.5 font-semibold", red)} onClick={stop}><SquareIcon className="size-3 fill-current" />Stop</Button>
    </div>
  );

  return (
    <div className={bar} role="status">
      <span className="size-2.5 animate-pulse rounded-full bg-brand" />
      <span className="text-muted-foreground">Saving {name}.wav…</span>
    </div>
  );
}
