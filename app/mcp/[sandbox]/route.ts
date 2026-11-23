import { mcpGet, mcpOptions, mcpPost } from "@/lib/mcp-route";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ sandbox: string }> }) {
  return mcpPost(req, (await ctx.params).sandbox);
}
export const GET = mcpGet;
export const OPTIONS = mcpOptions;
