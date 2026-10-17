import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ClapperboardIcon, DownloadIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fileUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDuration, fmtSize } from "@/lib/format";
import type { Item, MadeFrom, Render, Video } from "@/lib/types";
import { linkFor } from "@/lib/url";
import { DocsList } from "./DocsList";
import { Code, EmptyState } from "./EmptyState";
import { FinalBadge } from "./Sidebar";
import { ScriptPanel } from "./ScriptPanel";

export const rendersOf = (v: Video): Item[] => [
  ...v.final.map((f) => ({ type: "render" as const, dir: "final" as const, name: f.name })),
  ...v.revisions.map((f) => ({ type: "render" as const, dir: "revisions" as const, name: f.name })),
];

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success("Link copied"); }
  catch { toast("Copy this link", { description: text, duration: 10000 }); }
}

export function VideoTab({ project, video, item, startAt, onSelect, onOpenScript }: {
  project: string; video: Video; item: Item | null; startAt?: number; onSelect: (item: Item) => void;
  onOpenScript: (m: MadeFrom) => void;
}) {
  const [portrait, setPortrait] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const [at, setAt] = useState(0);
  const list = rendersOf(video);
  const idx = item?.type === "render" ? list.findIndex((x) => x.type === "render" && x.dir === item.dir && x.name === item.name) : -1;
  const cur = idx >= 0 ? (list[idx] as Extract<Item, { type: "render" }>) : null;
  const info: Render | undefined = cur ? (cur.dir === "final" ? video.final : video.revisions).find((f) => f.name === cur.name) : undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el || !startAt) return;
    const seek = () => { el.currentTime = startAt; };
    el.addEventListener("loadedmetadata", seek, { once: true });
    return () => el.removeEventListener("loadedmetadata", seek);
  }, [cur?.name, startAt]);
  useEffect(() => setAt(0), [cur?.name]);

  const docs = video.docs
    .map((d) => ({ key: d.dir + "/" + d.name, name: d.name, label: d.dir, url: fileUrl(project, video.slug, d.dir, d.name) }));

  if (!cur || !info) {
    return (
      <>
        <EmptyState icon={<ClapperboardIcon />} title="No renders yet">
          Drafts appear here once a render lands in <Code>videos/{video.slug}/revisions/</Code>.
        </EmptyState>
        <div className="mx-auto max-w-3xl"><DocsList docs={docs} /></div>
      </>
    );
  }

  const src = fileUrl(project, video.slug, cur.dir, cur.name);
  const outline = "h-[38px] border-border bg-popover px-3.5 dark:bg-popover dark:hover:bg-raised max-md:h-11";
  return (
    <div className="mx-auto max-w-6xl">
      <div className={cn("flex gap-5 max-lg:flex-col", portrait ? "lg:h-[72vh]" : "lg:h-[62vh]")}>
        <video key={src} ref={ref} src={src} controls playsInline preload="auto"
          onLoadedMetadata={(e) => setPortrait(e.currentTarget.videoHeight > e.currentTarget.videoWidth)}
          onTimeUpdate={(e) => setAt(Math.floor(e.currentTarget.currentTime))}
          className={cn("min-w-0 rounded-[14px] border border-line bg-[#050506] max-md:rounded-xl",
            portrait ? "aspect-[9/16] h-full max-lg:mx-auto max-lg:h-[62vh] max-md:h-[56vh]" : "aspect-video min-h-0 flex-[1_1_0] object-contain max-lg:w-full")} />
        <ScriptPanel project={project} video={video.slug} made={info.madeFrom} renderedAt={info.mtime}
          onOpen={onOpenScript} className={cn("max-lg:max-h-[60vh]", portrait ? "min-w-0 flex-1" : "lg:w-[340px] lg:flex-none")} />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="text-[17px] font-semibold break-all">{cur.name}</h2>
          {cur.dir === "final" && <FinalBadge className="text-[11px]" />}
          <span className="text-muted-foreground max-md:w-full max-md:text-xs">{fmtSize(info.size)} · {fmtDate(info.mtime)}</span>
        </div>
        <div className="flex flex-wrap gap-2 max-md:grid max-md:w-full max-md:grid-cols-2">
          <Button variant="outline" className={outline} disabled={idx <= 0} onClick={() => onSelect(list[idx - 1])}><ChevronLeftIcon />Prev</Button>
          <Button variant="outline" className={outline} disabled={idx >= list.length - 1} onClick={() => onSelect(list[idx + 1])}>Next<ChevronRightIcon /></Button>
          <Button variant="outline" className={outline} onClick={() => copy(location.origin + linkFor(project, video.slug, cur, "video", at))}>
            <LinkIcon />Copy link{at > 0 ? <span className="max-md:hidden">at {fmtDuration(at)}</span> : null}
          </Button>
          <Button asChild className="h-[38px] px-4 font-semibold max-md:h-11"><a href={src + "?orig=1"} download><DownloadIcon />Download</a></Button>
        </div>
      </div>
      <DocsList docs={docs} />
    </div>
  );
}
