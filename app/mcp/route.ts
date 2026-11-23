import { mcpGet, mcpOptions, mcpPost } from "@/lib/mcp-route";
import { PUBLIC_SANDBOX } from "@/lib/store";

// The shared sandbox, for a quick try. Each visitor of the panel gets a private one at /mcp/<sandbox>.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return mcpPost(req, PUBLIC_SANDBOX);
}
export const GET = mcpGet;
export const OPTIONS = mcpOptions;
