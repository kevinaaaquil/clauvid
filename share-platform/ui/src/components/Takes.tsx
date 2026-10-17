import { useRef, useState } from "react";
import { LockIcon, CheckIcon, MicIcon, PauseIcon, PencilIcon, PlayIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorText, fileUrl } from "@/lib/api";
import { fmtDuration, fmtSize } from "@/lib/format";
import type { Asset } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { DeleteRequest } from "./DeleteDialog";
import { Waveform } from "./Waveform";

/** Audio files in this video's assets/, newest first: play, rename, delete in place. */
export function Takes({ project, video, takes, canEdit, askDelete, onChanged, fresh }: {
  project: string; video: string; takes: Asset[]; canEdit: boolean;
  askDelete: (r: DeleteRequest) => void; onChanged: () => void; fresh?: string | null;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const els = useRef<Record<string, HTMLAudioElement | null>>({});
  const [pos, setPos] = useState<Record<string, number>>({});
  const seek = (t: Asset, f: number) => {
    const a = els.current[t.name], d = a?.duration || t.duration || 0;
    if (!a || !d) return;
    a.currentTime = f * d;
    setPos((p) => ({ ...p, [t.name]: f * d }));
  };

  const toggle = (n: string) => {
    for (const [k, a] of Object.entries(els.current)) if (k !== n) a?.pause();
    const a = els.current[n];
    if (a) { if (a.paused) a.play(); else a.pause(); }
  };
  const startRename = (t: Asset) => { setEditing(t.name); setDraft(t.name.replace(/\.[^.]+$/, "")); };
  const rename = async (t: Asset) => {
    const to = draft.trim();
    if (!to || to === t.name.replace(/\.[^.]+$/, "")) { setEditing(null); return; }
    try {
      const r = await api.rename({ project, video, dir: "assets", name: t.name, to });
      toast.success(`Renamed to ${r.name}`);
      setEditing(null); onChanged();
    } catch (e) { toast.error(errorText(e)); }
  };
  const del = (t: Asset) => askDelete({
    label: t.name, summary: `1 recording · ${fmtDuration(t.duration)} · ${fmtSize(t.size)}`,
    run: async () => {
      try { await api.del({ project, video, dir: "assets", name: t.name }); toast.success(`Deleted ${t.name}`); onChanged(); }
      catch (e) { toast.error(errorText(e)); throw e; }
    },
  });

  return (
    <section>
      <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
        <MicIcon className="size-3.5" />Takes · {takes.length}
      </h3>
      <div className="flex flex-col gap-2">
        {takes.length === 0 && (
          <p className="rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground">
            {canEdit ? "Hit Record above the script. Each take is saved here automatically." : "No recordings yet."}
          </p>
        )}
        {takes.map((t) => (
          <div key={t.name} className={cn("group flex flex-col gap-2 rounded-xl border bg-card p-3 transition-colors",
            playing === t.name && "border-brand/60", fresh === t.name && "border-brand/60 bg-selected")}>
          <div className="flex items-center gap-2.5">
            <button aria-label={`${playing === t.name ? "Pause" : "Play"} ${t.name}`} onClick={() => toggle(t.name)}
              className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-[#2A2A2E] hover:bg-[#34343A]", playing === t.name && "bg-brand text-primary-foreground hover:bg-brand/90")}>
              {playing === t.name ? <PauseIcon className="size-3 fill-current" /> : <PlayIcon className="size-3 fill-current" />}
            </button>
            {editing === t.name ? (
              <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(e) => { e.preventDefault(); rename(t); }}>
                <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="New name"
                  onKeyDown={(e) => e.key === "Escape" && setEditing(null)} className="h-8 min-w-0 flex-1 bg-header px-2 font-mono text-[13px]" />
                <Button type="submit" variant="ghost" size="icon-sm" aria-label="Save name"><CheckIcon /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel rename" onClick={() => setEditing(null)}><XIcon /></Button>
              </form>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px]" title={t.name}>{t.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", t.used ? "bg-[#4ADE80]" : "border-[1.5px] border-faint")} />
                    {t.used ? "Used" : "Not used yet"} · {fmtSize(t.size)}
                    {!!t.lockedBy?.length && <span className="flex items-center gap-1" title={`Locked: used by ${t.lockedBy.join(", ")}`}>· <LockIcon className="size-3" />{t.lockedBy[0]}</span>}
                  </p>
                </div>
                {canEdit && !t.lockedBy?.length && (
                  <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                    <Button variant="ghost" size="icon-sm" className="text-faint hover:text-foreground" aria-label={`Rename ${t.name}`} onClick={() => startRename(t)}><PencilIcon /></Button>
                    <Button variant="ghost" size="icon-sm" className="text-faint hover:bg-destructive/15 hover:text-destructive" aria-label={`Delete ${t.name}`} onClick={() => del(t)}><Trash2Icon /></Button>
                  </span>
                )}
              </>
            )}
          </div>
            <div className="flex items-center gap-2.5 pl-[42px]">
              <Waveform src={fileUrl(project, video, "assets", t.name) + `?v=${t.mtime}`} bars={56} className="h-7"
                duration={t.duration} progress={t.duration ? (pos[t.name] ?? 0) / t.duration : 0} onSeek={(f) => seek(t, f)} />
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                {fmtDuration(pos[t.name] ?? 0)} / {fmtDuration(t.duration)}
              </span>
            </div>
            <audio ref={(el) => { els.current[t.name] = el; }} src={fileUrl(project, video, "assets", t.name) + `?v=${t.mtime}`} preload="metadata"
              onPlay={() => setPlaying(t.name)} onPause={() => setPlaying((p) => (p === t.name ? null : p))}
              onTimeUpdate={(e) => { const c = e.currentTarget.currentTime; setPos((p) => ({ ...p, [t.name]: c })); }}
              onEnded={() => setPos((p) => ({ ...p, [t.name]: 0 }))} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Next take for a script: script_take1, script_take2, … (script_v2.md gets script_v2_take1, …). */
export function nextTakeName(takes: Asset[], scriptStem = "script") {
  const re = new RegExp(`^${scriptStem}_take(\\d+)\\.`);
  const top = Math.max(0, ...takes.map((t) => Number(re.exec(t.name)?.[1] ?? 0)));
  return `${scriptStem}_take${top + 1}`;
}
