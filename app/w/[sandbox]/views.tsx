"use client";

import { useMemo, useState } from "react";
import { addDays, todayISO } from "@/lib/dates";
import { rateFor, ratesSheet, zoneName } from "@/lib/ops";
import { download, toCsv } from "@/lib/sheet";
import type { Booking } from "@/lib/types";
import { Activity, Asks, BookingPageCard, Card, ConnectCard, dayLabel, Drafts, money, SetupProgress, type Api } from "./ui";

const ASKS = [
  "What's on tomorrow, and which services still need a driver?",
  "Assign drivers to tomorrow's services without clashing times.",
  "A customer wrote on WhatsApp: “2 adults, SJO airport to La Fortuna next Friday at 10:30, name Ana Ruiz”. Add it as a request.",
  "Raise Van rates by 10% for the high season, as a draft.",
  "Let's set up my own business. What's missing?",
  "¿Qué tengo para mañana? Redacta el recordatorio para el cliente de CBR-1043.",
];

type Tab = "today" | "tomorrow" | "week";

function useLabels(api: Api) {
  const { s } = api;
  const veh = (id?: string) => s.vehicles.find((v) => v.id === id)?.name ?? "";
  const act = (id?: string) => s.activities.find((a) => a.id === id)?.name ?? id ?? "";
  const title = (b: Booking) => (b.kind === "transfer" ? `${zoneName(s, b.from)} → ${zoneName(s, b.to)}` : act(b.activity));
  const fitting = (b: Booking) => s.drivers.filter((d) => !b.vehicle || (s.vehicles.find((v) => v.id === d.vehicle)?.seats ?? 0) >= (s.vehicles.find((v) => v.id === b.vehicle)?.seats ?? 0));
  return { veh, title, fitting };
}

const SOURCE: Record<string, string> = { web: "Booking page", claude: "Claude", team: "Team" };

function ServiceRow({ api, b, flash, showDate }: { api: Api; b: Booking; flash: boolean; showDate: boolean }) {
  const { busy, act } = api;
  const { veh, title, fitting } = useLabels(api);
  return (
    <div className={`svc${flash ? " flash" : ""}${b.status === "request" ? " req" : ""}`}>
      <div className="t">{b.time}<small>{showDate ? dayLabel(b.date) : b.code}</small></div>
      <div className="w">
        <b>{title(b)}</b>
        <span>{b.customer} · {b.adults + b.children} traveler{b.adults + b.children === 1 ? "" : "s"}{b.vehicle ? ` · ${veh(b.vehicle)}` : ""}{b.pickup ? ` · pickup ${b.pickup}` : ""}</span>
        <div className="chips">
          <span className={`chip ${b.kind}`}>{b.kind === "transfer" ? "Transfer" : "Tour"}</span>
          {showDate && <span className="chip">{b.code}</span>}
          {b.status === "request" && <span className="chip warn">To confirm</span>}
          {b.source && SOURCE[b.source] && <span className={`chip ${b.source === "claude" ? "claude" : b.source === "web" ? "web" : "team"}`}>{SOURCE[b.source]}</span>}
          <span className="chip">{money(b.total)}</span>
          {b.notes && <span className="chip" title={b.notes}>Note</span>}
        </div>
      </div>
      <div className="d">
        {b.status === "request" && (
          <button className="btn ok sm full" disabled={busy === `c-${b.code}`} onClick={() => act(`c-${b.code}`, { type: "confirm", code: b.code }, `${b.code} confirmed`)}>Confirm</button>
        )}
        <label className="sr" htmlFor={`d-${b.code}`}>Driver for {b.code}</label>
        <select id={`d-${b.code}`} className={`sel${b.driver ? "" : " empty"}`} value={b.driver ?? ""} disabled={busy === b.code}
          onChange={(e) => act(b.code, { type: "assign", code: b.code, driver: e.target.value || null }, e.target.value ? `Driver assigned to ${b.code}` : `Driver removed from ${b.code}`)}>
          <option value="">No driver yet</option>
          {fitting(b).map((d) => <option key={d.id} value={d.id}>{d.name} · {veh(d.vehicle)}</option>)}
        </select>
      </div>
    </div>
  );
}

export function TodayView({ api, flash, freshLog }: { api: Api; flash: Set<string>; freshLog: Set<string> }) {
  const { s } = api;
  const [tab, setTab] = useState<Tab>("today");
  const today = todayISO(s.business.timezone);
  const sorted = useMemo(() => [...s.bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), [s.bookings]);
  const list = sorted.filter((b) => (tab === "today" ? b.date === today : tab === "tomorrow" ? b.date === addDays(today, 1) : b.date >= today && b.date <= addDays(today, 7)));
  const next3 = sorted.filter((b) => b.date >= today && b.date <= addDays(today, 3));
  const pending = s.drafts.filter((d) => d.status === "pending");
  const week = sorted.filter((b) => b.date >= today && b.date <= addDays(today, 7)).reduce((t, b) => t + b.total, 0);
  const requests = sorted.filter((b) => b.status === "request" && b.date >= today);
  const setupDone = [s.setup?.profile, s.business.logo, s.setup?.rates, s.setup?.tours, s.setup?.team, s.setup?.claude, s.setup?.web].every(Boolean);

  return (
    <>
      {!setupDone && <SetupProgress api={api} />}

      <section className="kpis" aria-label="At a glance">
        <div className="kpi"><span>Services today</span><b>{s.bookings.filter((b) => b.date === today).length}</b></div>
        <div className="kpi"><span>Tomorrow</span><b>{s.bookings.filter((b) => b.date === addDays(today, 1)).length}</b></div>
        <div className={`kpi${requests.length ? " alert" : ""}`}><span>Requests to confirm</span><b>{requests.length}</b></div>
        <div className={`kpi${next3.some((b) => !b.driver) ? " alert" : ""}`}><span>Without driver · 3 days</span><b>{next3.filter((b) => !b.driver).length}</b></div>
        <div className={`kpi${pending.length ? " claude" : ""}`}><span>Drafts to approve</span><b>{pending.length}</b></div>
        <div className="kpi"><span>Booked · next 7 days</span><b>{money(week)}</b></div>
      </section>

      <div className="pgrid">
        <div>
          {requests.length > 0 && (
            <Card title="New requests" id="req-title" className="card-req" right={<span className="chip warn">{requests.length} to confirm</span>}>
              {requests.slice(0, 6).map((b) => <ServiceRow key={b.code} api={api} b={b} flash={flash.has(b.code)} showDate />)}
              {requests.length > 6 && <p className="empty-state"><button className="linkbtn" onClick={() => api.go("bookings")}>See all {requests.length} requests →</button></p>}
            </Card>
          )}
          <Card
            title="Services"
            id="day-title"
            right={
              <div className="tabs" role="group" aria-label="Which days">
                {(["today", "tomorrow", "week"] as Tab[]).map((t) => (
                  <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "today" ? "Today" : t === "tomorrow" ? "Tomorrow" : "Next 7 days"}</button>
                ))}
              </div>
            }
          >
            {list.length === 0 && <p className="empty-state">Nothing booked for this day.</p>}
            {list.map((b) => <ServiceRow key={b.code} api={api} b={b} flash={flash.has(b.code)} showDate={tab === "week"} />)}
          </Card>
        </div>

        <aside>
          <ConnectCard api={api} />
          <Drafts api={api} />
          <Activity api={api} fresh={freshLog} />
          <BookingPageCard api={api} />
          <Asks api={api} asks={ASKS} />
        </aside>
      </div>
    </>
  );
}

type Filter = "upcoming" | "requests" | "unassigned" | "past" | "all";

export function BookingsView({ api, flash }: { api: Api; flash: Set<string> }) {
  const { s } = api;
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>("upcoming");
  const { title } = useLabels(api);
  const today = todayISO(s.business.timezone);
  const n = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rows = [...s.bookings]
    .filter((b) => (f === "upcoming" ? b.date >= today : f === "requests" ? b.status === "request" : f === "unassigned" ? !b.driver && b.date >= today : f === "past" ? b.date < today : true))
    .filter((b) => !q || n([b.code, b.customer, b.country, title(b), b.pickup ?? "", b.email ?? ""].join(" ")).includes(n(q)))
    .sort((a, b) => (f === "past" ? -1 : 1) * (a.date + a.time).localeCompare(b.date + b.time));
  const counts: Record<Filter, number> = {
    upcoming: s.bookings.filter((b) => b.date >= today).length,
    requests: s.bookings.filter((b) => b.status === "request").length,
    unassigned: s.bookings.filter((b) => !b.driver && b.date >= today).length,
    past: s.bookings.filter((b) => b.date < today).length,
    all: s.bookings.length,
  };
  return (
    <div className="stack">
      <div className="toolbar">
        <input className="input search" type="search" placeholder="Search by customer, code, place or tour" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bookings" />
        <div className="tabs" role="group" aria-label="Filter">
          {(["upcoming", "requests", "unassigned", "past", "all"] as Filter[]).map((x) => (
            <button key={x} aria-pressed={f === x} onClick={() => setF(x)}>{x === "upcoming" ? "Upcoming" : x === "requests" ? "Requests" : x === "unassigned" ? "No driver" : x === "past" ? "Past" : "All"} <em>{counts[x]}</em></button>
          ))}
        </div>
      </div>
      <Card title={`${rows.length} booking${rows.length === 1 ? "" : "s"}`} id="bk-title" right={<a className="btn ghost sm" href={api.links.booking} target="_blank" rel="noopener noreferrer">New booking on the booking page ↗</a>}>
        {rows.length === 0 && <p className="empty-state">No bookings match.</p>}
        {rows.map((b) => <ServiceRow key={b.code} api={api} b={b} flash={flash.has(b.code)} showDate />)}
      </Card>
    </div>
  );
}

export function CatalogView({ api }: { api: Api }) {
  const { s } = api;
  const zi = (id: string) => s.zones.findIndex((z) => z.id === id);
  const lastApproved = [...s.drafts].reverse().find((d) => d.status === "approved" && (d.kind ?? "rates") === "rates");
  const raised = new Set(lastApproved?.changes.map((c) => `${c.from}|${c.to}|${c.vehicle}`) ?? []);
  const routes = useMemo(() => {
    const seen = new Set<string>();
    return s.rates
      .filter((r) => zi(r.from) < zi(r.to))
      .filter((r) => (seen.has(`${r.from}|${r.to}`) ? false : (seen.add(`${r.from}|${r.to}`), true)))
      .sort((a, b) => zi(a.from) - zi(b.from) || zi(a.to) - zi(b.to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.rates, s.zones]);
  const exportCsv = () => download(`${s.business.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-rates.csv`, toCsv(ratesSheet(s)));
  return (
    <div className="stack">
      <Card
        title="Transfer rates"
        id="rates-title"
        right={
          <div className="row-actions">
            <span className="chip hide-sm">USD · taxes included · per vehicle</span>
            <button className="btn ghost sm" onClick={exportCsv}>Download (Excel/CSV)</button>
            <button className="btn primary sm brand" onClick={() => api.go("setup", "rates")}>Load my rates</button>
          </div>
        }
      >
        <div style={{ overflowX: "auto" }}>
          <table className="rates">
            <thead><tr><th>Route (both ways)</th>{s.vehicles.map((v) => <th key={v.id}>{v.name} <small>· {v.seats} seats</small></th>)}</tr></thead>
            <tbody>
              {routes.map((r) => (
                <tr key={`${r.from}${r.to}`}>
                  <td>{zoneName(s, r.from)} ↔ {zoneName(s, r.to)}</td>
                  {s.vehicles.map((v) => {
                    const p = rateFor(s, r.from, r.to, v.id);
                    return <td key={v.id} className={`n${raised.has(`${r.from}|${r.to}|${v.id}`) ? " up" : ""}`}>{p ? `$${p}` : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Tours" id="tours-title" right={<button className="btn ghost sm" onClick={() => api.go("setup", "tours")}>Edit tours</button>}>
        <div className="tour-grid">
          {s.activities.map((a) => (
            <article key={a.id} className="tour-card">
              <b>{a.name}</b>
              <span>{zoneName(s, a.zone) || "—"} · {a.duration}</span>
              <div className="chips">
                <span className="chip tour">{money(a.adult)} adult</span>
                <span className="chip">{money(a.child)} child</span>
                <span className="chip">{a.seats} seats</span>
              </div>
              <small>Departures: {a.times.join(", ")}</small>
            </article>
          ))}
          {s.activities.length === 0 && <p className="empty-state">No tours yet.</p>}
        </div>
      </Card>

      <Card title="Fleet and drivers" id="team-title" right={<button className="btn ghost sm" onClick={() => api.go("setup", "team")}>Edit team</button>}>
        <div className="tour-grid">
          {s.drivers.map((d) => (
            <article key={d.id} className="tour-card">
              <b>{d.name}</b>
              <span>{s.vehicles.find((v) => v.id === d.vehicle)?.name ?? "—"} · {s.vehicles.find((v) => v.id === d.vehicle)?.seats ?? "?"} seats</span>
              <div className="chips">{d.languages.map((l) => <span key={l} className="chip">{l.toUpperCase()}</span>)}</div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
