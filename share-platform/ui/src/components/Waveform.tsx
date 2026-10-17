import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const cache = new Map<string, number[]>();

/**
 * Peak bars decoded from the real audio, computed once it scrolls into view.
 * With `onSeek` it doubles as a seek bar: click or drag to jump, arrow keys step 5 s.
 */
export function Waveform({ src, progress = 0, onSeek, duration, bars = 40, className }: {
  src: string; progress?: number; onSeek?: (fraction: number) => void; duration?: number | null;
  bars?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = `${src}#${bars}`;
  const [peaks, setPeaks] = useState<number[] | null>(cache.get(key) ?? null);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    if (peaks || !ref.current) return;
    let live = true;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      try {
        const buf = await fetch(src).then((r) => r.arrayBuffer());
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const audio = await ctx.decodeAudioData(buf);
        const data = audio.getChannelData(0), step = Math.floor(data.length / bars) || 1;
        const raw = Array.from({ length: bars }, (_, i) => {
          let m = 0;
          for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 64) m = Math.max(m, Math.abs(data[j]));
          return m;
        });
        const max = Math.max(...raw, 0.001);
        const out = raw.map((v) => Math.max(0.12, v / max));
        cache.set(key, out);
        if (live) setPeaks(out);
      } catch { if (live) setPeaks([]); }
    });
    io.observe(ref.current);
    return () => { live = false; io.disconnect(); };
  }, [src, key, bars, peaks]);

  const shown = drag ?? progress;
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const seekable = !!onSeek;
  const step = duration ? 5 / duration : 0.05;

  return (
    <div ref={ref}
      className={cn("relative flex h-9 w-full items-center gap-[2px] overflow-hidden select-none", seekable && "cursor-pointer touch-none rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/60", className)}
      {...(seekable ? {
        role: "slider", tabIndex: 0, "aria-label": "Seek", "aria-valuemin": 0, "aria-valuemax": 100,
        "aria-valuenow": Math.round(shown * 100),
        "aria-valuetext": duration ? `${Math.round(shown * duration)} of ${Math.round(duration)} seconds` : undefined,
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(at(e)); },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => { if (drag !== null) setDrag(at(e)); },
        onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => { if (drag !== null) { onSeek!(at(e)); setDrag(null); } },
        onPointerCancel: () => setDrag(null),
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "ArrowRight") { e.preventDefault(); onSeek!(Math.min(1, progress + step)); }
          if (e.key === "ArrowLeft") { e.preventDefault(); onSeek!(Math.max(0, progress - step)); }
          if (e.key === "Home") { e.preventDefault(); onSeek!(0); }
        },
      } : { "aria-hidden": true })}>
      {(peaks?.length ? peaks : Array.from({ length: bars }, () => 0.15)).map((p, i) => (
        <span key={i} className={(i + 0.5) / bars <= shown ? "bg-brand" : "bg-[#4A4A50]"}
          style={{ flex: "1 1 0", minWidth: 1, maxWidth: seekable ? undefined : 3, height: `${Math.round(p * 100)}%`, borderRadius: 2 }} />
      ))}
      {seekable && shown > 0 && shown < 1 && (
        <span className="pointer-events-none absolute inset-y-0 w-0.5 rounded bg-foreground/80" style={{ left: `calc(${shown * 100}% - 1px)` }} />
      )}
    </div>
  );
}
