import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { load, SANDBOX_ID } from "@/lib/store";
import { Panel } from "./panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your sandbox · Altair Lite", robots: { index: false } };

export default async function SandboxPage({ params }: { params: Promise<{ sandbox: string }> }) {
  const { sandbox } = await params;
  if (!SANDBOX_ID.test(sandbox)) notFound();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3200";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const state = await load(sandbox);
  return <Panel sandbox={sandbox} initial={state} mcpUrl={`${proto}://${host}/mcp/${sandbox}`} />;
}
