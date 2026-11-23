import { randomBytes } from "node:crypto";
import { create } from "@/lib/store";

// A fresh private sandbox: a random id (it is also the key to the sandbox, so it is long and unguessable).
// /new opens the sample business; /new?setup=1 opens the same sample data with the guided setup first, so a
// visitor can replace it piece by piece with their own logo, rates, tours and team.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = randomBytes(10).toString("hex");
  const own = new URL(req.url).searchParams.get("setup") === "1";
  try {
    await create(id, own ? "own" : "sample");
  } catch (e) {
    console.error("[new]", e);
  }
  return Response.redirect(new URL(own ? `/w/${id}?view=setup` : `/w/${id}`, req.url), 303);
}
