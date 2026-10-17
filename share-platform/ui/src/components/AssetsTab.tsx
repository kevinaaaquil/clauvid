import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileTextIcon, FilmIcon, ImageIcon, MoreHorizontalIcon, MusicIcon, PackageOpenIcon, PauseIcon, PlayIcon, Trash2Icon, UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, errorText, fileUrl } from "@/lib/api";
import { fmtDate, fmtDuration, fmtSize, plural } from "@/lib/format";
import type { Asset, AssetKind, Assets } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { DeleteRequest } from "./DeleteDialog";
import { Markdown } from "./Markdown";
import { Waveform } from "./Waveform";

const FILTER_LABEL: Record<Filter, string> = { all: "All", image: "Images", audio: "Audio", video: "Video", doc: "Docs" };
const Stat = ({ n, label, className }: { n: number; label: string; className?: string }) => (
  <div className="flex flex-col"><span className={cn("font-mono text-[22px] leading-tight font-bold", className)}>{n}</span><span className="text-xs text-muted-foreground">{label}</span></div>
);

type Dest = "assets" | "references";
type Dir = Dest | "research";
type Filter = "all" | AssetKind;
type Upload = { id: string; name: string; progress: number; error?: string };

const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.svg,.heic,.mp3,.wav,.m4a,.aac,.mp4,.mov,.webm,.pdf,.md,.txt";
const ICON: Record<AssetKind, React.ReactNode> = {
  image: <ImageIcon />, audio: <MusicIcon />, video: <FilmIcon />, doc: <FileTextIcon />,
};

function Thumb({ a, src }: { a: Asset; src: string }) {
  if (a.kind === "image") return <img src={src} alt="" loading="lazy" className="size-full object-cover" />;
  if (a.kind === "video") return <video src={src + "#t=0.5"} preload="metadata" muted className="size-full object-cover" />;
  return <div className="grid size-full place-items-center text-muted-foreground [&_svg]:size-8">{ICON[a.kind]}</div>;
}

function AudioThumb({ src, duration }: { src: string; duration?: number | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  return (
    <div className="flex size-full flex-col justify-center gap-3 bg-popover px-4">
      <Waveform src={src} progress={progress} duration={duration} bars={48}
        onSeek={(f) => { const a = ref.current, d = a?.duration || duration || 0; if (a && d) { a.currentTime = f * d; setProgress(f); } }} />
      <div className="flex items-center gap-2">
        <button aria-label={playing ? "Pause" : "Play"} className="grid size-7 place-items-center rounded-full bg-[#2A2A2E] hover:bg-[#34343A]"
          onClick={(e) => { e.stopPropagation(); const a = ref.current; if (!a) return; if (a.paused) a.play(); else a.pause(); }}>
          {playing ? <PauseIcon className="size-3" /> : <PlayIcon className="size-3 fill-current" />}
        </button>
        <span className="font-mono text-xs text-muted-foreground">{fmtDuration(duration)}</span>
      </div>
      <audio ref={ref} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))} />
    </div>
  );
}

/** Text docs rendered in the preview: Markdown formatted, JSON pretty-printed, the rest as plain text. */
function TextDoc({ src, name }: { src: string; name: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setText(null);
    fetch(src, { cache: "no-store" }).then((r) => (r.ok ? r.text() : "Couldn't load this file.")).then((t) => live && setText(t));
    return () => { live = false; };
  }, [src]);
  if (text === null) return <Skeleton className="h-40 w-full" />;
  const box = "max-h-[65vh] overflow-y-auto overscroll-contain rounded-lg border bg-card";
  if (/\.md$/i.test(name)) return <div className={cn(box, "px-6 py-5")}><Markdown text={text} /></div>;
  let body = text;
  if (/\.json$/i.test(name)) { try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { /* show as is */ } }
  return <pre className={cn(box, "p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-muted-foreground")}>{body}</pre>;
}

function UsedTag({ used }: { used?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {used
        ? <span className="size-1.5 rounded-full bg-[#4ADE80]" />
        : <span className="size-1.5 rounded-full border-[1.5px] border-faint" />}
      {used ? "Used" : "Not used yet"}
    </span>
  );
}

function AssetCard({ a, src, showUsed, canEdit, onOpen, onDelete }: {
  a: Asset; src: string; showUsed: boolean; canEdit: boolean; onOpen: () => void; onDelete: () => void;
}) {
  const menu = canEdit && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="text-faint" aria-label={`More for ${a.name}`}><MoreHorizontalIcon /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2Icon />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  // References that are documents get a compact row card.
  if (!showUsed && a.kind === "doc") {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:border-brand/50">
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${a.name}`}>
          <span className="grid h-12 w-10 shrink-0 place-items-center rounded-md bg-[#232326] font-mono text-[10px] text-muted-foreground uppercase">
            {a.name.split(".").pop()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold" title={a.name}>{a.name}</span>
            <span className="block text-xs text-muted-foreground">{fmtSize(a.size)}</span>
          </span>
        </button>
        {menu}
      </div>
    );
  }
  return (
    <div className="group overflow-hidden rounded-xl border bg-card transition-colors hover:border-brand/50">
      {a.kind === "audio" ? (
        <div className="aspect-[4/3] cursor-pointer" onClick={onOpen}><AudioThumb src={src} duration={a.duration} /></div>
      ) : (
        <button className="relative block aspect-[4/3] w-full overflow-hidden bg-muted" onClick={onOpen} aria-label={`Open ${a.name}`}>
          <Thumb a={a} src={src} />
          {a.duration ? <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 font-mono text-xs text-white">{fmtDuration(a.duration)}</span> : null}
        </button>
      )}
      <div className="flex items-start gap-1 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-[13px] font-semibold" title={a.name}>{a.name}</p>
          {showUsed ? (
            <span className="flex items-center gap-1.5"><UsedTag used={a.used} /><span className="text-xs text-faint max-sm:hidden">· {fmtSize(a.size)}</span></span>
          ) : <span className="text-xs text-muted-foreground">{fmtSize(a.size)} · {fmtDate(a.mtime)}</span>}
        </div>
        {menu}
      </div>
    </div>
  );
}

export function AssetsTab({ project, video, canEdit, askDelete, onChanged }: {
  project: string; video: string; canEdit: boolean; askDelete: (r: DeleteRequest) => void; onChanged: () => void;
}) {
  const [data, setData] = useState<Assets | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [dest, setDest] = useState<Dest>("assets");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<{ a: Asset; dir: Dir } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api.assets(project, video).then(setData).catch((e) => toast.error(errorText(e))), [project, video]);
  useEffect(() => { setData(null); load(); }, [load]);

  const uploadFiles = async (files: File[]) => {
    if (!canEdit || !files.length) return;
    const to = dest;
    const jobs = files.map((f) => ({ id: crypto.randomUUID(), file: f }));
    setUploads((u) => [...u, ...jobs.map((j) => ({ id: j.id, name: j.file.name, progress: 0 }))]);
    let ok = 0;
    for (const j of jobs) {
      try {
        const r = await api.upload(project, video, to, j.file, (p) =>
          setUploads((u) => u.map((x) => (x.id === j.id ? { ...x, progress: p } : x))));
        ok++;
        setUploads((u) => u.filter((x) => x.id !== j.id));
        if (r.name !== j.file.name) toast(`Saved as ${r.name}`);
      } catch (e) {
        setUploads((u) => u.map((x) => (x.id === j.id ? { ...x, error: errorText(e) } : x)));
      }
    }
    if (ok) { toast.success(`Uploaded ${plural(ok, "file")} to ${to}`); load(); onChanged(); }
  };

  const del = (a: Asset, dir: Dir) => askDelete({
    label: a.name, summary: `1 file · ${fmtSize(a.size)} from ${dir}/`,
    run: async () => {
      try { await api.del({ project, video, dir, name: a.name }); toast.success(`Deleted ${a.name}`); load(); onChanged(); }
      catch (e) { toast.error(errorText(e)); throw e; }
    },
  });

  if (!data) return <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/3]" />)}</div>;

  const shown = (list: Asset[]) => list.filter((a) => filter === "all" || a.kind === filter);
  const used = data.assets.filter((a) => a.used).length;
  const section = (title: string, dir: Dir, list: Asset[], hint: string) => (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <span className="text-xs text-faint">{hint}</span>
      </div>
      {shown(list).length === 0
        ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{list.length ? "Nothing matches this filter." : "Empty."}</p>
        : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5 max-sm:grid-cols-2">
            {shown(list).map((a) => (
              <AssetCard key={a.name} a={a} src={fileUrl(project, video, dir, a.name)} showUsed={dir === "assets"} canEdit={canEdit}
                onOpen={() => setPreview({ a, dir })} onDelete={() => del(a, dir)} />
            ))}
          </div>
        )}
    </section>
  );

  return (
    <div className="relative mx-auto max-w-6xl"
      onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); uploadFiles([...e.dataTransfer.files]); }}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3" title="Used = referenced in this video's source code">
          <Stat n={data.assets.length} label="assets" />
          <span className="h-8 w-px bg-border" />
          <Stat n={used} label="used" className="text-final" />
          <span className="h-8 w-px bg-border" />
          <Stat n={data.references.length} label="references" />
          <span className="h-8 w-px bg-border" />
          <Stat n={data.research?.length ?? 0} label="research" />
        </div>
        <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as Filter)}
          className="ml-auto gap-1 rounded-[10px] border bg-popover p-1 max-md:ml-0 max-md:w-full max-md:overflow-x-auto">
          {(["all", "image", "audio", "video", "doc"] as Filter[]).map((f) => (
            <ToggleGroupItem key={f} value={f} className="h-8 rounded-[7px] border-0 px-3 data-[state=on]:bg-[#2A2A2E] data-[state=on]:font-semibold data-[state=off]:text-muted-foreground">{FILTER_LABEL[f]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {canEdit && (
        <div className={cn("mt-5 flex flex-wrap items-center gap-3.5 rounded-[14px] border-[1.5px] border-dashed border-[#3A3A3F] bg-[#121213] px-5 py-4 transition-colors", drag && "border-brand bg-brand-soft")}>
          <span className="grid size-10 place-items-center rounded-[10px] bg-brand-soft text-brand"><UploadIcon className="size-[18px]" /></span>
          <div className="min-w-0">
            <p className="font-semibold">Drop photos, voiceover, music or references</p>
            <p className="text-xs text-muted-foreground">Images, audio, video, PDF, Markdown · up to 2 GB each</p>
          </div>
          <div className="ml-auto flex items-center gap-2 max-md:ml-0 max-md:w-full">
            <ToggleGroup type="single" value={dest} onValueChange={(v) => v && setDest(v as Dest)} className="gap-0.5 rounded-lg border bg-popover p-[3px]" aria-label="Upload into">
              <ToggleGroupItem value="assets" className="h-[30px] rounded-[7px] border-0 px-3 data-[state=on]:bg-[#2A2A2E] data-[state=on]:font-semibold data-[state=off]:text-muted-foreground">Assets</ToggleGroupItem>
              <ToggleGroupItem value="references" className="h-[30px] rounded-[7px] border-0 px-3 data-[state=on]:bg-[#2A2A2E] data-[state=on]:font-semibold data-[state=off]:text-muted-foreground">References</ToggleGroupItem>
            </ToggleGroup>
            <Button className="h-[38px] px-4 font-semibold max-md:ml-auto" onClick={() => input.current?.click()}>Choose files</Button>
          </div>
          <input ref={input} type="file" multiple accept={ACCEPT} hidden
            onChange={(e) => { uploadFiles([...(e.target.files || [])]); e.target.value = ""; }} />
          {uploads.length > 0 && (
            <div className="flex w-full flex-col gap-2 border-t border-line pt-3">
              {uploads.map((u) => (
                <div key={u.id} className="flex items-center gap-3 text-sm">
                  <span className="w-48 truncate max-md:w-28">{u.name}</span>
                  {u.error
                    ? <span className="flex-1 text-destructive">{u.error}</span>
                    : <Progress value={u.progress * 100} className="flex-1" />}
                  {u.error && <Button variant="ghost" size="xs" onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))}>Dismiss</Button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {drag && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-xl border-2 border-dashed border-brand bg-background/80 text-brand">
          <span className="flex items-center gap-2 font-medium"><PackageOpenIcon />Drop to upload into {dest}</span>
        </div>
      )}

      {section("Assets", "assets", data.assets, "goes in the video")}
      {section("References", "references", data.references, "for working from, never placed")}
      {section("Research", "research", data.research ?? [], "notes, transcripts and beat sheets from the agent")}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-4xl">
          {preview && (() => {
            const src = fileUrl(project, video, preview.dir, preview.a.name);
            const k = preview.a.kind;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="break-all">{preview.a.name}</DialogTitle>
                  <DialogDescription>{preview.dir} · {fmtSize(preview.a.size)}{preview.a.duration ? " · " + fmtDuration(preview.a.duration) : ""}</DialogDescription>
                </DialogHeader>
                {k === "image" && <img src={src} alt={preview.a.name} className="max-h-[70vh] w-full rounded-lg object-contain" />}
                {k === "video" && <video src={src} controls autoPlay className="max-h-[70vh] w-full rounded-lg bg-black" />}
                {k === "audio" && <audio src={src} controls autoPlay className="w-full" />}
                {k === "doc" && (preview.a.name.endsWith(".pdf")
                  ? <iframe src={src} title={preview.a.name} className="h-[70vh] w-full rounded-lg bg-white" />
                  : <TextDoc src={src} name={preview.a.name} />)}
                <Button variant="outline" asChild className="justify-self-start"><a href={src} download>Download</a></Button>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
