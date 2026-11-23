import { handle, type RpcReq } from "./mcp";
import { linksFor, originOf } from "./links";
import { SANDBOX_ID } from "./store";

// HTTP glue for the MCP endpoint: JSON-RPC over POST, answered as JSON. GET (server-sent events) is not
// offered: every answer comes back in the POST response, which keeps the server stateless.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

export async function mcpPost(req: Request, sandbox: string) {
  if (!SANDBOX_ID.test(sandbox)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Unknown sandbox" } }, 404);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const ctx = { sandbox, links: linksFor(originOf(req.headers), sandbox) };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(ctx, m as RpcReq)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await handle(ctx, body as RpcReq);
  return res ? json(res) : new Response(null, { status: 202, headers: CORS });
}

export const mcpGet = () =>
  new Response(JSON.stringify({ name: "Altair Lite MCP", transport: "streamable-http (POST, JSON responses)", hint: "Add this URL to Claude as a custom connector." }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS", ...CORS },
  });

export const mcpOptions = () => new Response(null, { status: 204, headers: CORS });
