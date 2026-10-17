export type FileInfo = { name: string; size: number; mtime: number };
/** Which script and voiceover take a render was built from, when known. */
export type MadeFrom = { script: string | null; take: string | null };
export type Render = FileInfo & { madeFrom?: MadeFrom };
export type Doc = FileInfo & { dir: "final" | "research" };
export type Video = {
  slug: string; updated: number; final: Render[]; revisions: Render[]; docs: Doc[];
  scripts: number; assetCount: number; usedCount: number; openComments: number;
};
export type Character = { name: string; svgs: FileInfo[]; docs: FileInfo[] };
export type Project = { slug: string; updated: number; videos: Video[]; characters: Character[] };
export type AssetKind = "image" | "audio" | "video" | "doc";
export type Asset = FileInfo & { kind: AssetKind; used?: boolean; duration?: number | null; lockedBy?: string[] };
export type Assets = { assets: Asset[]; references: Asset[]; research?: Asset[] };
export type Comment = { id: string; quote: string; note: string; createdAt: number; resolved: boolean };
export type Script = { name: string; markdown: string; comments: Comment[]; mtime: number; lockedBy?: string[] };
export type ScriptInfo = { name: string; size: number; mtime: number; openComments: number; lockedBy?: string[] };
export type TrashItem = {
  id: string; kind: "file" | "video" | "project"; name: string; project: string; video?: string; dir?: string;
  original: string; size: number; deletedAt: number;
  /** Files that went to Trash with it and come back with it. */
  with?: string[];
};
export type DeleteTarget = { project: string; video?: string; dir?: string; name?: string };

/** What the main pane is showing inside a video. */
export type Item =
  | { type: "render"; dir: "final" | "revisions"; name: string }
  | { type: "character"; char: string; name: string };
export type Tab = "video" | "script" | "assets";
