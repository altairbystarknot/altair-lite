"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Links } from "@/lib/ops";
import type { State } from "@/lib/types";
import { Wordmark } from "../../wordmark";
import { Setup } from "./setup";
import { ago, BrandMark, type Api, type View } from "./ui";
import { BookingsView, CatalogView, TodayView } from "./views";

// The owner's panel for one sandbox. It polls the sandbox every few seconds, so whatever Claude or a traveler
// on the booking page does shows up here on its own: new requests and assigned drivers flash, drafts appear
// for approval, and the activity feed says who did what.

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "today", label: "Today" },
  { id: "bookings", label: "Bookings" },
  { id: "catalog", label: "Rates & tours" },
  { id: "setup", label: "Setup" },
];

export function Panel({ sandbox, initial, links, startView }: { sandbox: string; initial: State; links: Links; startView: View }) {
  const [s, setS] = useState<State>(initial);
  const [view, setView] = useState<View>(startView);
  const [step, setStep] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [synced, setSynced] = useState<number | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const seenLog = useRef(new Set(initial.log.map((l) => l.id)));
  const [freshLog, setFreshLog] = useState<Set<string>>(new Set());
  const prev = useRef(new Map(initial.bookings.map((b) => [b.code, `${b.driver}|${b.status}`])));
  const toastTimer = useRef<number | undefined>(undefined);

  const say = useCallback((text: string, err = false) => {
    setToast({ text, err });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3400);
  }, []);

  const apply = useCallback((next: State) => {
    const changed = new Set<string>();
    for (const b of next.bookings) if (prev.current.get(b.code) !== `${b.driver}|${b.status}`) changed.add(b.code);
    prev.current = new Map(next.bookings.map((b) => [b.code, `${b.driver}|${b.status}`]));
    const fresh = new Set(next.log.filter((l) => !seenLog.current.has(l.id)).map((l) => l.id));
    fresh.forEach((id) => seenLog.current.add(id));
    if (changed.size) {
      setFlash(changed);
      window.setTimeout(() => setFlash(new Set()), 2600);
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

  const act = useCallback(
    async (key: string, body: Record<string, unknown>, done: string) => {
      setBusy(key);
      try {
        const r = await fetch(`/api/sandbox/${sandbox}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          say(j.error ?? "That did not work.", true);
          return false;
        }
        apply(j);
        say(done);
        return true;
      } catch {
        say("No connection. Try again.", true);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [sandbox, apply, say],
  );

  const copy = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        say(`${what} copied`);
      } catch {
        say("Copy it by hand: select the text.", true);
      }
    },
    [say],
  );

  const go = useCallback((v: View, st?: string) => {
    setView(v);
    setStep(st);
    window.scrollTo({ top: 0, behavior: "smooth" });
    const u = new URL(window.location.href);
    if (v === "today") u.searchParams.delete("view");
    else u.searchParams.set("view", v);
    window.history.replaceState(null, "", u);
  }, []);

  const api: Api = { s, busy, act, say, copy, links, now, go };
  const pending = s.drafts.filter((d) => d.status === "pending").length;
  const requests = s.bookings.filter((b) => b.status === "request").length;
  const brand = /^#[0-9a-f]{6}$/i.test(s.business.color ?? "") ? s.business.color! : "#16766b";

  return (
    <div className="panel-root" style={{ ["--brand" as string]: brand } as CSSProperties}>
      <div className="pbar">
        <div className="wrap">
          <Wordmark />
          <div className="biz">
            <BrandMark s={s} size={30} />
            <span className="biz-name">{s.business.name}</span>
          </div>
          <div className="grow" />
          <span className="live" title="The panel refreshes every few seconds"><i className="dot live" /> <span>Live{synced ? ` · ${ago(new Date(synced).toISOString(), now)}` : ""}</span></span>
          <a className="btn ghost sm hide-sm" href={links.booking} target="_blank" rel="noopener noreferrer">Booking page ↗</a>
          <button className="btn ghost sm" disabled={busy === "reset"} onClick={() => { if (window.confirm("Start over with fresh sample data? Everything you changed in this sandbox will be lost.")) act("reset", { type: "reset" }, "Fresh sample data loaded"); }}>Reset</button>
        </div>
        <nav className="wrap vnav" aria-label="Panel sections">
          {VIEWS.map((v) => (
            <button key={v.id} aria-current={view === v.id ? "page" : undefined} onClick={() => go(v.id)}>
              {v.label}
              {v.id === "today" && pending > 0 && <em className="badge claude">{pending}</em>}
              {v.id === "bookings" && requests > 0 && <em className="badge">{requests}</em>}
            </button>
          ))}
        </nav>
      </div>

      <main className="wrap">
        {view === "today" && <TodayView api={api} flash={flash} freshLog={freshLog} />}
        {view === "bookings" && <BookingsView api={api} flash={flash} />}
        {view === "catalog" && <CatalogView api={api} />}
        {view === "setup" && <Setup api={api} initialStep={step} />}
      </main>
      {toast && <div className={`toast${toast.err ? " err" : ""}`} role="status">{toast.text}</div>}
    </div>
  );
}
