import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpenIcon, ImagesIcon, MenuIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlayIcon, PlusIcon, RefreshCwIcon, ScrollTextIcon, Trash2Icon, VideoIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, charUrl, errorText } from "@/lib/api";
import { fmtSize, plural } from "@/lib/format";
import type { FileInfo, Item, Project, Tab, Video } from "@/lib/types";
import { linkFor, readLink, revKey } from "@/lib/url";
import { AssetsTab } from "@/components/AssetsTab";
import { DeleteDialog, type DeleteRequest } from "@/components/DeleteDialog";
import { DocsList } from "@/components/DocsList";
import { EmptyState } from "@/components/EmptyState";
import { Sidebar } from "@/components/Sidebar";
import { TrashView } from "@/components/TrashView";
import { ProjectPicker } from "@/components/ProjectPicker";
import { CreateDialog, type CreateKind } from "@/components/CreateDialog";
import { VideoTab, rendersOf } from "@/components/VideoTab";

// The editor (Tiptap) is the heaviest part, so it loads only when the Script tab is used.
const ScriptTab = lazy(() => import("@/components/ScriptTab").then((m) => ({ default: m.ScriptTab })));

const STORE = "clauvid.project";
const remember = (slug?: string) => { try { if (slug) localStorage.setItem(STORE, slug); return localStorage.getItem(STORE); } catch { return null; } };

type Sel = { project?: string; video?: string; item: Item | null };

/** Resolve a (possibly stale) selection against fresh data. */
function resolve(projects: Project[], want: { project?: string; video?: string; rev?: string }): Sel {
  const p = projects.find((x) => x.slug === want.project) ?? projects.find((x) => x.slug === remember()) ?? projects[0];
  if (!p) return { item: null };
  if (want.rev?.startsWith("char-")) {
    for (const c of p.characters) for (const s of c.svgs) {
      const it: Item = { type: "character", char: c.name, name: s.name };
      if (revKey(it) === want.rev) return { project: p.slug, item: it };
    }
  }
  const v = p.videos.find((x) => x.slug === want.video) ?? p.videos[0];
  if (!v) return { project: p.slug, item: null };
  const renders = rendersOf(v);
  const item = renders.find((it) => revKey(it) === want.rev || (it.type === "render" && it.name.toLowerCase() === want.rev)) ?? renders[0] ?? null;
  return { project: p.slug, video: v.slug, item };
}

const sizeOfRenders = (v: Video) => [...v.final, ...v.revisions].reduce((s, f) => s + f.size, 0);
const videoSummary = (v: Video) => [
  plural(v.revisions.length, "draft"), v.final.length ? "1 final" : null, plural(v.assetCount, "asset"), v.scripts ? plural(v.scripts, "script") : null,
].filter(Boolean).join(", ") + ` · ${fmtSize(sizeOfRenders(v))} of renders`;

export default function App() {
  const link = useMemo(readLink, []);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [sel, setSel] = useState<Sel>({ item: null });
  const [tab, setTab] = useState<Tab>(link.tab ?? "video");
  const [view, setView] = useState<"main" | "trash">("main");
  const [startAt, setStartAt] = useState(link.t);
  const [menuOpen, setMenuOpen] = useState(false);
  // Desktop sidebar, remembered per browser. Phones use the drawer instead.
  const [sideOpen, setSideOpen] = useState(() => { try { return localStorage.getItem("clauvid.side") !== "closed"; } catch { return true; } });
  const toggleSide = useCallback(() => setSideOpen((o) => {
    try { localStorage.setItem("clauvid.side", o ? "closed" : "open"); } catch { /* storage blocked */ }
    return !o;
  }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); toggleSide(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSide]);
  const [creating, setCreating] = useState<CreateKind | null>(null);
  const [deleteReq, setDeleteReq] = useState<DeleteRequest | null>(null);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const dirty = useRef(false);
  const [seenScript, setSeenScript] = useState(link.tab === "script");
  const [openScript, setOpenScript] = useState<{ script: string | null; take: string | null; n: number } | null>(null);
  useEffect(() => { if (tab === "script") setSeenScript(true); }, [tab]);
  const selRef = useRef(sel);
  selRef.current = sel;

  const refresh = useCallback(async (want?: Partial<Sel> & { rev?: string }) => {
    try {
      const list = await api.projects();
      setProjects(list);
      const cur = selRef.current;
      setSel(resolve(list, {
        project: want?.project ?? cur.project, video: want?.video ?? cur.video,
        rev: want?.rev ?? (cur.item ? revKey(cur.item) : undefined),
      }));
    } catch (e) { toast.error(errorText(e)); setProjects((p) => p ?? []); }
  }, []);

  useEffect(() => {
    refresh({ project: link.project, video: link.video, rev: link.rev });
    api.whoami().then((r) => setCanEdit(r.canEdit)).catch(() => setCanEdit(false));
  }, [refresh, link]);

  const project = projects?.find((p) => p.slug === sel.project);
  const video = project?.videos.find((v) => v.slug === sel.video);

  useEffect(() => {
    if (!sel.project) return;
    remember(sel.project);
    history.replaceState(null, "", linkFor(sel.project, sel.video, sel.item, tab));
  }, [sel, tab]);

  // Leaving the script with unsaved edits asks first.
  const guard = (fn: () => void) => (dirty.current ? setPendingNav(() => fn) : fn());
  const select = (s: Sel, nextTab?: Tab) => guard(() => {
    setSel(s); setStartAt(undefined); setView("main"); setMenuOpen(false);
    if (nextTab) setTab(nextTab);
    else if (s.item?.type === "character") setTab("video");
  });
  const pickVideo = (videoSlug: string | undefined, item: Item | null) => {
    if (!project) return;
    const v = project.videos.find((x) => x.slug === videoSlug);
    select({ project: project.slug, video: videoSlug, item: item ?? (v ? rendersOf(v)[0] ?? null : null) }, videoSlug !== sel.video && item === null ? "video" : undefined);
  };

  const ask = (r: DeleteRequest) => setDeleteReq(r);
  const onDirty = useCallback((d: boolean) => { dirty.current = d; }, []);
  const refreshQuiet = useCallback(() => { refresh(); }, [refresh]);
  const run = (fn: () => Promise<unknown>, ok: string) => async () => {
    try { await fn(); toast.success(ok); } catch (e) { toast.error(errorText(e)); throw e; } finally { await refresh(); }
  };
  const deleteProject = (p: Project) => ask({
    label: p.slug, confirmText: p.slug,
    summary: `${plural(p.videos.length, "video")}, ${plural(p.videos.reduce((s, v) => s + v.revisions.length, 0), "draft")} · ${fmtSize(p.videos.reduce((s, v) => s + sizeOfRenders(v), 0))} of renders`,
    run: run(() => api.del({ project: p.slug }), `Deleted ${p.slug}`),
  });
  const deleteVideo = (v: Video) => project && ask({
    label: v.slug, summary: videoSummary(v),
    run: run(() => api.del({ project: project.slug, video: v.slug }), `Deleted ${v.slug}`),
  });
  const deleteRender = (v: Video, dir: "final" | "revisions", f: FileInfo) => project && ask({
    label: f.name, summary: `1 file · ${fmtSize(f.size)}. Its note, render copy and frozen source go to Trash with it.`,
    run: run(() => api.del({ project: project.slug, video: v.slug, dir, name: f.name }), `Deleted ${f.name}`),
  });

  const sidebar = project && (
    <Sidebar project={project} video={sel.video} item={sel.item} canEdit={canEdit}
      onNewVideo={() => setCreating({ kind: "video", project: project.slug })}
      onSelect={pickVideo} onDeleteVideo={deleteVideo} onDeleteRender={deleteRender} />
  );

  let main: React.ReactNode;
  if (!projects) main = null;
  else if (view === "trash") main = <TrashView canEdit={canEdit} askDelete={ask} onBack={() => setView("main")} onChanged={() => refresh()} />;
  else if (!project) main = (
    <EmptyState icon={<PlayIcon />} title="No projects yet" action={
      <Button variant="outline" onClick={() => refresh()}><RefreshCwIcon />Check again</Button>}>
      Start one with <span className="font-medium text-foreground">New project</span> at the top. A project is a series or channel; each video in it gets its own workspace.
    </EmptyState>
  );
  else if (sel.item?.type === "character") {
    const it = sel.item;
    const c = project.characters.find((x) => x.name === it.char);
    const src = charUrl(project.slug, it.char, it.name);
    main = (
      <div className="mx-auto max-w-5xl">
        <a href={src} target="_blank" rel="noopener" className="checker block overflow-hidden rounded-xl ring-1 ring-border">
          <img src={src} alt={it.name} className="max-h-[70vh] w-full object-contain max-md:max-h-[50vh]" />
        </a>
        <h2 className="mt-4 text-lg font-semibold break-all">{it.name}</h2>
        <p className="text-sm text-muted-foreground">character · {it.char}</p>
        <DocsList docs={(c?.docs ?? []).map((d) => ({ key: d.name, name: d.name, label: "character", url: charUrl(project.slug, it.char, d.name) }))} />
      </div>
    );
  } else if (!video) main = (
    <EmptyState icon={<FolderOpenIcon />} title={`${project.slug} has no videos yet`}
      action={canEdit && <Button className="font-semibold" onClick={() => setCreating({ kind: "video", project: project.slug })}><PlusIcon />New video</Button>}>
      Each video gets its own workspace for assets, references, the script and drafts.
    </EmptyState>
  );
  else main = (
    <>
      <Tabs value={tab} onValueChange={(t) => setTab(t as Tab)} className="w-full">
        <div className="mx-auto mb-3 flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-5 gap-y-2">
          <h1 className="min-w-0 truncate text-[17px] font-semibold tracking-tight">
            <span className="text-muted-foreground">{project.slug}</span>
            <span className="mx-1.5 text-faint">/</span>
            <span className="font-bold">{video.slug}</span>
          </h1>
          <TabsList className="h-auto gap-1 rounded-[10px] border bg-popover p-1 group-data-horizontal/tabs:h-auto max-md:grid max-md:w-full max-md:grid-cols-3">
            <TabsTrigger value="video" className="h-[34px] flex-none rounded-[7px] px-3.5 data-active:font-semibold dark:data-active:border-transparent dark:data-active:bg-[#2A2A2E]"><VideoIcon />Video</TabsTrigger>
            <TabsTrigger value="script" className="h-[34px] flex-none rounded-[7px] px-3.5 data-active:font-semibold dark:data-active:border-transparent dark:data-active:bg-[#2A2A2E]"><ScrollTextIcon />Script
              {video.openComments > 0 && <span className="rounded-full bg-brand-soft px-1.5 text-[11px] text-brand tabular-nums">{video.openComments}</span>}
            </TabsTrigger>
            <TabsTrigger value="assets" className="h-[34px] flex-none rounded-[7px] px-3.5 data-active:font-semibold dark:data-active:border-transparent dark:data-active:bg-[#2A2A2E]"><ImagesIcon />Assets
              {video.assetCount > 0 && <span className="font-mono text-xs text-faint tabular-nums">{video.assetCount}</span>}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="video">
          <VideoTab project={project.slug} video={video} item={sel.item} startAt={startAt}
            onSelect={(item) => select({ ...sel, item })}
            onOpenScript={(m) => { setOpenScript({ ...m, n: Date.now() }); setTab("script"); }} />
        </TabsContent>
        {/* Kept mounted so switching tabs never loses unsaved script edits. */}
        <TabsContent value="script" forceMount className="data-[state=inactive]:hidden">
          {(tab === "script" || seenScript) && (
            <Suspense fallback={<Skeleton className="mx-auto h-40 max-w-3xl" />}>
              <ScriptTab key={project.slug + "/" + video.slug} project={project.slug} video={video.slug} canEdit={canEdit}
                askDelete={ask} onDirtyChange={onDirty} onChanged={refreshQuiet} open={openScript} />
            </Suspense>
          )}
        </TabsContent>
        <TabsContent value="assets">
          <AssetsTab project={project.slug} video={video.slug} canEdit={canEdit} askDelete={ask} onChanged={() => refresh()} />
        </TabsContent>
      </Tabs>
    </>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col bg-background">
        <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-line bg-header px-5 max-md:h-14 max-md:gap-2 max-md:px-3">
          {project && (
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open videos" onClick={() => setMenuOpen(true)}><MenuIcon /></Button>
          )}
          {project && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="-ml-1.5 text-faint hover:text-foreground max-md:hidden" onClick={toggleSide}
                  aria-label={sideOpen ? "Hide sidebar" : "Show sidebar"} aria-expanded={sideOpen} aria-controls="video-sidebar">
                  {sideOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{sideOpen ? "Hide sidebar" : "Show sidebar"} <span className="ml-1 opacity-60">{"⌘\\"}</span></TooltipContent>
            </Tooltip>
          )}
          <button className="mr-2 flex items-center gap-2.5 text-[17px] font-bold tracking-tight max-md:mr-0" onClick={() => guard(() => setView("main"))} aria-label="clauvid home">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand max-md:size-[26px]">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5l7 4.5-7 4.5z" fill="#1A1206" /></svg>
            </span>
            <span className="max-md:hidden">clauvid</span>
          </button>
          {projects && (
            <ProjectPicker projects={projects} current={sel.project} canEdit={canEdit}
              onPick={(slug) => select(resolve(projects, { project: slug }), "video")} onNew={() => setCreating({ kind: "project" })}
              onDelete={deleteProject} />
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button variant={view === "trash" ? "secondary" : "ghost"} className="h-9 px-3 text-[#C9C9CE] max-sm:size-11 max-sm:px-0" onClick={() => guard(() => setView(view === "trash" ? "main" : "trash"))}>
              <Trash2Icon /><span className="max-sm:hidden">Trash</span>
            </Button>
            <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => refresh()}><RefreshCwIcon /></Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {project && (
            <aside id="video-sidebar" aria-hidden={!sideOpen} inert={!sideOpen}
              className={cn("shrink-0 overflow-hidden border-line bg-sidebar transition-[width] duration-200 ease-out max-md:hidden",
                sideOpen ? "w-[300px] border-r" : "w-0")}>
              <ScrollArea className="h-full w-[300px]">{sidebar}</ScrollArea>
            </aside>
          )}
          <main className="min-w-0 flex-1 overflow-y-auto px-10 pt-5 pb-6 max-lg:px-6 max-md:p-4">{main}</main>
        </div>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>{project?.slug}</SheetTitle>
            <SheetDescription>Videos and drafts</SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">{sidebar}</ScrollArea>
        </SheetContent>
      </Sheet>

      <DeleteDialog request={deleteReq} onClose={() => setDeleteReq(null)} />
      <CreateDialog target={creating} onClose={() => setCreating(null)}
        onCreated={(slug) => {
          const t = creating;
          guard(() => {
            setView("main"); setMenuOpen(false);
            if (t?.kind === "video") { setTab("assets"); refresh({ project: t.project, video: slug, rev: undefined }); }
            else { setTab("video"); refresh({ project: slug, video: undefined, rev: undefined }); }
          });
        }} />

      <AlertDialog open={!!pendingNav} onOpenChange={(o) => !o && setPendingNav(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved script changes?</AlertDialogTitle>
            <AlertDialogDescription>Your edits to this script haven't been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { dirty.current = false; pendingNav?.(); setPendingNav(null); }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}
