import { randomBytes } from "node:crypto";

// A fresh private sandbox: a random id (it is also the key to the sandbox, so it is long and unguessable).
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const id = randomBytes(10).toString("hex");
  return Response.redirect(new URL(`/w/${id}`, req.url), 303);
}
