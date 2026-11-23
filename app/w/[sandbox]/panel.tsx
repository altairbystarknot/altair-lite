"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, todayISO } from "@/lib/dates";
import type { Booking, State } from "@/lib/types";
import { Wordmark } from "../../wordmark";

// The owner's panel for one sandbox. It polls the sandbox every few seconds, so whatever Claude does through
// the connector shows up here on its own: assigned drivers flash, drafts appear for approval, and the
// activity feed says who did what.

const ASKS = [
  "What's on tomorrow, and which services still need a driver?",
  "Assign drivers to tomorrow's services without clashing times.",
  "Quote a transfer from SJO airport to La Fortuna for 5 people.",
  "Raise Van rates by 10% for the high season, as a draft.",
  "¿Qué tengo para mañana? Redacta el recordatorio para el cliente de CBR-1043.",
];

type Tab = "today" | "tomorrow" | "week";

const ago = (iso: string, now: number | null) => {
  if (now === null) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
};
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export function Panel({ sandbox, initial, mcpUrl }: { sandbox: string; initial: State; mcpUrl: string }) {
  const [s, setS] = useState<State>(initial);
  const [tab, setTab] = useState<Tab>("today");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [synced, setSynced] = useState<number | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const seenLog = useRef(new Set(initial.log.map((l) => l.id)));
  const [freshLog, setFreshLog] = useState<Set<string>>(new Set());
  const prevDrivers = useRef(new Map(initial.bookings.map((b) => [b.code, b.driver])));

  const say = useCallback((text: string, err = false) => {
    setToast({ text, err });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const apply = useCallback((next: State) => {
    const changed = new Set<string>();
    for (const b of next.bookings) if (prevDrivers.current.get(b.code) !== b.driver) changed.add(b.code);
    prevDrivers.current = new Map(next.bookings.map((b) => [b.code, b.driver]));
    const fresh = new Set(next.log.filter((l) => !seenLog.current.has(l.id)).map((l) => l.id));
    fresh.forEach((id) => seenLog.current.add(id));
    if (changed.size) {
      setFlash(changed);
      window.setTimeout(() => setFlash(new Set()), 2400);
    }
    if (fresh.size) setFreshLog(fresh);
    setS(next);
    setSynced(Date.now());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("altair-lite:sandbox", sandbox);
    } catch {
      /* storage unavailable */
    }
  }, [sandbox]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/sandbox/${sandbox}`, { cache: "no-store" });
        if (r.ok && !stop) apply(await r.json());
      } catch {
        /* offline for a moment */
      }
    };
    const a = window.setInterval(tick, 3000);
    setNow(Date.now());
    setSynced(Date.now());
    const b = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      window.clearInterval(a);
      window.clearInterval(b);
    };
  }, [sandbox, apply]);

  const act = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      const r = await fetch(`/api/sandbox/${sandbox}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) say(j.error ?? "That did not work.", true);
      else {
        apply(j);
        say(done);
      }
    } catch {
      say("No connection. Try again.", true);
    } finally {
      setBusy(null);
    }
  };

  const today = todayISO(s.business.timezone);
  const zone = (id?: string) => s.zones.find((z) => z.id === id)?.name ?? "";
  const veh = (id?: string) => s.vehicles.find((v) => v.id === id)?.name ?? "";
  const act_ = (id?: string) => s.activities.find((a) => a.id === id)?.name ?? "";
  const sorted = useMemo(() => [...s.bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), [s.bookings]);
  const list = sorted.filter((b) => (tab === "today" ? b.date === today : tab === "tomorrow" ? b.date === addDays(today, 1) : b.date >= today && b.date <= addDays(today, 7)));
  const next3 = sorted.filter((b) => b.date >= today && b.date <= addDays(today, 3));
  const pending = s.drafts.filter((d) => d.status === "pending");
  const week = sorted.filter((b) => b.date >= today && b.date <= addDays(today, 7)).reduce((t, b) => t + b.total, 0);
  const claudeActs = s.log.filter((l) => l.actor === "claude").length;
  const lastApproved = [...s.drafts].reverse().find((d) => d.status === "approved");
  const raised = new Set(lastApproved?.changes.map((c) => `${c.from}|${c.to}|${c.vehicle}`) ?? []);
  const zi = useCallback((id: string) => s.zones.findIndex((z) => z.id === id), [s.zones]);
  const routes = useMemo(() => {
    const seen = new Set<string>();
    return s.rates
      .filter((r) => zi(r.from) < zi(r.to))
      .filter((r) => (seen.has(`${r.from}|${r.to}`) ? false : (seen.add(`${r.from}|${r.to}`), true)))
      .sort((a, b) => zi(a.from) - zi(b.from) || zi(a.to) - zi(b.to));
  }, [s.rates, zi]);
  const price = (from: string, to: string, v: string) => s.rates.find((r) => r.from === from && r.to === to && r.vehicle === v)?.price;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      say(`${what} copied`);
    } catch {
      say("Copy it by hand: select the text.", true);
    }
  };

  const svcTitle = (b: Booking) => (b.kind === "transfer" ? `${zone(b.from)} → ${zone(b.to)}` : act_(b.activity));
  const fitting = (b: Booking) => s.drivers.filter((d) => !b.vehicle || (s.vehicles.find((v) => v.id === d.vehicle)?.seats ?? 0) >= (s.vehicles.find((v) => v.id === b.vehicle)?.seats ?? 0));

  return (
    <>
      <div className="pbar">
        <div className="wrap">
          <Wordmark />
          <div className="biz">{s.business.name} <span className="chip hide-sm">Sample data</span></div>
          <div className="grow" />
          <span className="live" title="The panel refreshes every few seconds"><i className="dot live" /> <span>Live{synced ? ` · synced ${ago(new Date(synced).toISOString(), now)}` : ""}</span></span>
          <button className="btn ghost sm" disabled={busy === "reset"} onClick={() => { if (window.confirm("Start over with fresh sample data? Your changes in this sandbox will be lost.")) act("reset", { type: "reset" }, "Fresh sample data loaded"); }}>Reset</button>
        </div>
      </div>

      <main className="wrap">
        <div className="banner">
          <b>Your private sandbox.</b> Connect it to Claude with your connector URL, then ask in plain words. Everything Claude does shows up here within seconds.
        </div>

        <section className="kpis" aria-label="Today at a glance">
          <div className="kpi"><span>Services today</span><b>{s.bookings.filter((b) => b.date === today).length}</b></div>
          <div className="kpi"><span>Tomorrow</span><b>{s.bookings.filter((b) => b.date === addDays(today, 1)).length}</b></div>
          <div className={`kpi${next3.some((b) => !b.driver) ? " alert" : ""}`}><span>Without driver · 3 days</span><b>{next3.filter((b) => !b.driver).length}</b></div>
          <div className={`kpi${pending.length ? " claude" : ""}`}><span>Drafts to approve</span><b>{pending.length}</b></div>
          <div className="kpi"><span>Booked · next 7 days</span><b>${week.toLocaleString("en-US")}</b></div>
        </section>

        <div className="pgrid">
          <div>
            <section className="card" aria-labelledby="day-title">
              <div className="chead">
                <h2 id="day-title">Services</h2>
                <div className="grow" />
                <div className="tabs" role="group" aria-label="Which days">
                  {(["today", "tomorrow", "week"] as Tab[]).map((t) => (
                    <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "today" ? "Today" : t === "tomorrow" ? "Tomorrow" : "Next 7 days"}</button>
                  ))}
                </div>
              </div>
              {list.length === 0 && <p className="empty-state">Nothing booked for this day.</p>}
              {list.map((b) => (
                <div key={b.code} className={`svc${flash.has(b.code) ? " flash" : ""}`}>
                  <div className="t">{b.time}<small>{tab === "week" ? dayLabel(b.date) : b.code}</small></div>
                  <div className="w">
                    <b>{svcTitle(b)}</b>
                    <span>{b.customer} · {b.adults + b.children} traveler{b.adults + b.children === 1 ? "" : "s"}{b.vehicle ? ` · ${veh(b.vehicle)}` : ""}{b.pickup ? ` · pickup ${b.pickup}` : ""}</span>
                    <div className="chips">
                      <span className={`chip ${b.kind}`}>{b.kind === "transfer" ? "Transfer" : "Tour"}</span>
                      {tab === "week" && <span className="chip">{b.code}</span>}
                      {b.status === "request" && <span className="chip warn">To confirm</span>}
                      <span className="chip">${b.total}</span>
                      {b.notes && <span className="chip" title={b.notes}>Note</span>}
                    </div>
                  </div>
                  <div className="d">
                    <label className="sr" htmlFor={`d-${b.code}`} style={{ position: "absolute", left: -9999 }}>Driver for {b.code}</label>
                    <select id={`d-${b.code}`} className={`sel${b.driver ? "" : " empty"}`} value={b.driver ?? ""} disabled={busy === b.code}
                      onChange={(e) => act(b.code, { type: "assign", code: b.code, driver: e.target.value || null }, e.target.value ? `Driver assigned to ${b.code}` : `Driver removed from ${b.code}`)}>
                      <option value="">No driver yet</option>
                      {fitting(b).map((d) => <option key={d.id} value={d.id}>{d.name} · {veh(d.vehicle)}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </section>

            <section className="card" aria-labelledby="rates-title">
              <div className="chead"><h2 id="rates-title">Transfer rates</h2><div className="grow" /><span className="chip">USD · taxes included</span></div>
              <div style={{ overflowX: "auto" }}>
                <table className="rates">
                  <thead><tr><th>Route (both ways)</th>{s.vehicles.map((v) => <th key={v.id}>{v.name}</th>)}</tr></thead>
                  <tbody>
                    {routes.map((r) => (
                      <tr key={`${r.from}${r.to}`}>
                        <td>{zone(r.from)} ↔ {zone(r.to)}</td>
                        {s.vehicles.map((v) => {
                          const p = price(r.from, r.to, v.id);
                          return <td key={v.id} className={`n${raised.has(`${r.from}|${r.to}|${v.id}`) ? " up" : ""}`}>{p ? `$${p}` : "—"}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside>
            <section className="card" aria-labelledby="connect-title">
              <div className="connect">
                <h2 id="connect-title" style={{ margin: 0, fontSize: 18, color: "var(--navy)", letterSpacing: "-0.02em" }}>Connect your Claude</h2>
                <div className="url"><code title={mcpUrl}>{mcpUrl}</code><button className="btn primary sm" onClick={() => copy(mcpUrl, "Connector URL")}>Copy</button></div>
                <ol className="how">
                  <li>In Claude (web or desktop): <b>Settings → Connectors → Add custom connector</b>.</li>
                  <li>Name it <b>Altair Lite</b>, paste the URL, and add it. No sign-in needed.</li>
                  <li>In a new chat, turn it on from the tools menu and ask away.</li>
                </ol>
                <p className="small">Anyone with this URL can use this sandbox. It only holds sample data.</p>
              </div>
            </section>

            <section className="card" aria-labelledby="drafts-title">
              <div className="chead"><h2 id="drafts-title">Waiting for your approval</h2><div className="grow" />{pending.length > 0 && <span className="chip claude">{pending.length}</span>}</div>
              {pending.length === 0 && <p className="empty-state">No drafts. Ask Claude to propose a rate change and it will appear here; nothing changes until you approve it.</p>}
              {pending.map((d) => (
                <article key={d.id} className="draft">
                  <header>
                    <span className={`chip ${d.source === "claude" ? "claude" : "team"}`}>{d.source === "claude" ? "Prepared by Claude" : "Team"} · {d.id}</span>
                    <b style={{ marginTop: 8 }}>{d.title}</b>
                    <p>{d.reason}</p>
                  </header>
                  <table>
                    <tbody>
                      {d.changes.filter((c) => zi(c.from) < zi(c.to)).slice(0, 5).map((c) => (
                        <tr key={`${c.from}${c.to}${c.vehicle}`}><td>{zone(c.from)} ↔ {zone(c.to)} · {veh(c.vehicle)}</td><td className="r"><s>${c.before}</s><b>${c.after}</b></td></tr>
                      ))}
                      {d.changes.filter((c) => zi(c.from) < zi(c.to)).length > 5 && <tr><td colSpan={2} style={{ color: "var(--soft)" }}>+ {d.changes.filter((c) => zi(c.from) < zi(c.to)).length - 5} more routes</td></tr>}
                    </tbody>
                  </table>
                  <footer>
                    <span className="grow">{d.changes.length} rates, both directions</span>
                    <button className="btn no sm" disabled={busy === d.id} onClick={() => act(d.id, { type: "discard", id: d.id }, `Draft ${d.id} discarded`)}>Discard</button>
                    <button className="btn ok sm" disabled={busy === d.id} onClick={() => act(d.id, { type: "approve", id: d.id }, `Draft ${d.id} approved: new rates are live`)}>Approve</button>
                  </footer>
                </article>
              ))}
            </section>

            <section className="card" aria-labelledby="feed-title">
              <div className="chead"><h2 id="feed-title">Activity</h2><div className="grow" /><span className="chip claude">Claude · {claudeActs}</span></div>
              <ul className="feed" aria-live="polite">
                {[...s.log].reverse().slice(0, 30).map((l) => (
                  <li key={l.id} className={freshLog.has(l.id) ? "fresh" : undefined}>
                    <span className={`chip ${l.actor === "claude" ? "claude" : l.actor === "team" ? "team" : ""}`}>{l.actor === "claude" ? "Claude" : l.actor === "team" ? "Team" : "System"}</span>
                    <div>{l.text}<time dateTime={l.at}>{ago(l.at, now)}</time></div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card" aria-labelledby="ask-title">
              <div className="chead"><h2 id="ask-title">Try asking Claude</h2></div>
              <div className="asks">
                {ASKS.map((q) => (
                  <button key={q} className="ask" onClick={() => copy(q, "Question")}><span>{q}</span><i>Copy</i></button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
      {toast && <div className={`toast${toast.err ? " err" : ""}`} role="status">{toast.text}</div>}
    </>
  );
}
