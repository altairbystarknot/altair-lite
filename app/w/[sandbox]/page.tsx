import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { linksFor, originOf } from "@/lib/links";
import { load, SANDBOX_ID } from "@/lib/store";
import { Panel } from "./panel";
import type { View } from "./ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your panel · Altair Lite", robots: { index: false } };

const VIEWS: View[] = ["today", "bookings", "catalog", "setup"];

export default async function SandboxPage({ params, searchParams }: { params: Promise<{ sandbox: string }>; searchParams: Promise<{ view?: string }> }) {
  const { sandbox } = await params;
  if (!SANDBOX_ID.test(sandbox)) notFound();
  const { view } = await searchParams;
  const links = linksFor(originOf(await headers()), sandbox);
  const state = await load(sandbox);
  return <Panel sandbox={sandbox} initial={state} links={links} startView={VIEWS.includes(view as View) ? (view as View) : "today"} />;
}
