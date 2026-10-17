import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Extension } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Markdown as MarkdownExt } from "tiptap-markdown";
import {
  BoldIcon, CheckIcon, ItalicIcon, ListIcon, MessageSquarePlusIcon,
  PencilIcon, PlusIcon, Redo2Icon, Trash2Icon, ScissorsLineDashedIcon, ScrollTextIcon, SaveIcon, Undo2Icon,
  CopyPlusIcon, LockIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errorText } from "@/lib/api";
import type { Asset, Comment, ScriptInfo } from "@/lib/types";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CommentsPanel } from "./CommentsPanel";
import { Recorder } from "./Recorder";
import { Takes, nextTakeName } from "./Takes";
import { ScriptSwitcher } from "./ScriptSwitcher";
import { ScriptContextMenu } from "./ScriptContextMenu";
import { EmptyState } from "./EmptyState";
import type { DeleteRequest } from "./DeleteDialog";

// ---- comment highlighting -------------------------------------------------

/** Locate quote in the document's text (blocks joined by "\n"), as a PM range. */
export function findQuote(doc: PMNode, quote: string): { from: number; to: number } | null {
  if (!quote) return null;
  let text = "";
  const pos: number[] = [];
  doc.descendants((node, p) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) pos.push(p + i);
      text += node.text;
    } else if (node.isBlock && text.length) { text += "\n"; pos.push(-1); }
    return true;
  });
  const i = text.indexOf(quote);
  if (i < 0) return null;
  const from = pos[i], last = pos[i + quote.length - 1];
  return from >= 0 && last >= 0 ? { from, to: last + 1 } : null;
}

const commentKey = new PluginKey("comments");
type HL = { comments: Comment[]; active: string | null; onClick: (id: string) => void };

function commentHighlights(get: () => HL) {
  return Extension.create({
    name: "commentHighlights",
    addProseMirrorPlugins() {
      return [new Plugin({
        key: commentKey,
        props: {
          decorations(state) {
            const { comments, active } = get();
            const decos = comments.filter((c) => !c.resolved).flatMap((c) => {
              const r = findQuote(state.doc, c.quote);
              return r ? [Decoration.inline(r.from, r.to, { class: cn("comment-hl", c.id === active && "active"), "data-comment": c.id })] : [];
            });
            return DecorationSet.create(state.doc, decos);
          },
          handleClick(_view, _pos, event) {
            const el = (event.target as HTMLElement).closest<HTMLElement>("[data-comment]");
            if (el?.dataset.comment) get().onClick(el.dataset.comment);
            return false;
          },
        },
      })];
    },
  });
}

const getMarkdown = (e: Editor) => (e.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();

// ---- toolbar --------------------------------------------------------------

function Tool({ label, icon, onClick, active, disabled }: { label: string; icon: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={active} disabled={disabled}
          onMouseDown={(e) => e.preventDefault()} onClick={onClick} className={cn("text-[#C9C9CE]", active && "bg-[#2A2A2E] text-foreground")}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"), italic: e.isActive("italic"), list: e.isActive("bulletList"),
      undo: e.can().undo(), redo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <Tool label="Bold (⌘B)" icon={<BoldIcon />} active={s.bold} onClick={() => c().toggleBold().run()} />
      <Tool label="Italic (⌘I)" icon={<ItalicIcon />} active={s.italic} onClick={() => c().toggleItalic().run()} />
      <Tool label="Bullet list" icon={<ListIcon />} active={s.list} onClick={() => c().toggleBulletList().run()} />
      <Tool label="Page break" icon={<ScissorsLineDashedIcon />} onClick={() => c().setHorizontalRule().run()} />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Tool label="Undo (⌘Z)" icon={<Undo2Icon />} disabled={!s.undo} onClick={() => c().undo().run()} />
      <Tool label="Redo (⇧⌘Z)" icon={<Redo2Icon />} disabled={!s.redo} onClick={() => c().redo().run()} />
    </div>
  );
}

// ---- tab ------------------------------------------------------------------

export function ScriptTab({ project, video, canEdit, onDirtyChange, askDelete, onChanged, open }: {
  project: string; video: string; canEdit: boolean; onChanged: () => void;
  /** Switch to this script (and highlight this take), e.g. from the Video tab. `n` changes per request. */
  open?: { script: string | null; take: string | null; n: number } | null;
  onDirtyChange: (dirty: boolean) => void;
  askDelete: (r: DeleteRequest) => void;
}) {
  const [scripts, setScripts] = useState<ScriptInfo[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [original, setOriginal] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ quote: string; note: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [takes, setTakes] = useState<Asset[]>([]);
  const loadTakes = useCallback(() => {
    api.assets(project, video).then((a) => setTakes(a.assets.filter((x) => x.kind === "audio"))).catch(() => {});
  }, [project, video]);
  useEffect(() => { loadTakes(); }, [loadTakes]);

  const hl = useRef<HL>({ comments: [], active: null, onClick: () => {} });
  hl.current = { comments, active, onClick: (id) => setActive(id) };
  const extensions = useMemo(() => [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
    TableKit,
    MarkdownExt.configure({ html: false, tightLists: true, bulletListMarker: "-", linkify: false, breaks: false, transformPastedText: true }),
    commentHighlights(() => hl.current),
  ], []);

  const editor = useEditor({
    extensions,
    editable: false,
    content: "",
    editorProps: { attributes: { class: "script md", "aria-label": "Script" } },
    onUpdate: ({ transaction }) => { if (transaction.docChanged) setDirty(true); },
  });

  const loadList = useCallback(async (prefer?: string | null) => {
    const list = await api.scripts(project, video).catch((e) => { toast.error(errorText(e)); return [] as ScriptInfo[]; });
    setScripts(list);
    setCurrent((cur) => (prefer && list.some((s) => s.name === prefer) ? prefer
      : cur && list.some((s) => s.name === cur) ? cur : list[0]?.name ?? null));
    return list;
  }, [project, video]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (!open) return;
    if (open.take) setFresh(open.take);
    if (!open.script || open.script === current) return;
    if (dirty) { toast("Save or discard your edits first", { description: `Then open ${open.script}.md` }); return; }
    loadList(open.script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.n]);
  // New script: script.md, then script_v2.md, … created at once and opened for editing.
  const newScript = async () => {
    try {
      const s = await api.createScript(project, video);
      await loadList(s.name);
      setEditing(true);
      toast.success(`Created ${s.name}.md`);
      onChanged();
    } catch (e) { toast.error(errorText(e)); }
  };
  // A new version: a copy of the open (usually locked) script, opened for editing.
  const newVersion = async () => {
    if (!current) return;
    try {
      const s = await api.createScript(project, video, current);
      await loadList(s.name);
      setEditing(true);
      toast.success(`Created ${s.name}.md from ${current}.md`);
      onChanged();
    } catch (e) { toast.error(errorText(e)); }
  };
  const [renaming, setRenaming] = useState<{ from: string; to: string; error?: string } | null>(null);
  const renameScript = async () => {
    if (!renaming) return;
    try {
      const s = await api.renameScript(project, video, renaming.from, renaming.to);
      setRenaming(null);
      await loadList(s.name);
      toast.success(`Renamed to ${s.name}.md`);
    } catch (e) { setRenaming((r) => (r ? { ...r, error: errorText(e) } : r)); }
  };

  // Load the open script (or reload when it changes).
  useEffect(() => {
    if (!current || !editor) return;
    let live = true;
    setLoaded(false); setDirty(false); setActive(null);
    api.script(project, video, current).then((s) => {
      if (!live) return;
      setOriginal(s.markdown); setComments(s.comments); setLoaded(true);
      editor.commands.setContent(s.markdown, { emitUpdate: false });
    }).catch((e) => toast.error(errorText(e)));
    return () => { live = false; };
  }, [project, video, current, editor]);

  useEffect(() => { editor?.setEditable(editing); }, [editor, editing]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  // Redraw highlights when comments or the active one change.
  useEffect(() => { if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(commentKey, true)); }, [editor, comments, active]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const persist = useCallback(async (markdown: string, next: Comment[]) => {
    if (!current) throw new Error("no script");
    const s = await api.saveScript(project, video, current, { markdown, comments: next });
    setOriginal(s.markdown); setComments(s.comments);
    onChanged(); loadList();
    return s;
  }, [project, video, current, onChanged, loadList]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!editor) return false;
    setSaving(true);
    try {
      // Unchanged text is written back byte-for-byte rather than re-serialised.
      await persist(dirty ? getMarkdown(editor) : original, comments);
      setDirty(false);
      toast.success("Script saved");
      return true;
    } catch (e) { toast.error(errorText(e)); return false; } finally { setSaving(false); }
  }, [editor, dirty, original, comments, persist]);

  // Done saves first (only if something changed), then leaves edit mode; a failed save stays in edit mode.
  const finishOrEdit = async () => {
    if (!editing) { setEditing(true); return; }
    if (dirty && !(await save())) return;
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, save]);

  // Comments are saved against the last saved text, so they never sneak unsaved edits to disk.
  const updateComments = async (next: Comment[], ok: string) => {
    const prev = comments;
    setComments(next);
    try { await persist(original, next); toast.success(ok); }
    catch (e) { setComments(prev); toast.error(errorText(e)); }
  };

  const startComment = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const quote = (editor.state.doc.textBetween(from, to, "\n") || window.getSelection()?.toString() || "").trim();
    if (!quote) { toast("Select some text first"); return; }
    setDraft({ quote: quote.slice(0, 2000), note: "" });
  };
  const addComment = async () => {
    if (!draft?.note.trim()) return;
    const c: Comment = { id: crypto.randomUUID(), quote: draft.quote, note: draft.note.trim(), createdAt: Date.now(), resolved: false };
    setDraft(null);
    await updateComments([...comments, c], "Comment added");
    setActive(c.id);
  };

  const focusComment = (c: Comment) => {
    setActive(c.id);
    if (!editor) return;
    const r = findQuote(editor.state.doc, c.quote);
    if (r) {
      editor.commands.setTextSelection(r);
      editor.view.domAtPos(r.from).node.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const missing = useMemo(() => {
    if (!editor) return new Set<string>();
    return new Set(comments.filter((c) => !findQuote(editor.state.doc, c.quote)).map((c) => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, comments, original, dirty]);

  const deleteScript = (s: ScriptInfo) => askDelete({
    label: `${s.name}.md`, summary: `Script${s.openComments ? ` and ${plural(s.openComments, "open comment")}` : ""}. Its comments go with it; recorded takes stay in assets.`,
    run: async () => {
      try {
        await api.del({ project, video, dir: "scripts", name: `${s.name}.md` });
        toast.success(`Deleted ${s.name}.md`);
        if (s.name === current) { setEditing(false); setDirty(false); }
        await loadList(); onChanged();
      } catch (e) { toast.error(errorText(e)); throw e; }
    },
  });

  const skeleton = <div className="mx-auto max-w-3xl space-y-3"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-40 w-full" /></div>;
  if (!scripts || !editor) return skeleton;
  if (!current) return (
    <EmptyState icon={<ScrollTextIcon />} title="No script yet"
      action={canEdit && <Button className="font-semibold" onClick={newScript}><PlusIcon />New script</Button>}>
      {canEdit ? "Write the voiceover script here, then record takes against it." : "Nothing has been written for this video yet."}
    </EmptyState>
  );
  if (!loaded) return skeleton;
  // Drafts were built from this script: its text is frozen; takes, comments and new versions still work.
  const lockedBy = scripts.find((s) => s.name === current)?.lockedBy ?? [];
  const locked = lockedBy.length > 0;

  return (
    <div className="mx-auto flex max-w-6xl gap-6 lg:h-[calc(100dvh-196px)] lg:min-h-[360px] max-lg:flex-col">
      <div className="flex min-w-0 flex-1 flex-col">
        {recording ? (
          <div className="mb-3 shrink-0">
            <Recorder project={project} video={video} name={nextTakeName(takes, current)}
              onClose={() => setRecording(false)} onSaved={(f) => { setFresh(f); loadTakes(); onChanged(); }} />
          </div>
        ) : (
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1 rounded-[10px] border bg-card p-1.5">
          <ScriptSwitcher scripts={scripts} current={current} canEdit={canEdit} locked={dirty}
            onPick={(n) => { setEditing(false); setCurrent(n); }} onNew={newScript}
            onRename={(s) => setRenaming({ from: s.name, to: s.name })} />
          {locked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex h-[26px] items-center gap-1.5 rounded-md bg-brand-soft px-2 text-xs font-medium text-brand">
                  <LockIcon className="size-3" />Locked<span className="max-md:hidden">· {lockedBy.join(", ")}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">Used by {lockedBy.join(", ")}, so its text can't change. Record new takes, comment, or make a new version.</TooltipContent>
            </Tooltip>
          )}
          {canEdit && !editing && !locked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${current}.md`} disabled={dirty}
                  className="size-[34px] text-faint hover:bg-destructive/15 hover:text-destructive dark:hover:bg-destructive/15"
                  onClick={() => { const s = scripts.find((x) => x.name === current); if (s) deleteScript(s); }}>
                  <Trash2Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete {current}.md</TooltipContent>
            </Tooltip>
          )}
          {!canEdit && <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">Read-only</span>}
          {editing && <><Separator orientation="vertical" className="mx-0.5 h-5" /><Toolbar editor={editor} /></>}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {canEdit && (editing ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Comment" className="size-[34px] border-border bg-raised dark:bg-raised" onClick={startComment}>
                    <MessageSquarePlusIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Comment on selection</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="outline" className="h-[34px] border-border bg-raised dark:bg-raised" onClick={startComment}>
                <MessageSquarePlusIcon />Comment
              </Button>
            ))}
            {canEdit && locked && !editing && (
              <Button variant="outline" className="h-[34px] border-border bg-raised dark:bg-raised dark:hover:bg-[#232326]" onClick={newVersion}
                title={`Copy ${current}.md into a new script you can edit`}>
                <CopyPlusIcon />New version
              </Button>
            )}
            {canEdit && (!locked || editing) && (
              <Button variant="outline" className="h-[34px] border-border bg-raised dark:bg-raised dark:hover:bg-[#232326]" disabled={saving} onClick={finishOrEdit}
                aria-label={editing ? "Done" : "Edit"} title={editing ? "Done (saves changes)" : undefined}>
                {editing ? <><CheckIcon /><span className="max-xl:hidden">Done</span></> : <><PencilIcon />Edit</>}
              </Button>
            )}
            {canEdit && editing && (
              <Button className="relative h-[34px] px-3.5 font-semibold max-xl:px-2.5" onClick={save} disabled={saving} aria-label="Save" title={dirty ? "Save · unsaved changes" : "Save"}>
                <SaveIcon /><span className="max-xl:hidden">{saving ? "Saving…" : "Save"}</span>
                {dirty && <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-card bg-brand" aria-label="Unsaved changes" />}
              </Button>
            )}
            {canEdit && !editing && (
              <Button variant="outline" onClick={() => setRecording(true)}
                className="h-[34px] border-[#F87171]/35 bg-[#DC2626]/12 font-semibold text-[#FCA5A5] hover:bg-[#DC2626]/20 hover:text-[#FCA5A5] dark:border-[#F87171]/35 dark:bg-[#DC2626]/12 dark:hover:bg-[#DC2626]/20">
                <span className="size-2.5 rounded-full bg-[#F87171]" />Record
              </Button>
            )}
          </div>
        </div>
        )}

        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[14px] border bg-card px-10 py-6 max-lg:px-8 max-md:px-5 max-md:py-5", editing && "border-brand/40")}>
          <ScriptContextMenu editor={editor} canEdit={canEdit} canFormat={canEdit && !locked} editing={editing} startEditing={() => setEditing(true)} onComment={startComment}>
            <div><EditorContent editor={editor} /></div>
          </ScriptContextMenu>
        </div>
      </div>

      {(
        <div className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto max-xl:w-64 overscroll-contain pr-1 max-lg:w-full max-lg:overflow-visible">
          <Takes project={project} video={video} takes={takes} canEdit={canEdit} askDelete={askDelete} fresh={fresh}
            onChanged={() => { loadTakes(); onChanged(); }} />
          {<CommentsPanel comments={comments} active={active} missing={missing} canEdit={canEdit}
          onFocus={focusComment}
          onToggle={(c) => updateComments(comments.map((x) => (x.id === c.id ? { ...x, resolved: !x.resolved } : x)), c.resolved ? "Reopened" : "Resolved")}
          onDelete={(c) => askDelete({
            label: "this comment", summary: `“${c.note.slice(0, 80)}”`, permanent: true,
            run: () => updateComments(comments.filter((x) => x.id !== c.id), "Comment deleted"),
          })} />}
        </div>
      )}

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="gap-5 rounded-2xl p-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename script</DialogTitle>
            <DialogDescription>Its comments move with it. Takes already recorded keep their names.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); renameScript(); }}>
            <div className="flex items-center gap-2">
              <Input autoFocus value={renaming?.to ?? ""} aria-label="Script name" className="h-[42px] bg-header font-mono"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setRenaming((r) => (r ? { ...r, to: e.target.value, error: undefined } : r))} />
              <span className="font-mono text-sm text-faint">.md</span>
            </div>
            {renaming?.error && <p className="text-sm text-destructive">{renaming.error}</p>}
            <DialogFooter className="mt-3">
              <Button type="button" variant="outline" className="h-[38px]" onClick={() => setRenaming(null)}>Cancel</Button>
              <Button type="submit" className="h-[38px] px-4 font-semibold" disabled={!renaming?.to.trim()}>Rename</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add comment</DialogTitle>
            <DialogDescription className="line-clamp-3 italic">“{draft?.quote}”</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus rows={4} placeholder="Your note…" value={draft?.note ?? ""}
            onChange={(e) => setDraft((d) => (d ? { ...d, note: e.target.value } : d))}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addComment(); }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={addComment} disabled={!draft?.note.trim()}>Comment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
