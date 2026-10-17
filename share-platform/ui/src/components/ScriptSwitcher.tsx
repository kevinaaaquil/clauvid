import { useRef, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, LockIcon, PencilIcon, PlusIcon, ScrollTextIcon } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { plural } from "@/lib/format";
import type { ScriptInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Picks which of the video's scripts is open; same shape as the project picker. */
export function ScriptSwitcher({ scripts, current, canEdit, locked, onPick, onNew, onRename }: {
  scripts: ScriptInfo[]; current: string; canEdit: boolean; locked: boolean;
  onPick: (name: string) => void; onNew: () => void; onRename: (s: ScriptInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const deleting = useRef(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={locked}>
        <button title={locked ? "Save or discard changes to switch script" : undefined}
          className="flex h-[34px] max-w-64 max-xl:max-w-40 items-center gap-2 rounded-md px-2 text-sm font-medium outline-none hover:bg-raised focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:bg-raised">
          <ScrollTextIcon className="size-4 shrink-0 text-faint" />
          <span className="truncate">{current}.md</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 text-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-72 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">Scripts</DropdownMenuLabel>
        {scripts.map((s) => (
          <DropdownMenuItem key={s.name} onSelect={(e) => { if (deleting.current) { e.preventDefault(); return; } onPick(s.name); }}
            className={cn("gap-2.5 rounded-lg px-2 py-2", s.name === current && "bg-selected")}>
            <ScrollTextIcon className={cn("text-faint", s.name === current && "text-brand")} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[13px]">{s.name}.md</span>
              {(s.openComments > 0 || !!s.lockedBy?.length) && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {!!s.lockedBy?.length && <><LockIcon className="size-3" />Used by {s.lockedBy.join(", ")}</>}
                  {!!s.lockedBy?.length && s.openComments > 0 && " · "}
                  {s.openComments > 0 && plural(s.openComments, "open comment")}
                </span>
              )}
            </span>
            {s.name === current && <CheckIcon className="text-brand" />}
            {canEdit && !s.lockedBy?.length && (
              <button type="button" aria-label={`Rename ${s.name}.md`} title={`Rename ${s.name}.md`}
                className="-my-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-md text-faint hover:bg-raised hover:text-foreground focus-visible:bg-raised focus-visible:outline-none"
                onPointerDown={() => { deleting.current = true; }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") deleting.current = true; }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); setTimeout(() => { deleting.current = false; }, 0); onRename(s); }}>
                <PencilIcon className="size-3.5" />
              </button>
            )}
          </DropdownMenuItem>
        ))}
        {canEdit && (
          <>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem onSelect={onNew} className="gap-2.5 rounded-lg px-2 py-2 font-medium">
              <span className="grid size-5 place-items-center rounded-md bg-brand-soft text-brand"><PlusIcon className="size-3.5" /></span>
              New script
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
