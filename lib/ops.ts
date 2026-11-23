import { addDays, longDate, nowISO, resolveDate, todayISO } from "./dates";
import type { Activity, Booking, BookingSource, Draft, Driver, ImportPayload, Rate, RateChange, Setup, State, Vehicle, Zone } from "./types";

// Everything the business can do, shared by the panel, the booking page and Claude's tools. Pure functions over
// a sandbox state: reads return plain data; writes change the state and add a line to the activity log.
// The pricing here is deliberately simple (one price per route and vehicle). It is a demo, not Altair's engine.

export class OpError extends Error {}
export type Actor = "claude" | "team" | "web";

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const slug = (s: string, max = 24) => norm(s).replace(/[^a-z0-9]+/g, "").slice(0, max);
let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++ % 1000).toString(36)}`;
const who = (a: Actor | "system") => (a === "claude" ? "Claude" : a === "web" ? "The booking page" : a === "team" ? "The team" : "Altair Lite");
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export function log(s: State, actor: Actor | "system", text: string) {
  s.log.push({ id: uid("l"), at: nowISO(), actor, text });
}

export function markSetup(s: State, key: Exclude<keyof Setup, "mode">) {
  s.setup ??= { mode: "sample" };
  s.setup[key] ??= nowISO();
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
  if (!n) return undefined;
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
function findVehicle(s: State, q: string) {
  const n = norm(q);
  return s.vehicles.find((v) => v.id === n || norm(v.name) === n) ?? s.vehicles.find((v) => norm(v.name).includes(n));
}
export function findActivity(s: State, q: string) {
  const n = norm(q);
  return s.activities.find((a) => a.id === n || norm(a.name) === n) ?? s.activities.find((a) => norm(a.name).includes(n));
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
    total: money(b.total),
    status: b.status === "confirmed" ? "Confirmed" : "Request (to confirm)",
    driver: driverName(s, b.driver) ?? "Unassigned",
    source: b.source === "web" ? "Booking page" : b.source === "claude" ? "Claude" : b.source === "team" ? "Team" : "Sample",
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

export function overview(s: State, links?: Links) {
  const today = todayISO(s.business.timezone);
  const next = s.bookings.filter((b) => b.date >= today && b.date <= addDays(today, 3));
  const setup = setupChecklist(s);
  return {
    business: s.business.name,
    today: longDate(today),
    servicesToday: s.bookings.filter((b) => b.date === today).length,
    servicesTomorrow: s.bookings.filter((b) => b.date === addDays(today, 1)).length,
    unassignedNext3Days: next.filter((b) => !b.driver).sort(byTime).map((b) => `${b.code} · ${b.date} ${b.time} · ${b.kind === "transfer" ? `${zoneName(s, b.from)} → ${zoneName(s, b.to)}` : activityName(s, b.activity)}`),
    requestsToConfirm: s.bookings.filter((b) => b.status === "request" && b.date >= today).map((b) => `${b.code} · ${b.customer} · ${b.date} ${b.time}${b.source === "web" ? " · from the booking page" : ""}`),
    draftsWaitingForApproval: s.drafts.filter((d) => d.status === "pending").map((d) => `${d.id} · ${d.title}`),
    bookedNext7Days: money(s.bookings.filter((b) => b.date >= today && b.date <= addDays(today, 7)).reduce((t, b) => t + b.total, 0)),
    setup: `${setup.progress} set up${setup.missing.length ? ` · missing: ${setup.missing.join(", ")}` : " · complete"}`,
    ...(links ? { panel: links.panel, bookingPage: links.booking } : {}),
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

export function rateFor(s: State, from: string, to: string, vehicle: string) {
  return s.rates.find((r) => r.from === from && r.to === to && r.vehicle === vehicle)?.price;
}

export function quoteTransfer(s: State, from: string, to: string, passengers: number) {
  const a = findZone(s, from);
  const b = findZone(s, to);
  if (!a) throw new OpError(`I don't know the place "${from}". Known places: ${s.zones.map((z) => z.name).join(", ")}.`);
  if (!b) throw new OpError(`I don't know the place "${to}". Known places: ${s.zones.map((z) => z.name).join(", ")}.`);
  if (a.id === b.id) throw new OpError("Origin and destination are the same place.");
  const options = s.vehicles
    .filter((v) => v.seats >= passengers)
    .map((v) => ({ vehicle: v.name, seats: v.seats, price: rateFor(s, a.id, b.id, v.id) }))
    .map((o) => ({ vehicle: o.vehicle, seats: o.seats, price: o.price ? money(o.price) : "Needs a custom quote" }));
  if (!options.length) return { route: `${a.name} → ${b.name}`, passengers, options: [], note: `No single vehicle seats ${passengers}; offer two vehicles or a custom quote.` };
  return { route: `${a.name} → ${b.name}`, passengers, options, note: "Private vehicle for the group, price per vehicle in USD, taxes included." };
}

/** Seats already taken on one departure of a tour. */
export function seatsTaken(s: State, activity: string, date: string, time: string) {
  return s.bookings.filter((b) => b.kind === "tour" && b.activity === activity && b.date === date && b.time === time).reduce((t, b) => t + b.adults + b.children, 0);
}

export function quoteTour(s: State, tour: string, dateInput: string | undefined, adults: number, children: number) {
  const a = findActivity(s, tour);
  if (!a) throw new OpError(`I don't know the tour "${tour}". Tours: ${s.activities.map((x) => x.name).join(", ")}.`);
  const date = resolveDate(dateInput, s.business.timezone);
  if (!date) throw new OpError(`I could not read the date "${dateInput}".`);
  return {
    tour: a.name,
    place: zoneName(s, a.zone),
    date,
    duration: a.duration,
    price: `${adults} × ${money(a.adult)}${children ? ` + ${children} × ${money(a.child)}` : ""} = ${money(adults * a.adult + children * a.child)}`,
    departures: a.times.map((t) => ({ time: t, seatsLeft: Math.max(0, a.seats - seatsTaken(s, a.id, date, t)) })),
  };
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

export function assignDriver(s: State, code: string, driverQuery: string, actor: Actor) {
  const b = findBooking(s, code);
  const d = findDriver(s, driverQuery);
  if (!d) throw new OpError(`There is no driver "${driverQuery}". Drivers: ${s.drivers.map((x) => x.name).join(", ")}.`);
  const clash = s.bookings.find((o) => o.code !== b.code && o.driver === d.id && o.date === b.date && Math.abs(minutes(o.time) - minutes(b.time)) < 150);
  if (clash) throw new OpError(`${d.name} already has ${clash.code} at ${clash.time} that day; choose another driver.`);
  if (b.vehicle) {
    const need = s.vehicles.find((v) => v.id === b.vehicle);
    const has = s.vehicles.find((v) => v.id === d.vehicle);
    if (need && has && has.seats < need.seats) throw new OpError(`${d.name} drives a ${has.name} (${has.seats} seats); ${b.code} needs a ${need.name}.`);
  }
  b.driver = d.id;
  log(s, actor, `${who(actor)} assigned ${d.name} to ${b.code} (${b.date} ${b.time}).`);
  return { ok: true, booking: describe(s, b) };
}

export function unassign(s: State, code: string, actor: Actor) {
  const b = findBooking(s, code);
  b.driver = null;
  log(s, actor, `${who(actor)} removed the driver from ${b.code}.`);
  return { ok: true };
}

export function confirmBooking(s: State, code: string, actor: Actor) {
  const b = findBooking(s, code);
  if (b.status === "confirmed") throw new OpError(`${b.code} is already confirmed.`);
  b.status = "confirmed";
  log(s, actor, `${who(actor)} confirmed ${b.code} for ${b.customer}.`);
  return { ok: true, booking: describe(s, b) };
}

const nextDraftId = (s: State) => `D-${String(s.drafts.length + 1).padStart(2, "0")}`;

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
  const veh = p.vehicle ? findVehicle(s, p.vehicle) : undefined;
  if (p.vehicle && !veh) throw new OpError(`I don't know the vehicle "${p.vehicle}". Vehicles: ${s.vehicles.map((v) => v.name).join(", ")}.`);
  const touched = s.rates.filter((r) => (!fz || r.from === fz.id || r.to === fz.id) && (!tz || r.to === tz.id || r.from === tz.id) && (!veh || r.vehicle === veh.id));
  if (!touched.length) throw new OpError("No rates match that change.");
  const changes: RateChange[] = touched.map((r) => {
    const raw = p.percent !== undefined ? r.price * (1 + p.percent / 100) : r.price + (p.amount ?? 0);
    return { from: r.from, to: r.to, vehicle: r.vehicle, before: r.price, after: Math.max(5, Math.round(raw)) };
  });
  const scope = [fz && `touching ${fz.name}`, tz && `and ${tz.name}`, veh && `for ${veh.name}`].filter(Boolean).join(" ") || "on every route";
  const what = p.percent !== undefined ? `${p.percent > 0 ? "+" : ""}${p.percent}%` : `${(p.amount ?? 0) > 0 ? "+" : ""}$${p.amount}`;
  const draft: Draft = { id: nextDraftId(s), kind: "rates", title: `Rates ${what} ${scope}`, reason: String(p.reason).slice(0, 300), changes, status: "pending", createdAt: nowISO(), source: actor };
  s.drafts.push(draft);
  log(s, actor, `${who(actor)} prepared draft ${draft.id}: ${draft.title} (${changes.length} rates). It waits for a person to approve it.`);
  return { draft: draft.id, title: draft.title, rates: changes.length, sample: changes.filter((c) => zi(s, c.from) < zi(s, c.to)).slice(0, 8).map((c) => `${zoneName(s, c.from)} ↔ ${zoneName(s, c.to)} · ${vehicleName(s, c.vehicle)}: $${c.before} → $${c.after}`), status: "Waiting for approval in the panel. Nothing has changed yet." };
}

export function decideDraft(s: State, id: string, approve: boolean) {
  const d = s.drafts.find((x) => x.id === id);
  if (!d) throw new OpError(`There is no draft ${id}.`);
  if (d.status !== "pending") throw new OpError(`Draft ${id} was already ${d.status}.`);
  if (approve) {
    if (d.kind === "import" && d.import) applyImport(s, d.import, "team");
    else if (d.kind === "tour" && d.tour) saveTour(s, d.tour, "team");
    else
      for (const c of d.changes) {
        const r = s.rates.find((x) => x.from === c.from && x.to === c.to && x.vehicle === c.vehicle);
        if (r) r.price = c.after;
      }
  }
  d.status = approve ? "approved" : "discarded";
  d.decidedAt = nowISO();
  const what = d.kind === "import" ? `${d.import?.rates.length ?? 0} imported rates are now live` : d.kind === "tour" ? `the tour is now on sale` : `${d.changes.length} rates are now live`;
  log(s, "team", approve ? `The team approved draft ${d.id}; ${what}.` : `The team discarded draft ${d.id}.`);
  return { ok: true };
}

export function listDrafts(s: State, status?: string) {
  return s.drafts
    .filter((d) => !status || d.status === status)
    .map((d) => ({ id: d.id, kind: d.kind ?? "rates", title: d.title, reason: d.reason, rates: d.kind === "import" ? (d.import?.rates.length ?? 0) : d.changes.length, status: d.status, createdBy: d.source }));
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

// ---------------------------------------------------------------------------------------------------------
// New bookings: from the booking page (a traveler), from Claude (a WhatsApp message pasted in a chat) or the team.
// The server always computes the price from the business's own rates; whatever the browser showed is display only.

export type NewBooking = {
  kind: "transfer" | "tour";
  customer: string;
  country?: string;
  email?: string;
  date: string;
  time: string;
  adults: number;
  children?: number;
  from?: string;
  to?: string;
  vehicle?: string;
  activity?: string;
  pickup?: string;
  notes?: string;
};

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
const int = (v: unknown, lo: number, hi: number, name: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new OpError(`${name} must be a whole number from ${lo} to ${hi}.`);
  return n;
};

function nextCode(s: State) {
  const nums = s.bookings.map((b) => Number(b.code.split("-").pop())).filter((n) => Number.isFinite(n));
  return `${s.business.prefix}-${Math.max(1050, ...nums) + 1}`;
}

export function createBooking(s: State, input: NewBooking, actor: Actor) {
  if (s.bookings.length >= 400) throw new OpError("This sandbox already has 400 bookings; reset it to start again.");
  const customer = clean(input.customer, 60);
  if (customer.length < 2) throw new OpError("Add the traveler's name.");
  const today = todayISO(s.business.timezone);
  const date = resolveDate(input.date, s.business.timezone);
  if (!date) throw new OpError(`I could not read the date "${input.date}". Use YYYY-MM-DD.`);
  if (date < today) throw new OpError("The date is in the past.");
  if (date > addDays(today, 365)) throw new OpError("Bookings can be up to a year ahead.");
  const time = clean(input.time, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new OpError("Use a time like 09:30.");
  const adults = int(input.adults, 1, 40, "Adults");
  const children = int(input.children ?? 0, 0, 20, "Children");
  const base = {
    code: nextCode(s),
    customer,
    country: clean(input.country, 40) || "Not given",
    email: clean(input.email, 80) || undefined,
    adults,
    children,
    date,
    time,
    pickup: clean(input.pickup, 100) || undefined,
    notes: clean(input.notes, 300) || undefined,
    status: "request" as const,
    driver: null,
    source: actor as BookingSource,
    createdAt: nowISO(),
  };
  let b: Booking;
  if (input.kind === "tour") {
    const a = input.activity ? findActivity(s, input.activity) : undefined;
    if (!a) throw new OpError(`Choose one of the tours: ${s.activities.map((x) => x.name).join(", ")}.`);
    if (!a.times.includes(time)) throw new OpError(`${a.name} leaves at ${a.times.join(" or ")}.`);
    const left = a.seats - seatsTaken(s, a.id, date, time);
    if (adults + children > left) throw new OpError(left > 0 ? `Only ${left} seats left on ${a.name} at ${time} that day.` : `${a.name} at ${time} is full that day.`);
    b = { ...base, kind: "tour", activity: a.id, total: adults * a.adult + children * a.child };
  } else {
    const from = input.from ? findZone(s, input.from) : undefined;
    const to = input.to ? findZone(s, input.to) : undefined;
    if (!from || !to) throw new OpError(`Choose the origin and destination among: ${s.zones.map((z) => z.name).join(", ")}.`);
    if (from.id === to.id) throw new OpError("Origin and destination are the same place.");
    const people = adults + children;
    const fits = s.vehicles.filter((v) => v.seats >= people && rateFor(s, from.id, to.id, v.id)).sort((x, y) => x.seats - y.seats);
    const v = input.vehicle ? findVehicle(s, input.vehicle) : fits[0];
    if (!v) throw new OpError(`No vehicle with a rate on ${from.name} → ${to.name} seats ${people}; this one needs a custom quote.`);
    if (v.seats < people) throw new OpError(`A ${v.name} seats ${v.seats}; the group is ${people}.`);
    const price = rateFor(s, from.id, to.id, v.id);
    if (!price) throw new OpError(`There is no ${v.name} rate for ${from.name} → ${to.name}; it needs a custom quote.`);
    b = { ...base, kind: "transfer", from: from.id, to: to.id, vehicle: v.id, total: price };
  }
  s.bookings.push(b);
  if (actor === "web") markSetup(s, "web");
  log(s, actor, `${actor === "web" ? "New request from the booking page" : `${who(actor)} added a booking request`}: ${b.code} · ${b.customer} · ${describe(s, b).service} · ${b.date} ${b.time} · ${money(b.total)}.`);
  return { ok: true, booking: describe(s, b), next: "It is a request: a person confirms it in the panel." };
}

// ---------------------------------------------------------------------------------------------------------
// Onboarding: the business profile, rates from a spreadsheet, tours and the team.

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export type Profile = { name?: string; tagline?: string; phone?: string; email?: string; prefix?: string; color?: string; logo?: string | null };

export function updateProfile(s: State, p: Profile, actor: Actor) {
  const b = s.business;
  const changed: string[] = [];
  if (p.name !== undefined) {
    const n = clean(p.name, 60);
    if (n.length < 2) throw new OpError("The business name needs at least 2 characters.");
    b.name = n;
    changed.push("name");
  }
  if (p.tagline !== undefined) (b.tagline = clean(p.tagline, 120)), changed.push("tagline");
  if (p.phone !== undefined) (b.phone = clean(p.phone, 40)), changed.push("phone");
  if (p.email !== undefined) (b.email = clean(p.email, 80)), changed.push("email");
  if (p.prefix !== undefined) {
    const x = clean(p.prefix, 6).toUpperCase();
    if (!/^[A-Z]{2,4}$/.test(x)) throw new OpError("The booking code prefix must be 2 to 4 letters, like CBR.");
    b.prefix = x;
    changed.push("booking prefix");
  }
  if (p.color !== undefined) {
    if (!HEX.test(p.color)) throw new OpError("Use a brand color like #0d4a47.");
    b.color = p.color.toLowerCase();
    changed.push("brand color");
  }
  if (p.logo !== undefined) {
    if (p.logo !== null && (!LOGO.test(p.logo) || p.logo.length > 90_000)) throw new OpError("The logo must be a PNG, JPG or WebP image under 60 KB.");
    b.logo = p.logo;
    changed.push(p.logo ? "logo" : "logo removed");
    if (p.logo) markSetup(s, "logo");
  }
  if (!changed.length) throw new OpError("Nothing to change.");
  markSetup(s, "profile");
  log(s, actor, `${who(actor)} updated the business profile (${changed.join(", ")}).`);
  return { ok: true, business: { name: b.name, tagline: b.tagline, phone: b.phone, email: b.email, prefix: b.prefix, color: b.color } };
}

export type ImportRow = { from: string; to: string; vehicle: string; price: number };

const isAirport = (name: string) => /(airport|aeropuerto|aerop\.)/i.test(name) || /(^|[\s(])[A-Z]{3}($|[\s)])/.test(name);

export function guessSeats(name: string) {
  const n = norm(name);
  if (/(minibus|coaster|microbus|buseta|mini bus)/.test(n)) return 18;
  if (/(bus|autobus|coach)/.test(n)) return 30;
  if (/(sprinter|hiace|van|busito)/.test(n)) return 8;
  if (/(suv|4x4|camioneta|jeep)/.test(n)) return 4;
  if (/(sedan|car|auto|carro|taxi|vip)/.test(n)) return 3;
  return 6;
}

/** Turns spreadsheet rows into places, vehicles and rates (both directions unless the sheet says otherwise). */
export function buildImport(rows: ImportRow[], seats: Record<string, number> = {}, file?: string): ImportPayload {
  if (!Array.isArray(rows) || !rows.length) throw new OpError("The sheet has no rates.");
  if (rows.length > 800) throw new OpError("Up to 800 rates per import in this demo.");
  const zones = new Map<string, Zone>();
  const vehicles = new Map<string, Vehicle>();
  const explicit = new Map<string, Rate>();
  const zoneId = (raw: string) => {
    const name = clean(raw, 60);
    if (!name) throw new OpError("A row is missing its origin or destination.");
    const id = slug(name) || `p${zones.size + 1}`;
    if (!zones.has(id)) {
      if (zones.size >= 80) throw new OpError("Up to 80 places per import in this demo.");
      zones.set(id, { id, name, kind: isAirport(name) ? "airport" : "town", aliases: [norm(name)] });
    }
    return id;
  };
  const vehicleId = (raw: string) => {
    const name = clean(raw, 30);
    if (!name) throw new OpError("A row is missing its vehicle.");
    const id = slug(name, 16) || `v${vehicles.size + 1}`;
    if (!vehicles.has(id)) {
      if (vehicles.size >= 8) throw new OpError("Up to 8 vehicle types per import in this demo.");
      const n = Number(seats[name] ?? seats[id]);
      const st = Number.isInteger(n) && n > 0 && n <= 60 ? n : guessSeats(name);
      vehicles.set(id, { id, name, seats: st, bags: st });
    }
    return id;
  };
  for (const r of rows) {
    const price = Math.round(Number(r.price));
    if (!Number.isFinite(price) || price <= 0 || price > 100_000) continue;
    const from = zoneId(String(r.from ?? ""));
    const to = zoneId(String(r.to ?? ""));
    if (from === to) continue;
    const vehicle = vehicleId(String(r.vehicle ?? ""));
    explicit.set(`${from}|${to}|${vehicle}`, { from, to, vehicle, price });
  }
  if (!explicit.size) throw new OpError("No row had a valid price.");
  const rates = [...explicit.values()];
  for (const r of [...explicit.values()]) {
    const back = `${r.to}|${r.from}|${r.vehicle}`;
    if (!explicit.has(back)) rates.push({ from: r.to, to: r.from, vehicle: r.vehicle, price: r.price });
  }
  // Only keep places that ended up with a rate, airports first, and vehicles from small to large.
  const used = new Set(rates.flatMap((r) => [r.from, r.to]));
  const zs = [...zones.values()].filter((z) => used.has(z.id)).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "airport" ? -1 : 1));
  const vs = [...vehicles.values()].sort((a, b) => a.seats - b.seats);
  return { zones: zs, vehicles: vs, rates, file: file ? clean(file, 80) : undefined };
}

export function importSummary(p: ImportPayload) {
  return `${p.rates.length} rates · ${p.zones.length} places · ${p.vehicles.length} vehicle${p.vehicles.length === 1 ? "" : "s"}`;
}

export function applyImport(s: State, p: ImportPayload, actor: Actor) {
  const old = s.zones;
  for (const a of s.activities) if (!p.zones.some((z) => z.id === a.zone)) a.zone = old.find((z) => z.id === a.zone)?.name ?? a.zone;
  s.zones = p.zones;
  s.vehicles = p.vehicles;
  s.rates = p.rates;
  s.drivers.forEach((d, i) => {
    if (!s.vehicles.some((v) => v.id === d.vehicle)) d.vehicle = s.vehicles[Math.max(0, s.vehicles.length - 1 - (i % s.vehicles.length))].id;
  });
  // Sample transfers move onto the new routes, so the panel keeps showing a working day.
  const pairs: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const r of s.rates) {
    const k = [r.from, r.to].sort().join("|");
    if (!seen.has(k)) seen.add(k), pairs.push([r.from, r.to]);
  }
  let i = 0;
  for (const b of s.bookings) {
    if (b.kind !== "transfer") continue;
    if (s.zones.some((z) => z.id === b.from) && s.zones.some((z) => z.id === b.to) && s.vehicles.some((v) => v.id === b.vehicle)) continue;
    const [from, to] = pairs[i++ % pairs.length];
    const people = b.adults + b.children;
    const v = [...s.vehicles].sort((x, y) => x.seats - y.seats).find((x) => x.seats >= people && rateFor(s, from, to, x.id)) ?? s.vehicles.find((x) => rateFor(s, from, to, x.id));
    b.from = from;
    b.to = to;
    if (v) (b.vehicle = v.id), (b.total = rateFor(s, from, to, v.id) ?? b.total);
    const d = s.drivers.find((x) => x.id === b.driver);
    const dv = s.vehicles.find((x) => x.id === d?.vehicle);
    if (d && v && dv && dv.seats < v.seats) b.driver = null;
  }
  for (const d of s.drafts) if (d.status === "pending" && (d.kind ?? "rates") === "rates") d.status = "discarded";
  markSetup(s, "rates");
  log(s, actor, `${who(actor)} loaded the rate sheet${p.file ? ` “${p.file}”` : ""}: ${importSummary(p)}.`);
  return { ok: true, summary: importSummary(p) };
}

export function proposeImport(s: State, rows: ImportRow[], seats: Record<string, number>, reason: string, actor: "claude" | "team") {
  const p = buildImport(rows, seats);
  const draft: Draft = { id: nextDraftId(s), kind: "import", title: `Load a new rate sheet: ${importSummary(p)}`, reason: clean(reason, 300) || "Rates from the owner's sheet.", changes: [], import: p, status: "pending", createdAt: nowISO(), source: actor };
  s.drafts.push(draft);
  log(s, actor, `${who(actor)} prepared draft ${draft.id} from a rate sheet (${importSummary(p)}). It replaces the current rates once a person approves it.`);
  return {
    draft: draft.id,
    summary: importSummary(p),
    places: p.zones.map((z) => z.name),
    vehicles: p.vehicles.map((v) => `${v.name} (${v.seats} seats)`),
    status: "Waiting for approval in the panel. The current rates stay live until then.",
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseTour(s: State, t: Partial<Activity> & { name?: string; place?: string }): Activity {
  const name = clean(t.name, 60);
  if (name.length < 3) throw new OpError("Give the tour a name.");
  const times = (Array.isArray(t.times) ? t.times : String(t.times ?? "").split(/[,\s]+/)).map((x) => clean(String(x), 5)).filter(Boolean).map((x) => (/^\d:\d\d$/.test(x) ? `0${x}` : x));
  if (!times.length || times.length > 8 || times.some((x) => !TIME.test(x))) throw new OpError("Add 1 to 8 departure times like 08:00, 14:00.");
  const adult = int(t.adult, 1, 5000, "The adult price");
  const child = int(t.child ?? 0, 0, 5000, "The child price");
  const seats = int(t.seats, 1, 200, "Seats");
  const place = clean(t.place ?? t.zone, 60);
  const zone = place ? (findZone(s, place)?.id ?? place) : "";
  const id = t.id && s.activities.some((a) => a.id === t.id) ? t.id : slug(name, 20) || `t${s.activities.length + 1}`;
  return { id, name, zone, adult, child, times: [...new Set(times)].sort(), seats, duration: clean(t.duration, 20) || "2 h" };
}

export function saveTour(s: State, tour: Activity, actor: Actor) {
  const i = s.activities.findIndex((a) => a.id === tour.id);
  if (i === -1 && s.activities.length >= 30) throw new OpError("Up to 30 tours in this demo.");
  if (i === -1) s.activities.push(tour);
  else s.activities[i] = tour;
  markSetup(s, "tours");
  log(s, actor, `${who(actor)} ${i === -1 ? "added" : "updated"} the tour ${tour.name} (${money(tour.adult)} adult, ${tour.times.join(", ")}).`);
  return { ok: true, tour: tour.name };
}

export function removeTour(s: State, id: string, actor: Actor) {
  const a = s.activities.find((x) => x.id === id);
  if (!a) throw new OpError("That tour does not exist.");
  const today = todayISO(s.business.timezone);
  if (s.bookings.some((b) => b.activity === id && b.date >= today)) throw new OpError(`${a.name} has upcoming bookings; it stays.`);
  s.activities = s.activities.filter((x) => x.id !== id);
  markSetup(s, "tours");
  log(s, actor, `${who(actor)} removed the tour ${a.name}.`);
  return { ok: true };
}

export function proposeTour(s: State, t: Parameters<typeof parseTour>[1], reason: string, actor: "claude" | "team") {
  const tour = parseTour(s, t);
  const draft: Draft = { id: nextDraftId(s), kind: "tour", title: `${s.activities.some((a) => a.id === tour.id) ? "Update" : "New"} tour: ${tour.name}`, reason: clean(reason, 300) || "Prepared from the owner's description.", changes: [], tour, status: "pending", createdAt: nowISO(), source: actor };
  s.drafts.push(draft);
  log(s, actor, `${who(actor)} prepared draft ${draft.id}: ${draft.title}. It goes on sale once a person approves it.`);
  return { draft: draft.id, tour: { name: tour.name, place: zoneName(s, tour.zone), adult: money(tour.adult), child: money(tour.child), times: tour.times, seats: tour.seats, duration: tour.duration }, status: "Waiting for approval in the panel." };
}

const LANGS = /^[a-z]{2}$/;

export function saveDriver(s: State, d: { id?: string; name?: string; vehicle?: string; languages?: string[] | string }, actor: Actor) {
  const name = clean(d.name, 40);
  if (name.length < 2) throw new OpError("Add the driver's name.");
  const v = d.vehicle ? findVehicle(s, d.vehicle) : s.vehicles[0];
  if (!v) throw new OpError(`Choose one of the vehicles: ${s.vehicles.map((x) => x.name).join(", ")}.`);
  const langs = (Array.isArray(d.languages) ? d.languages : String(d.languages ?? "es, en").split(/[,\s/]+/))
    .map((x) => norm(String(x)).slice(0, 2))
    .map((x) => ({ sp: "es", in: "en", ge: "de", al: "de", fe: "fr", it: "it" })[x] ?? x)
    .filter((x) => LANGS.test(x));
  const existing = d.id ? s.drivers.find((x) => x.id === d.id) : undefined;
  if (!existing && s.drivers.length >= 30) throw new OpError("Up to 30 drivers in this demo.");
  const driver: Driver = { id: existing?.id ?? (slug(name, 16) || `d${s.drivers.length + 1}`), name, vehicle: v.id, languages: [...new Set(langs)].slice(0, 6) };
  if (!existing && s.drivers.some((x) => x.id === driver.id)) driver.id = `${driver.id}${s.drivers.length + 1}`;
  if (existing) Object.assign(existing, driver);
  else s.drivers.push(driver);
  markSetup(s, "team");
  log(s, actor, `${who(actor)} ${existing ? "updated" : "added"} the driver ${name} (${v.name}${driver.languages.length ? `, ${driver.languages.join("/")}` : ""}).`);
  return { ok: true, driver: { name, vehicle: v.name, languages: driver.languages } };
}

export function removeDriver(s: State, id: string, actor: Actor) {
  const d = s.drivers.find((x) => x.id === id);
  if (!d) throw new OpError("That driver does not exist.");
  for (const b of s.bookings) if (b.driver === id) b.driver = null;
  s.drivers = s.drivers.filter((x) => x.id !== id);
  markSetup(s, "team");
  log(s, actor, `${who(actor)} removed the driver ${d.name}; their services are unassigned.`);
  return { ok: true };
}

export type Links = { panel: string; booking: string; connector: string };

export function setupChecklist(s: State, links?: Links) {
  const st = s.setup ?? { mode: "sample" };
  const items = [
    { key: "profile", step: "Business profile", done: !!st.profile, how: "Name, tagline, WhatsApp, email, booking code prefix and brand color. Panel → Setup → Business, or ask Claude (update_business_profile)." },
    { key: "logo", step: "Logo", done: !!s.business.logo, how: "Upload it in the panel → Setup → Business (PNG, JPG, WebP or SVG)." },
    { key: "rates", step: "Transfer rates", done: !!st.rates, how: "Upload an Excel (.xlsx) or CSV in the panel → Setup → Rates, or share the sheet with Claude: it reads it and loads it with import_rates as a draft you approve." },
    { key: "tours", step: "Tours", done: !!st.tours, how: "Add or edit tours in the panel → Setup → Tours, or describe them to Claude (add_tour, as a draft)." },
    { key: "team", step: "Drivers", done: !!st.team, how: "Add your drivers with their vehicle and languages in the panel → Setup → Team, or ask Claude (add_driver)." },
    { key: "claude", step: "Claude connected", done: !!st.claude, how: `Add ${links?.connector ?? "the connector URL"} in Claude → Settings → Connectors.` },
    { key: "web", step: "First request from the booking page", done: !!st.web, how: `Open ${links?.booking ?? "the booking page"}, book a transfer or a tour, and watch it arrive in the panel.` },
  ];
  const done = items.filter((i) => i.done).length;
  return {
    business: s.business.name,
    mode: st.mode === "own" ? "Setting up their own business (sample data fills the gaps)" : "Exploring the sample business",
    progress: `${done}/${items.length}`,
    missing: items.filter((i) => !i.done).map((i) => i.step),
    items: items.map(({ key: _k, ...rest }) => rest),
    ...(links ? { panel: links.panel, bookingPage: links.booking } : {}),
  };
}

/** Rates as rows for a spreadsheet: one row per route, one column per vehicle (the format the import reads). */
export function ratesSheet(s: State) {
  const seen = new Set<string>();
  const head = ["From", "To", ...s.vehicles.map((v) => v.name)];
  const rows: string[][] = [];
  for (const r of s.rates) {
    const k = [r.from, r.to].sort().join("|");
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push([zoneName(s, r.from), zoneName(s, r.to), ...s.vehicles.map((v) => String(rateFor(s, r.from, r.to, v.id) ?? ""))]);
  }
  return [head, ...rows];
}
