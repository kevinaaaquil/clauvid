import { useState } from "react";
import { ChevronRightIcon, FilmIcon, MoreHorizontalIcon, PenToolIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fmtDate, fmtSize, plural, stripExt } from "@/lib/format";
import type { FileInfo, Item, Project, Video } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SidebarProps = {
  project: Project;
  video?: string;
  item: Item | null;
  canEdit: boolean;
  onSelect: (video: string | undefined, item: Item | null) => void;
  onDeleteVideo: (v: Video) => void;
  onDeleteRender: (v: Video, dir: "final" | "revisions", f: FileInfo) => void;
  onNewVideo: () => void;
};

export const FinalBadge = ({ className }: { className?: string }) => (
  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-final bg-final-soft", className)}>FINAL</span>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">{children}</div>
);

function RowMenu({ onDelete, label }: { onDelete: () => void; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="shrink-0 text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
          aria-label={`More for ${label}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2Icon />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar(props: SidebarProps) {
  const { project, video, item, canEdit, onSelect } = props;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (v: string) => open[v] ?? v === video;

  return (
    <nav className="flex flex-col gap-1 px-3 py-4 text-sm" aria-label="Videos">
      <div className="flex items-center justify-between pr-1">
        <Label>Videos · {project.videos.length}</Label>
        {canEdit && (
          <Button variant="ghost" size="xs" className="-mt-1 text-muted-foreground hover:text-foreground" onClick={props.onNewVideo}>
            <PlusIcon />New video
          </Button>
        )}
      </div>
      {project.videos.length === 0 && <p className="px-2 py-1 text-muted-foreground">None yet</p>}
      {project.videos.map((v) => {
        const renders: [("final" | "revisions"), FileInfo][] = [
          ...v.final.map((f) => ["final", f] as ["final", FileInfo]),
          ...v.revisions.map((f) => ["revisions", f] as ["revisions", FileInfo]),
        ];
        const current = v.slug === video;
        const expanded = isOpen(v.slug);
        return (
          <Collapsible key={v.slug} open={expanded} onOpenChange={(o) => setOpen((s) => ({ ...s, [v.slug]: o }))}
            className={cn("rounded-[10px] border border-transparent", expanded && "border-border bg-raised p-1.5")}>
            <div className="group flex items-center gap-1 rounded-lg pr-1 hover:bg-white/[0.03]">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Toggle ${v.slug}`} className="text-faint">
                  <ChevronRightIcon className={cn("transition-transform", expanded && "rotate-90 text-[#C9C9CE]")} />
                </Button>
              </CollapsibleTrigger>
              <button className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
                onClick={() => { onSelect(v.slug, null); setOpen((s) => ({ ...s, [v.slug]: true })); }}>
                <span className={cn("truncate", current || expanded ? "font-semibold" : "font-medium text-[#DADADE]")}>{v.slug}</span>
                {v.final.length > 0 && <FinalBadge />}
                <span className="ml-auto shrink-0 font-mono text-xs text-faint tabular-nums">
                  {renders.length ? v.revisions.length : <span className="font-sans">no renders</span>}
                </span>
              </button>
              {canEdit && <RowMenu label={v.slug} onDelete={() => props.onDeleteVideo(v)} />}
            </div>
            <CollapsibleContent>
              <div className="flex flex-col gap-0.5 pt-1">
                {renders.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No renders yet</p>}
                {renders.map(([dir, f]) => {
                  const active = current && item?.type === "render" && item.dir === dir && item.name === f.name;
                  return (
                    <div key={dir + f.name}
                      className={cn("group flex items-center rounded-[7px] pr-1 hover:bg-white/[0.04]", active && "bg-selected shadow-[inset_2px_0_0_var(--color-brand)] hover:bg-selected")}>
                      <button className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left" onClick={() => onSelect(v.slug, { type: "render", dir, name: f.name })}>
                        <span className={cn("grid h-[26px] w-11 shrink-0 place-items-center rounded bg-[#232326] text-faint", active && "bg-[#2E2A22]")}>
                          <FilmIcon className="size-3" />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          {dir === "final"
                            ? <span className="truncate font-semibold">{f.name}</span>
                            : <span className={cn("truncate font-mono text-[13px]", active ? "text-foreground" : "text-[#DADADE]")}>{stripExt(f.name)}</span>}
                          <span className="truncate text-xs text-faint">{dir === "final" ? "final · " : ""}{fmtDate(f.mtime)} · {fmtSize(f.size)}</span>
                        </span>
                      </button>
                      {canEdit && <RowMenu label={f.name} onDelete={() => props.onDeleteRender(v, dir, f)} />}
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {project.characters.length > 0 && (
        <>
          <div className="pt-4"><Label>Characters · {project.characters.length}</Label></div>
          {project.characters.flatMap((c) => c.svgs.map((s) => {
            const active = item?.type === "character" && item.char === c.name && item.name === s.name;
            return (
              <button key={c.name + s.name} onClick={() => onSelect(undefined, { type: "character", char: c.name, name: s.name })}
                className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.04]", active && "bg-selected shadow-[inset_2px_0_0_var(--color-brand)]")}>
                <PenToolIcon className="size-4 shrink-0 text-faint" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block text-xs text-faint">{c.name} · {plural(c.docs.length, "doc")}</span>
                </span>
              </button>
            );
          }))}
        </>
      )}
    </nav>
  );
}
