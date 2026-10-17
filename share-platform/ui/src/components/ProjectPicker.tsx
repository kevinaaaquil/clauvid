import { useRef, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, FolderIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { plural } from "@/lib/format";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Project switcher. With no projects it collapses to a plain "New project" button. */
export function ProjectPicker({ projects, current, canEdit, onPick, onNew, onDelete }: {
  projects: Project[]; current?: string; canEdit: boolean; onPick: (slug: string) => void; onNew: () => void;
  onDelete: (p: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  // Set while the row's trash button is pressed, so the row itself doesn't also switch project.
  const deleting = useRef(false);
  if (!projects.length) {
    return canEdit ? <Button className="h-10 px-3.5 font-semibold" onClick={onNew}><PlusIcon />New project</Button> : null;
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button aria-label="Project"
          className="flex h-10 max-w-80 min-w-40 items-center gap-2.5 rounded-lg border bg-popover pr-2.5 pl-3 text-[15px] font-semibold outline-none hover:bg-raised focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:bg-raised max-md:min-w-0 max-md:flex-1">
          <FolderIcon className="size-4 shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate text-left">{current}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 text-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-72 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">Projects</DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem key={p.slug} onSelect={(e) => { if (deleting.current) { e.preventDefault(); return; } onPick(p.slug); }}
            className={cn("gap-2.5 rounded-lg px-2 py-2", p.slug === current && "bg-selected")}>
            <FolderIcon className={cn("text-faint", p.slug === current && "text-brand")} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.slug}</span>
              <span className="block text-xs text-muted-foreground">{plural(p.videos.length, "video")}</span>
            </span>
            {p.slug === current && <CheckIcon className="text-brand" />}
            {canEdit && (
              <button type="button" aria-label={`Delete ${p.slug}`} title={`Delete ${p.slug}`}
                className="-my-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-md text-faint hover:bg-destructive/15 hover:text-destructive focus-visible:bg-destructive/15 focus-visible:text-destructive focus-visible:outline-none"
                onPointerDown={() => { deleting.current = true; }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") deleting.current = true; }}
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  setOpen(false);
                  setTimeout(() => { deleting.current = false; }, 0);
                  onDelete(p);
                }}>
                <Trash2Icon className="size-4" />
              </button>
            )}
          </DropdownMenuItem>
        ))}
        {canEdit && (
          <>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem onSelect={onNew} className="gap-2.5 rounded-lg px-2 py-2 font-medium">
              <span className="grid size-5 place-items-center rounded-md bg-brand-soft text-brand"><PlusIcon className="size-3.5" /></span>
              New project
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
