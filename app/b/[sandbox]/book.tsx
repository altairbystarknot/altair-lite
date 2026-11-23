"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { Activity, Rate } from "@/lib/types";

// A traveler-facing booking page with the business's own logo, colors, routes, prices and tours. The price
// shown here is display only: the server computes it again from the same rates when the request arrives.

export type PublicData = {
  business: { name: string; tagline: string; phone: string; email: string; color: string; logo: string | null };
  zones: Array<{ id: string; name: string; kind: "airport" | "town" }>;
  vehicles: Array<{ id: string; name: string; seats: number }>;
  rates: Rate[];
  activities: Array<Activity & { place: string }>;
  taken: Record<string, number>;
  today: string;
};

type Done = { code: string; total: string; service: string; date: string; time: string };
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nice = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export function Book({ sandbox, data }: { sandbox: string; data: PublicData }) {
  const b = data.business;
  const [tab, setTab] = useState<"transfer" | "tour">(data.rates.length ? "transfer" : "tour");
  const [done, setDone] = useState<Done | null>(null);
  const brand = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#16766b";
  const initials = b.name.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <div className="bk" style={{ ["--brand" as string]: brand } as CSSProperties}>
      <div className="bk-demo">Demo booking page by <a href="/" target="_blank" rel="noopener noreferrer">Altair Lite</a> · nothing is charged · requests go to this business&apos;s sandbox panel</div>
      <header className="bk-hero">
        <div className="bk-wrap">
          <div className="bk-brand">
            {b.logo ? <img src={b.logo} alt="" className="bk-logo" /> : <span className="bk-logo mono">{initials}</span>}
            <div>
              <b>{b.name}</b>
              {b.tagline && <span>{b.tagline}</span>}
            </div>
          </div>
          <h1>Where are you <em>headed?</em></h1>
          <p>Private transfers door to door and small-group tours. See your price now and request your booking in a minute.</p>
        </div>
      </header>

      <main className="bk-wrap bk-main">
        {done ? (
          <section className="bk-card bk-done">
            <span className="bk-check" aria-hidden="true">✓</span>
            <h2>Request received</h2>
            <p>Booking <b>{done.code}</b> · {done.service} · {nice(done.date)} at {done.time} · <b>{done.total}</b></p>
            <p className="muted">{b.name} confirms it shortly{b.phone ? ` (WhatsApp ${b.phone})` : ""}. In this demo, it has just appeared in the business&apos;s panel, under Today → New requests.</p>
            <button className="bk-btn" onClick={() => setDone(null)}>Book something else</button>
          </section>
        ) : (
          <section className="bk-card">
            <div className="bk-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "transfer"} onClick={() => setTab("transfer")} disabled={!data.rates.length}>Private transfer</button>
              <button role="tab" aria-selected={tab === "tour"} onClick={() => setTab("tour")} disabled={!data.activities.length}>Tours</button>
            </div>
            {tab === "transfer" ? <Transfer sandbox={sandbox} data={data} onDone={setDone} /> : <Tours sandbox={sandbox} data={data} onDone={setDone} />}
          </section>
        )}
        <footer className="bk-foot">
          <span>{b.name}{b.email ? ` · ${b.email}` : ""}{b.phone ? ` · ${b.phone}` : ""}</span>
          <span>Prices in USD, taxes included</span>
        </footer>
      </main>
    </div>
  );
}

function Contact({ busy, err, onSubmit, total, label }: { busy: boolean; err: string | null; onSubmit: (c: { customer: string; email: string; country: string; notes: string; pickup: string }) => void; total: number | null; label: string }) {
  const [c, setC] = useState({ customer: "", email: "", country: "", notes: "", pickup: "" });
  const set = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC({ ...c, [k]: e.target.value });
  return (
    <form className="bk-contact" onSubmit={(e) => (e.preventDefault(), onSubmit(c))}>
      <div className="bk-grid">
        <label><span>Full name</span><input required minLength={2} maxLength={60} value={c.customer} onChange={set("customer")} autoComplete="name" /></label>
        <label><span>Email</span><input type="email" maxLength={80} value={c.email} onChange={set("email")} autoComplete="email" /></label>
        <label><span>Country</span><input maxLength={40} value={c.country} onChange={set("country")} autoComplete="country-name" /></label>
        <label><span>Hotel or pickup point</span><input maxLength={100} value={c.pickup} onChange={set("pickup")} /></label>
      </div>
      <label><span>Notes (flight, child seats…)</span><textarea maxLength={300} rows={2} value={c.notes} onChange={set("notes")} /></label>
      {err && <p className="bk-err" role="alert">{err}</p>}
      <div className="bk-total">
        <div><span>Total</span><b>{total !== null ? money(total) : "—"}</b><small>taxes included · pay on confirmation</small></div>
        <button className="bk-btn" disabled={busy || total === null}>{busy ? "Sending…" : label}</button>
      </div>
    </form>
  );
}

async function send(sandbox: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/book/${sandbox}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "That did not work. Please try again.");
  return j as { booking: { code: string; total: string; service: string; date: string; time: string } };
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="bk-step">
      <span>{label}</span>
      <div>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
        <b>{value}</b>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}

function Transfer({ sandbox, data, onDone }: { sandbox: string; data: PublicData; onDone: (d: Done) => void }) {
  const origins = useMemo(() => data.zones.filter((z) => data.rates.some((r) => r.from === z.id)), [data]);
  const [from, setFrom] = useState(origins[0]?.id ?? "");
  const dests = data.zones.filter((z) => data.rates.some((r) => r.from === from && r.to === z.id));
  const [to, setTo] = useState(dests[0]?.id ?? "");
  const [date, setDate] = useState(addDays(data.today, 2));
  const [time, setTime] = useState("10:00");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const people = adults + children;
  const toOk = dests.some((z) => z.id === to) ? to : (dests[0]?.id ?? "");
  const options = data.vehicles
    .map((v) => ({ v, price: data.rates.find((r) => r.from === from && r.to === toOk && r.vehicle === v.id)?.price }))
    .filter((o) => o.price && o.v.seats >= people)
    .sort((a, b) => a.v.seats - b.v.seats);
  const chosen = options.find((o) => o.v.id === vehicle) ?? options[0];
  const submit = async (c: { customer: string; email: string; country: string; notes: string; pickup: string }) => {
    setBusy(true);
    setErr(null);
    try {
      const j = await send(sandbox, { kind: "transfer", from, to: toOk, vehicle: chosen?.v.id, date, time, adults, children, ...c });
      onDone(j.booking);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bk-body">
      <div className="bk-grid">
        <label><span>From</span><select value={from} onChange={(e) => (setFrom(e.target.value), setVehicle(null))}>{origins.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
        <label><span>To</span><select value={toOk} onChange={(e) => (setTo(e.target.value), setVehicle(null))}>{dests.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
        <label><span>Date</span><input type="date" min={data.today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span>Pickup time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <div className="bk-steppers">
        <Stepper label="Adults" value={adults} min={1} max={40} onChange={setAdults} />
        <Stepper label="Children" value={children} min={0} max={20} onChange={setChildren} />
      </div>
      <div className="bk-options" role="radiogroup" aria-label="Vehicle">
        {options.length === 0 && <p className="muted">No vehicle on this route seats {people}. Write to us for a custom quote.</p>}
        {options.map((o) => (
          <button key={o.v.id} type="button" role="radio" aria-checked={chosen?.v.id === o.v.id} className="bk-opt" onClick={() => setVehicle(o.v.id)}>
            <b>{o.v.name}</b>
            <span>Up to {o.v.seats} travelers · private</span>
            <em>{money(o.price!)}</em>
          </button>
        ))}
      </div>
      <Contact busy={busy} err={err} onSubmit={submit} total={chosen?.price ?? null} label="Request this transfer" />
    </div>
  );
}

function Tours({ sandbox, data, onDone }: { sandbox: string; data: PublicData; onDone: (d: Done) => void }) {
  const [id, setId] = useState(data.activities[0]?.id ?? "");
  const a = data.activities.find((x) => x.id === id) ?? data.activities[0];
  const [date, setDate] = useState(addDays(data.today, 2));
  const [time, setTime] = useState<string | null>(null);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!a) return <p className="muted bk-body">No tours yet.</p>;
  const left = (t: string) => Math.max(0, a.seats - (data.taken[`${a.id}|${date}|${t}`] ?? 0));
  const slot = time && a.times.includes(time) ? time : (a.times.find((t) => left(t) >= adults + children) ?? null);
  const total = adults * a.adult + children * a.child;
  const submit = async (c: { customer: string; email: string; country: string; notes: string; pickup: string }) => {
    if (!slot) return setErr("Choose a departure with seats left.");
    setBusy(true);
    setErr(null);
    try {
      const j = await send(sandbox, { kind: "tour", activity: a.id, date, time: slot, adults, children, ...c });
      onDone(j.booking);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bk-body">
      <div className="bk-tours">
        {data.activities.map((x) => (
          <button key={x.id} type="button" className={`bk-tour${x.id === a.id ? " on" : ""}`} onClick={() => (setId(x.id), setTime(null))}>
            <b>{x.name}</b>
            <span>{x.place ? `${x.place} · ` : ""}{x.duration}</span>
            <em>from {money(x.adult)}</em>
          </button>
        ))}
      </div>
      <div className="bk-grid">
        <label><span>Date</span><input type="date" min={data.today} value={date} onChange={(e) => (setDate(e.target.value), setTime(null))} /></label>
        <div className="bk-slots">
          <span>Departure</span>
          <div>
            {a.times.map((t) => (
              <button key={t} type="button" className={`bk-slot${slot === t ? " on" : ""}`} disabled={left(t) < adults + children} onClick={() => setTime(t)}>
                {t}<small>{left(t)} left</small>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="bk-steppers">
        <Stepper label="Adults" value={adults} min={1} max={40} onChange={setAdults} />
        <Stepper label="Children" value={children} min={0} max={20} onChange={setChildren} />
        <p className="muted">{money(a.adult)} adult · {money(a.child)} child</p>
      </div>
      <Contact busy={busy} err={err} onSubmit={submit} total={slot ? total : null} label="Request this tour" />
    </div>
  );
}
