import type { Links } from "./ops";

/** The public origin of this deployment, from the request (Vercel sets the forwarded headers). */
export function originOf(h: Headers, fallback = "http://localhost:3200") {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return fallback;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const linksFor = (base: string, sandbox: string): Links => ({
  panel: `${base}/w/${sandbox}`,
  booking: `${base}/b/${sandbox}`,
  connector: `${base}/mcp/${sandbox}`,
});
