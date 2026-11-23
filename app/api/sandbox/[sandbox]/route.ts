import * as ops from "@/lib/ops";
import { load, mutate, reset, SANDBOX_ID } from "@/lib/store";

// The panel's own API: read the sandbox, and the few things a person does by hand (approve or discard a
// draft, assign or remove a driver, start over).
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sandbox: string }> };
const bad = (message: string, status = 400) => Response.json({ error: message }, { status });

export async function GET(_req: Request, ctx: Ctx) {
  const { sandbox } = await ctx.params;
  if (!SANDBOX_ID.test(sandbox)) return bad("Unknown sandbox", 404);
  return Response.json(await load(sandbox), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, ctx: Ctx) {
  const { sandbox } = await ctx.params;
  if (!SANDBOX_ID.test(sandbox)) return bad("Unknown sandbox", 404);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return bad("Forbidden", 403);
  let a: { type?: string; id?: string; code?: string; driver?: string };
  try {
    a = await req.json();
  } catch {
    return bad("Invalid request");
  }
  try {
    switch (a.type) {
      case "approve":
      case "discard":
        await mutate(sandbox, (s) => ops.decideDraft(s, String(a.id), a.type === "approve"));
        break;
      case "assign":
        await mutate(sandbox, (s) => (a.driver ? ops.assignDriver(s, String(a.code), a.driver, "team") : ops.unassign(s, String(a.code), "team")));
        break;
      case "reset":
        await reset(sandbox);
        break;
      default:
        return bad("Unknown action");
    }
  } catch (e) {
    if (e instanceof ops.OpError) return bad(e.message, 409);
    console.error("[panel]", e);
    return bad("Something went wrong, please try again.", 500);
  }
  return Response.json(await load(sandbox), { headers: { "Cache-Control": "no-store" } });
}
