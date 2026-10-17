import type { Item, Tab } from "./types";
import { stripExt } from "./format";

// ?project=<p>&video=<v>&rev=<final|vNN-note|char-<name>-<svg>>&tab=<video|script|assets>&t=<s>
export type Link = { project?: string; video?: string; rev?: string; tab?: Tab; t?: number };

export function readLink(): Link {
  const q = new URLSearchParams(location.search);
  const tab = q.get("tab");
  return {
    project: q.get("project") || undefined,
    video: q.get("video") || undefined,
    rev: q.get("rev")?.toLowerCase() || undefined,
    tab: tab === "script" || tab === "assets" ? tab : undefined,
    t: Number(q.get("t")) || undefined,
  };
}

export const revKey = (item: Item) =>
  item.type === "character" ? `char-${item.char}-${stripExt(item.name).toLowerCase()}`
    : item.dir === "final" ? "final" : stripExt(item.name).toLowerCase();

export function linkFor(project: string, video: string | undefined, item: Item | null, tab: Tab, t = 0) {
  const q = new URLSearchParams({ project });
  if (video && item?.type !== "character") q.set("video", video);
  if (item) q.set("rev", revKey(item));
  if (tab !== "video") q.set("tab", tab);
  if (t > 0) q.set("t", String(Math.floor(t)));
  return `${location.pathname}?${q}`;
}
