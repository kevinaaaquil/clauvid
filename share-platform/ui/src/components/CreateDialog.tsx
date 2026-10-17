import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorText } from "@/lib/api";

/** "Things Explained!" → "things-explained" (the server's slug rule). */
export const toSlug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

export type CreateKind = { kind: "project" } | { kind: "video"; project: string };

const COPY = {
  project: { title: "New project", desc: "A series or channel. Each video in it gets its own folder.", placeholder: "Things Explained", button: "Create project" },
  video: { title: "New video", desc: "Gets its own folders for assets, references, script and drafts, so you can upload straight away.", placeholder: "Black Holes", button: "Create video" },
};

/** Name a new project or video; the folder name is derived live from what's typed. */
export function CreateDialog({ target, onClose, onCreated }: {
  target: CreateKind | null; onClose: () => void; onCreated: (slug: string) => void;
}) {
  const open = !!target;
  const copy = COPY[target?.kind ?? "project"];
  const prefix = target?.kind === "video" ? `projects/${target.project}/videos/` : "projects/";
  const suffix = "/";
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(""); setError(null); } }, [open]);
  const slug = toSlug(name);

  const create = async () => {
    if (!slug || busy) return;
    setBusy(true); setError(null);
    try {
      if (target?.kind === "video") await api.createVideo(target.project, slug);
      else await api.createProject(slug);
      toast.success(`Created ${slug}`);
      onClose();
      onCreated(slug);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-5 rounded-2xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{copy.title}</DialogTitle>
          <DialogDescription>{copy.desc}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <label htmlFor="create-name" className="text-sm font-medium">Name</label>
          <Input id="create-name" autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder={copy.placeholder} className="h-[42px] bg-header" aria-invalid={!!error} />
          <p className="text-xs text-muted-foreground">
            {slug ? <>Folder: <span className="font-mono text-foreground [overflow-wrap:anywhere]">{prefix}{slug}{suffix}</span></> : "Letters, numbers and dashes."}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-3">
            <Button type="button" variant="outline" className="h-[38px]" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="h-[38px] px-4 font-semibold" disabled={!slug || busy}>{busy ? "Creating…" : copy.button}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
