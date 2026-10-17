import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon, FileIcon, FilmIcon, FolderIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorText } from "@/lib/api";
import { fmtDate, fmtSize, plural } from "@/lib/format";
import type { TrashItem } from "@/lib/types";
import type { DeleteRequest } from "./DeleteDialog";
import { EmptyState } from "./EmptyState";

const ICON = { file: <FileIcon />, video: <FilmIcon />, project: <FolderIcon /> };

export function TrashView({ canEdit, askDelete, onBack, onChanged }: {
  canEdit: boolean; askDelete: (r: DeleteRequest) => void; onBack: () => void; onChanged: () => void;
}) {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const load = useCallback(() => api.trash().then(setItems).catch((e) => toast.error(errorText(e))), []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); } catch (e) { toast.error(errorText(e)); throw e; } finally { load(); onChanged(); }
  };
  const total = items?.reduce((s, i) => s + i.size, 0) ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeftIcon />Back</Button>
        <h2 className="text-lg font-semibold">Trash</h2>
        {items && <span className="text-sm text-muted-foreground">{plural(items.length, "item")}{items.length ? ` · ${fmtSize(total)}` : ""}</span>}
        {canEdit && !!items?.length && (
          <Button variant="destructive" size="sm" className="ml-auto" onClick={() => askDelete({
            label: "everything in Trash", summary: `${plural(items.length, "item")} · ${fmtSize(total)} will be freed.`,
            confirmText: "empty trash", permanent: true,
            run: () => act(() => api.purge("all"), `Freed ${fmtSize(total)}`),
          })}><Trash2Icon />Empty trash</Button>
        )}
      </div>
      {!items ? <Skeleton className="h-32" /> : items.length === 0 ? (
        <EmptyState icon={<Trash2Icon />} title="Trash is empty">Deleted drafts, assets, videos and projects land here first.</EmptyState>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {items.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="text-muted-foreground [&_svg]:size-4">{ICON[i.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {i.name}
                  {!!i.with?.length && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground" title={i.with.join("\n")}>
                      + {plural(i.with.length, "related file")}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {i.kind} · {i.original} · {fmtSize(i.size)} · deleted {fmtDate(i.deletedAt)}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => act(() => api.restore(i.id), `Restored ${i.name}`).catch(() => {})}>
                    <RotateCcwIcon />Restore
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => askDelete({
                    label: i.name, summary: `${i.kind} · ${fmtSize(i.size)}`, permanent: true,
                    confirmText: i.name,
                    run: () => act(() => api.purge(i.id), `Deleted ${i.name} forever`),
                  })}>Delete forever</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
