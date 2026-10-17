export const fmtSize = (b: number) =>
  b >= 1e9 ? (b / 1e9).toFixed(2) + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtDuration = (s?: number | null) => {
  if (s == null || Number.isNaN(s)) return "";
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const stripExt = (n: string) => n.replace(/\.[^.]+$/, "");
