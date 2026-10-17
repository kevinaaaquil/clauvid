// Writes (save, upload, delete) are allowed from anywhere the platform is reachable: this
// machine, the LAN, or a tunnel. What is refused is another website writing through your
// browser (CSRF): every write must carry X-Clauvid, which forces a CORS preflight this server
// never answers, and a browser Origin, when sent, must match the host the page was served from.
const hostOf = (h) => (h || "").split(",")[0].trim().replace(/:\d+$/, "").toLowerCase();

export function canWrite(req) {
  const h = req.headers;
  if (!h.origin) return true; // not a cross-site browser request (curl, agents, same-origin GET)
  let origin;
  try { origin = new URL(h.origin).hostname.toLowerCase(); } catch { return false; }
  // Behind a proxy or tunnel the public host may arrive as X-Forwarded-Host instead of Host.
  return [h.host, h["x-forwarded-host"]].some((x) => x && hostOf(x) === origin);
}

export const canWriteRequest = (req) => canWrite(req) && req.headers["x-clauvid"] === "1";
