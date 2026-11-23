import * as ops from "@/lib/ops";
import { mutate, SANDBOX_ID } from "@/lib/store";

// The booking page's one write: a traveler asks for a transfer or a tour. The server computes the price from
// the business's own rates (the browser's figure is display only) and the booking arrives as a request.
export const dynamic = "force-dynamic";

const bad = (message: string, status = 400) => Response.json({ error: message }, { status });

export async function POST(req: Request, ctx: { params: Promise<{ sandbox: string }> }) {
  const { sandbox } = await ctx.params;
  if (!SANDBOX_ID.test(sandbox)) return bad("Unknown business", 404);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return bad("Forbidden", 403);
  let b: ops.NewBooking;
  try {
    b = await req.json();
  } catch {
    return bad("Invalid request");
  }
  try {
    const res = await mutate(sandbox, (s) => ops.createBooking(s, { ...b, kind: b.kind === "tour" ? "tour" : "transfer" }, "web"));
    return Response.json(res);
  } catch (e) {
    if (e instanceof ops.OpError) return bad(e.message, 409);
    console.error("[book]", e);
    return bad("Something went wrong, please try again.", 500);
  }
}
