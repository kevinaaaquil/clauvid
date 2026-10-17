import { CheckCircle2Icon, MessageSquareIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import type { Comment } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CommentsPanel({ comments, active, missing, canEdit, onFocus, onToggle, onDelete }: {
  comments: Comment[]; active: string | null; missing: Set<string>; canEdit: boolean;
  onFocus: (c: Comment) => void; onToggle: (c: Comment) => void; onDelete: (c: Comment) => void;
}) {
  const open = comments.filter((c) => !c.resolved), done = comments.filter((c) => c.resolved);
  const card = (c: Comment) => (
    <div key={c.id} onClick={() => onFocus(c)}
      className={cn("cursor-pointer rounded-xl border bg-card p-3.5 text-sm transition-colors hover:border-brand/50",
        c.id === active && "border-brand bg-[#1A1814]", c.resolved && "opacity-60")}>
      <p className="mb-2 line-clamp-2 text-xs text-muted-foreground italic">“{c.quote}”</p>
      <p className="leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{c.note}</p>
      <div className="mt-2.5 flex items-center gap-1 text-xs text-faint">
        <span>{fmtDate(c.createdAt)}</span>
        {missing.has(c.id) && <Badge variant="outline" className="ml-1 h-4 border-amber-500/40 px-1 text-[10px] text-amber-400">text changed</Badge>}
        {canEdit && (
          <span className="ml-auto flex gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon-xs" aria-label={c.resolved ? "Reopen" : "Resolve"} onClick={() => onToggle(c)}>
              {c.resolved ? <RotateCcwIcon /> : <CheckCircle2Icon />}
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={() => onDelete(c)}><Trash2Icon /></Button>
          </span>
        )}
      </div>
    </div>
  );
  return (
    <aside>
      <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
        <MessageSquareIcon className="size-3.5" />Comments · {open.length}
      </h3>
      <div className="flex flex-col gap-2">
        {open.length === 0 && (
          <p className="rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground">
            {canEdit ? "Select text in the script, then click Comment." : "No comments."}
          </p>
        )}
        {open.map(card)}
        {done.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">Resolved ({done.length})</summary>
            <div className="mt-2 flex flex-col gap-2">{done.map(card)}</div>
          </details>
        )}
      </div>
    </aside>
  );
}
