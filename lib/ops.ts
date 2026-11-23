import { addDays, longDate, nowISO, resolveDate, todayISO } from "./dates";
import type { Booking, Draft, RateChange, State } from "./types";

// Everything the business can do, shared by the panel and by Claude's tools. Pure functions over a sandbox
// state: reads return plain data; writes change the state and add a line to the activity log.
// The pricing here is deliberately simple (one price per route and vehicle). It is a demo, not Altair's engine.

export class OpError extends Error {}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++ % 1000).toString(36)}`;

export function log(s: State, actor: "claude" | "team" | "system", text: string) {
  s.log.push({ id: uid("l"), at: nowISO(), actor, text });
}

export function zoneName(s: State, id?: string) {
  return s.zones.find((z) => z.id === id)?.name ?? id ?? "";
}
const zi = (s: State, id: string) => s.zones.findIndex((z) => z.id === id);

export function vehicleName(s: State, id?: string) {
  return s.vehicles.find((v) => v.id === id)?.name ?? id ?? "";
}
export function driverName(s: State, id?: string | null) {
  return id ? (s.drivers.find((d) => d.id === id)?.name ?? id) : null;
}
export function activityName(s: State, id?: string) {
  return s.activities.find((a) => a.id === id)?.name ?? id ?? "";
}

export function findZone(s: State, q: string) {
  const n = norm(q);
  return (
    s.zones.find((z) => z.id === n) ??
    s.zones.find((z) => norm(z.name) === n) ??
    s.zones.find((z) => z.aliases.some((a) => n.includes(a) || a.includes(n))) ??
    s.zones.find((z) => norm(z.name).includes(n))
  );
}
function findDriver(s: State, q: string) {
  const n = norm(q);
  return s.drivers.find((d) => d.id === n || norm(d.name) === n || norm(d.name).startsWith(n));
}
function findBooking(s: State, code: string) {
  const b = s.bookings.find((x) => x.code.toLowerCase() === code.trim().toLowerCase());
  if (!b) throw new OpError(`There is no booking ${code}.`);
  return b;
}

/** A booking as people read it. */
export function describe(s: State, b: Booking) {
  const what = b.kind === "transfer" ? `${zoneName(s, b.from)} → ${zoneName(s, b.to)}` : activityName(s, b.activity);
  return {
    code: b.code,
    type: b.kind === "transfer" ? "Private transfer" : "Tour",
    service: what,
    date: b.date,
    time: b.time,
    customer: `${b.customer} (${b.country})`,
    travelers: `${b.adults} adult${b.adults === 1 ? "" : "s"}${b.children ? `, ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}`,
    vehicle: b.vehicle ? vehicleName(s, b.vehicle) : undefined,
    pickup: b.pickup,
    total: `$${b.total}`,
    status: b.status === "confirmed" ? "Confirmed" : "Request (to confirm)",
    driver: driverName(s, b.driver) ?? "Unassigned",
    notes: b.notes,
  };
}

const byTime = (a: Booking, b: Booking) => (a.date + a.time).localeCompare(b.date + b.time);

export function schedule(s: State, dateInput?: string) {
  const date = resolveDate(dateInput, s.business.timezone);
  if (!date) throw new OpError(`I could not read the date "${dateInput}". Use today, tomorrow or YYYY-MM-DD.`);
  const items = s.bookings.filter((b) => b.date === date).sort(byTime);
  return {
    date,
    day: longDate(date),
    services: items.map((b) => describe(s, b)),
    unassigned: items.filter((b) => !b.driver).map((b) => b.code),
  };
}

export function overview(s: State) {
  const today = todayISO(s.business.timezone);
  const next = s.bookings.filter((b) => b.date >= today && b.date <= addDays(today, 3));
  return {
    business: s.business.name,
    today: longDate(today),
    servicesToday: s.bookings.filter((b) => b.date === today).length,
    servicesTomorrow: s.bookings.filter((b) => b.date === addDays(today, 1)).length,
    unassignedNext3Days: next.filter((b) => !b.driver).sort(byTime).map((b) => `${b.code} · ${b.date} ${b.time} · ${b.kind === "transfer" ? `${zoneName(s, b.from)} → ${zoneName(s, b.to)}` : activityName(s, b.activity)}`),
    requestsToConfirm: s.bookings.filter((b) => b.status === "request" && b.date >= today).map((b) => b.code),
    draftsWaitingForApproval: s.drafts.filter((d) => d.status === "pending").map((d) => `${d.id} · ${d.title}`),
    bookedNext7Days: `$${s.bookings.filter((b) => b.date >= today && b.date <= addDays(today, 7)).reduce((t, b) => t + b.total, 0)}`,
  };
}

export function findBookings(s: State, f: { query?: string; date?: string; unassignedOnly?: boolean; status?: string }) {
  const date = f.date ? resolveDate(f.date, s.business.timezone) : null;
  if (f.date && !date) throw new OpError(`I could not read the date "${f.date}".`);
  const q = f.query ? norm(f.query) : "";
  const res = s.bookings
    .filter((b) => !date || b.date === date)
    .filter((b) => !f.unassignedOnly || !b.driver)
    .filter((b) => !f.status || b.status === f.status)
    .filter((b) => !q || norm([b.code, b.customer, b.country, zoneName(s, b.from), zoneName(s, b.to), activityName(s, b.activity), b.pickup ?? ""].join(" ")).includes(q))
    .sort(byTime);
  return { count: res.length, bookings: res.map((b) => describe(s, b)) };
}

export function bookingDetails(s: State, code: string) {
  return describe(s, findBooking(s, code));
}

export function quoteTransfer(s: State, from: string, to: string, passengers: number) {
  const a = findZone(s, from);
  const b = findZone(s, to);
  if (!a) throw new OpError(`I don't know the place "${from}". Known places: ${s.zones.map((z) => z.name).join(", ")}.`);
  if (!b) throw new OpError(`I don't know the place "${to}". Known places: ${s.zones.map((z) => z.name).join(", ")}.`);
  if (a.id === b.id) throw new OpError("Origin and destination are the same place.");
  const options = s.vehicles
    .filter((v) => v.seats >= passengers)
    .map((v) => ({ vehicle: v.name, seats: v.seats, rate: s.rates.find((r) => r.from === a.id && r.to === b.id && r.vehicle === v.id) }))
    .map((o) => ({ vehicle: o.vehicle, seats: o.seats, price: o.rate ? `$${o.rate.price}` : "Needs a custom quote" }));
  if (!options.length) return { route: `${a.name} → ${b.name}`, passengers, options: [], note: `No single vehicle seats ${passengers}; offer two vehicles or a custom quote.` };
  return { route: `${a.name} → ${b.name}`, passengers, options, note: "Private vehicle for the group, price per vehicle in USD, taxes included." };
}

export function drivers(s: State, dateInput?: string) {
  const date = resolveDate(dateInput, s.business.timezone) ?? todayISO(s.business.timezone);
  return {
    date,
    drivers: s.drivers.map((d) => ({
      name: d.name,
      vehicle: vehicleName(s, d.vehicle),
      languages: d.languages.join(", "),
      services: s.bookings.filter((b) => b.driver === d.id && b.date === date).sort(byTime).map((b) => `${b.time} ${b.code}`),
    })),
  };
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function assignDriver(s: State, code: string, driverQuery: string, actor: "claude" | "team") {
  const b = findBooking(s, code);
  const d = findDriver(s, driverQuery);
  if (!d) throw new OpError(`There is no driver "${driverQuery}". Drivers: ${s.drivers.map((x) => x.name).join(", ")}.`);
  const clash = s.bookings.find((o) => o.code !== b.code && o.driver === d.id && o.date === b.date && Math.abs(minutes(o.time) - minutes(b.time)) < 150);
  if (clash) throw new OpError(`${d.name} already has ${clash.code} at ${clash.time} that day; choose another driver.`);
  if (b.vehicle) {
    const need = s.vehicles.find((v) => v.id === b.vehicle)!;
    const has = s.vehicles.find((v) => v.id === d.vehicle)!;
    if (has.seats < need.seats) throw new OpError(`${d.name} drives a ${has.name} (${has.seats} seats); ${b.code} needs a ${need.name}.`);
  }
  b.driver = d.id;
  log(s, actor, `${actor === "claude" ? "Claude" : "The team"} assigned ${d.name} to ${b.code} (${b.date} ${b.time}).`);
  return { ok: true, booking: describe(s, b) };
}

export function unassign(s: State, code: string, actor: "claude" | "team") {
  const b = findBooking(s, code);
  b.driver = null;
  log(s, actor, `${actor === "claude" ? "Claude" : "The team"} removed the driver from ${b.code}.`);
  return { ok: true };
}

export function proposeRateChange(
  s: State,
  p: { percent?: number; amount?: number; from?: string; to?: string; vehicle?: string; reason: string },
  actor: "claude" | "team",
) {
  if (p.percent === undefined && p.amount === undefined) throw new OpError("Say the change as a percent (e.g. 10) or an amount in dollars (e.g. -5).");
  if (p.percent !== undefined && (p.percent < -50 || p.percent > 100)) throw new OpError("Percent changes must be between -50 and 100.");
  const fz = p.from ? findZone(s, p.from) : undefined;
  const tz = p.to ? findZone(s, p.to) : undefined;
  if (p.from && !fz) throw new OpError(`I don't know the place "${p.from}".`);
  if (p.to && !tz) throw new OpError(`I don't know the place "${p.to}".`);
  const veh = p.vehicle ? s.vehicles.find((v) => norm(v.name) === norm(p.vehicle!) || v.id === norm(p.vehicle!)) : undefined;
  if (p.vehicle && !veh) throw new OpError(`I don't know the vehicle "${p.vehicle}". Vehicles: ${s.vehicles.map((v) => v.name).join(", ")}.`);
  const touched = s.rates.filter((r) => (!fz || r.from === fz.id || r.to === fz.id) && (!tz || r.to === tz.id || r.from === tz.id) && (!veh || r.vehicle === veh.id));
  if (!touched.length) throw new OpError("No rates match that change.");
  const changes: RateChange[] = touched.map((r) => {
    const raw = p.percent !== undefined ? r.price * (1 + p.percent / 100) : r.price + (p.amount ?? 0);
    return { from: r.from, to: r.to, vehicle: r.vehicle, before: r.price, after: Math.max(5, Math.round(raw)) };
  });
  const scope = [fz && `touching ${fz.name}`, tz && `and ${tz.name}`, veh && `for ${veh.name}`].filter(Boolean).join(" ") || "on every route";
  const what = p.percent !== undefined ? `${p.percent > 0 ? "+" : ""}${p.percent}%` : `${(p.amount ?? 0) > 0 ? "+" : ""}$${p.amount}`;
  const draft: Draft = { id: `D-${String(s.drafts.length + 1).padStart(2, "0")}`, title: `Rates ${what} ${scope}`, reason: p.reason, changes, status: "pending", createdAt: nowISO(), source: actor };
  s.drafts.push(draft);
  log(s, actor, `${actor === "claude" ? "Claude" : "The team"} prepared draft ${draft.id}: ${draft.title} (${changes.length} rates). It waits for a person to approve it.`);
  return { draft: draft.id, title: draft.title, rates: changes.length, sample: changes.filter((c) => zi(s, c.from) < zi(s, c.to)).slice(0, 8).map((c) => `${zoneName(s, c.from)} ↔ ${zoneName(s, c.to)} · ${vehicleName(s, c.vehicle)}: $${c.before} → $${c.after}`), status: "Waiting for approval in the panel. Nothing has changed yet." };
}

export function decideDraft(s: State, id: string, approve: boolean) {
  const d = s.drafts.find((x) => x.id === id);
  if (!d) throw new OpError(`There is no draft ${id}.`);
  if (d.status !== "pending") throw new OpError(`Draft ${id} was already ${d.status}.`);
  if (approve) {
    for (const c of d.changes) {
      const r = s.rates.find((x) => x.from === c.from && x.to === c.to && x.vehicle === c.vehicle);
      if (r) r.price = c.after;
    }
  }
  d.status = approve ? "approved" : "discarded";
  d.decidedAt = nowISO();
  log(s, "team", approve ? `The team approved draft ${d.id}; ${d.changes.length} rates are now live.` : `The team discarded draft ${d.id}.`);
  return { ok: true };
}

export function listDrafts(s: State, status?: string) {
  return s.drafts
    .filter((d) => !status || d.status === status)
    .map((d) => ({ id: d.id, title: d.title, reason: d.reason, rates: d.changes.length, status: d.status, createdBy: d.source }));
}

export function customerMessage(s: State, code: string, kind: "confirmation" | "reminder" | "driver", language: "en" | "es") {
  const b = findBooking(s, code);
  const what = b.kind === "transfer" ? `${zoneName(s, b.from)} → ${zoneName(s, b.to)} (${vehicleName(s, b.vehicle)})` : activityName(s, b.activity);
  const drv = driverName(s, b.driver);
  const meet = b.pickup ?? (b.kind === "transfer" ? zoneName(s, b.from) : undefined);
  const first = b.customer.split(" ")[0];
  const es = language === "es";
  const lines: Record<typeof kind, string> = {
    confirmation: es
      ? `Hola ${first}, su reserva ${b.code} está confirmada: ${what}, el ${longDate(b.date, "es-CR")} a las ${b.time}. Total: $${b.total}, impuestos incluidos. ¡Gracias por elegir ${s.business.name}!`
      : `Hi ${first}, your booking ${b.code} is confirmed: ${what}, on ${longDate(b.date)} at ${b.time}. Total: $${b.total}, taxes included. Thank you for choosing ${s.business.name}!`,
    reminder: es
      ? `Hola ${first}, le recordamos su servicio ${b.code} el ${longDate(b.date, "es-CR")} a las ${b.time}: ${what}. Si algo cambia, respóndanos por aquí.`
      : `Hi ${first}, a reminder of ${b.code} on ${longDate(b.date)} at ${b.time}: ${what}. If anything changes, just reply here.`,
    driver: drv
      ? es
        ? `Hola ${first}, su conductor para ${b.code} será ${drv}. Le esperará a las ${b.time}${meet ? ` en ${meet}` : ""}.`
        : `Hi ${first}, your driver for ${b.code} will be ${drv}. They will meet you at ${b.time}${meet ? ` at ${meet}` : ""}.`
      : es
        ? `La reserva ${b.code} aún no tiene conductor asignado.`
        : `${b.code} has no driver assigned yet.`,
  };
  log(s, "claude", `Claude drafted a ${kind} message for ${b.code} (not sent).`);
  return { to: b.customer, message: lines[kind], note: "Draft only: Altair Lite never sends messages. Copy it into WhatsApp or email." };
}
