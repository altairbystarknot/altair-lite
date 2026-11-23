import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addDays, todayISO } from "@/lib/dates";
import { seatsTaken } from "@/lib/ops";
import { load, SANDBOX_ID } from "@/lib/store";
import { Book, type PublicData } from "./book";

// The business's public booking page. It receives only what a traveler needs: the brand, places, vehicles,
// prices and seats left on each tour departure. Never the bookings or the customers.
export const dynamic = "force-dynamic";

type P = { params: Promise<{ sandbox: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { sandbox } = await params;
  if (!SANDBOX_ID.test(sandbox)) return {};
  const s = await load(sandbox);
  return { title: `${s.business.name} · Book a transfer or a tour`, description: s.business.tagline, robots: { index: false } };
}

export default async function BookingPage({ params }: P) {
  const { sandbox } = await params;
  if (!SANDBOX_ID.test(sandbox)) notFound();
  const s = await load(sandbox);
  const today = todayISO(s.business.timezone);
  const taken: Record<string, number> = {};
  for (let i = 0; i < 60; i++) {
    const d = addDays(today, i);
    for (const a of s.activities) for (const t of a.times) {
      const n = seatsTaken(s, a.id, d, t);
      if (n) taken[`${a.id}|${d}|${t}`] = n;
    }
  }
  const data: PublicData = {
    business: { name: s.business.name, tagline: s.business.tagline ?? "", phone: s.business.phone, email: s.business.email, color: s.business.color ?? "#16766b", logo: s.business.logo ?? null },
    zones: s.zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind })),
    vehicles: s.vehicles.map((v) => ({ id: v.id, name: v.name, seats: v.seats })),
    rates: s.rates,
    activities: s.activities.map((a) => ({ ...a, place: s.zones.find((z) => z.id === a.zone)?.name ?? a.zone })),
    taken,
    today,
  };
  return <Book sandbox={sandbox} data={data} />;
}
