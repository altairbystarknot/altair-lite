import * as ops from "@/lib/ops";
import { load, mutate, reset, SANDBOX_ID } from "@/lib/store";

// The panel's own API: read the sandbox, and what a person does by hand (approve or discard a draft, assign a
// driver, confirm a request, set up the business: profile and logo, rate sheet, tours, drivers; start over).
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sandbox: string }> };
const bad = (message: string, status = 400) => Response.json({ error: message }, { status });

export async function GET(_req: Request, ctx: Ctx) {
  const { sandbox } = await ctx.params;
  if (!SANDBOX_ID.test(sandbox)) return bad("Unknown sandbox", 404);
  return Response.json(await load(sandbox), { headers: { "Cache-Control": "no-store" } });
}

type Action = {
  type?: string;
  id?: string;
  code?: string;
  driver?: string | null;
  profile?: ops.Profile;
  rows?: ops.ImportRow[];
  seats?: Record<string, number>;
  file?: string;
  tour?: Parameters<typeof ops.parseTour>[1];
  person?: { id?: string; name?: string; vehicle?: string; languages?: string[] | string };
};

export async function POST(req: Request, ctx: Ctx) {
  const { sandbox } = await ctx.params;
  if (!SANDBOX_ID.test(sandbox)) return bad("Unknown sandbox", 404);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return bad("Forbidden", 403);
  if (Number(req.headers.get("content-length") ?? 0) > 400_000) return bad("That is too large for this demo.", 413);
  let a: Action;
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
      case "confirm":
        await mutate(sandbox, (s) => ops.confirmBooking(s, String(a.code), "team"));
        break;
      case "profile":
        await mutate(sandbox, (s) => ops.updateProfile(s, a.profile ?? {}, "team"));
        break;
      case "import":
        await mutate(sandbox, (s) => ops.applyImport(s, ops.buildImport(a.rows ?? [], a.seats ?? {}, a.file), "team"));
        break;
      case "tour":
        await mutate(sandbox, (s) => ops.saveTour(s, ops.parseTour(s, a.tour ?? {}), "team"));
        break;
      case "tour-remove":
        await mutate(sandbox, (s) => ops.removeTour(s, String(a.id), "team"));
        break;
      case "driver":
        await mutate(sandbox, (s) => ops.saveDriver(s, a.person ?? {}, "team"));
        break;
      case "driver-remove":
        await mutate(sandbox, (s) => ops.removeDriver(s, String(a.id), "team"));
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
