import { useEffect, useState } from "react";
import { ArrowUpRightIcon, MessageSquareIcon, MicIcon, ScrollTextIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import type { MadeFrom, Script, ScriptInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";

const chip = "group flex min-w-0 items-center gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-left text-[13px] transition-colors hover:border-brand/50 hover:bg-raised";

/**
 * The script beside the player. When the render records what it was built from, shows that
 * script and voice take; either one opens the Script tab on it.
 */
export function ScriptPanel({ project, video, made, renderedAt, onOpen, className }: {
  project: string; video: string; made?: MadeFrom; renderedAt: number;
  onOpen: (m: MadeFrom) => void; className?: string;
}) {
  const [list, setList] = useState<ScriptInfo[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const known = made?.script && list?.some((s) => s.name === made.script) ? made.script : null;
  const name = known ?? pick;

  useEffect(() => {
    let live = true;
    setList(null); setPick(null);
    api.scripts(project, video).then((l) => {
      if (!live) return;
      setList(l);
      setPick(l.find((s) => s.name === "script")?.name ?? l[0]?.name ?? null);
    }).catch(() => live && setList([]));
    return () => { live = false; };
  }, [project, video]);

  useEffect(() => {
    if (!name) return;
    let live = true;
    setScript(null);
    api.script(project, video, name).then((s) => live && setScript(s)).catch(() => {});
    return () => { live = false; };
  }, [project, video, name]);

  if (list && !list.length) return null;
  const open = script?.comments.filter((c) => !c.resolved).length ?? 0;
  const edited = known && script && script.mtime > renderedAt + 1000;

  return (
    <aside className={cn("flex min-h-0 flex-col overflow-hidden rounded-[14px] border bg-card", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        {known ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className={chip} onClick={() => onOpen({ script: known, take: made?.take ?? null })}>
                <ScrollTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-semibold">{known}.md</span>
                <ArrowUpRightIcon className="size-3.5 shrink-0 text-faint group-hover:text-brand" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Script this draft was built from. Open in Script tab</TooltipContent>
          </Tooltip>
        ) : list && list.length > 1 ? (
          <Select value={pick ?? undefined} onValueChange={setPick}>
            <SelectTrigger size="sm" className="h-8 min-w-0 flex-1 font-semibold">
              <ScrollTextIcon className="size-3.5 text-muted-foreground" /><SelectValue />
            </SelectTrigger>
            <SelectContent>{list.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}.md</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <button type="button" className={chip} onClick={() => name && onOpen({ script: name, take: null })}>
            <ScrollTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-semibold">{name ? `${name}.md` : "Script"}</span>
            <ArrowUpRightIcon className="size-3.5 shrink-0 text-faint group-hover:text-brand" />
          </button>
        )}
        {made?.take && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className={chip} onClick={() => onOpen({ script: known ?? made.script, take: made.take })}>
                <MicIcon className="size-3.5 shrink-0 text-brand" />
                <span className="truncate">{made.take.replace(/\.[^.]+$/, "")}</span>
                <ArrowUpRightIcon className="size-3.5 shrink-0 text-faint group-hover:text-brand" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Voiceover take used. Open in Script tab</TooltipContent>
          </Tooltip>
        )}
        {open > 0 && (
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand tabular-nums">
            <MessageSquareIcon className="size-3" />{open}
          </span>
        )}
      </div>
      {!known && list && (
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">This draft doesn't record which script it used.</p>
      )}
      {edited && (
        <p className="border-b bg-brand-soft/40 px-4 py-2 text-xs text-muted-foreground">Script edited after this draft was rendered.</p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
        {script ? <Markdown className="script" text={script.markdown.replace(/^\\\s*$/gm, "")} />
          : <div className="space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
      </div>
    </aside>
  );
}
