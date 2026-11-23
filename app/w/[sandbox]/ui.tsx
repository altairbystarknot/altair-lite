"use client";

import type { CSSProperties, ReactNode } from "react";
import { importSummary, setupChecklist, zoneName, type Links } from "@/lib/ops";
import type { State } from "@/lib/types";

export type View = "today" | "bookings" | "catalog" | "setup";
export type Api = {
  s: State;
  busy: string | null;
  act: (key: string, body: Record<string, unknown>, done: string) => Promise<boolean>;
  say: (text: string, err?: boolean) => void;
  copy: (text: string, what: string) => void;
  links: Links;
  now: number | null;
  go: (v: View, step?: string) => void;
};

export const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export const ago = (iso: string, now: number | null) => {
  if (now === null) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
};
export const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** The business's logo, or its initials on its brand color. */
export function BrandMark({ s, size = 34 }: { s: State; size?: number }) {
  const style = { width: size, height: size } as CSSProperties;
  if (s.business.logo) return <img className="bmark img" src={s.business.logo} alt="" style={style} />;
  const initials = s.business.name.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A";
  return <span className="bmark" style={{ ...style, fontSize: size * 0.4 }} aria-hidden="true">{initials}</span>;
}

export function Card({ title, id, right, children, className }: { title: ReactNode; id: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`} aria-labelledby={id}>
      <div className="chead"><h2 id={id}>{title}</h2><div className="grow" />{right}</div>
      {children}
    </section>
  );
}

export function SetupProgress({ api, compact = false }: { api: Api; compact?: boolean }) {
  const c = setupChecklist(api.s, api.links);
  const done = c.items.filter((i) => i.done).length;
  const pct = Math.round((done / c.items.length) * 100);
  return (
    <section className={`progress-card${compact ? " compact" : ""}`} aria-label="Setup progress">
      <div className="pc-top">
        <div>
          <p className="kicker">{api.s.setup?.mode === "own" ? "Your business" : "Make it yours"}</p>
          <h2>{done === c.items.length ? "Your business is set up." : api.s.setup?.mode === "own" ? "Set up your business" : "Try it with your own business"}</h2>
          <p className="muted">
            {done === c.items.length
              ? "Logo, rates, tours, team, Claude and the booking page are all working."
              : "Replace the sample data piece by piece: your logo, your rates from Excel, your tours and team. Claude can do most of it for you."}
          </p>
        </div>
        <div className="ring" style={{ ["--p" as string]: `${pct}%` }}><b>{done}/{c.items.length}</b></div>
      </div>
      {!compact && (
        <ol className="pc-steps">
          {c.items.map((i, n) => (
            <li key={i.step} className={i.done ? "done" : ""}>
              <button onClick={() => api.go("setup", ["profile", "profile", "rates", "tours", "team", "claude", "web"][n])}>
                <i aria-hidden="true">{i.done ? "✓" : n + 1}</i>
                <span>{i.step}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="pc-actions">
        <button className="btn primary sm brand" onClick={() => api.go("setup")}>{done ? "Continue setup" : "Start setup"} →</button>
        <a className="btn ghost sm" href={api.links.booking} target="_blank" rel="noopener noreferrer">Open booking page ↗</a>
      </div>
    </section>
  );
}

export function ConnectCard({ api }: { api: Api }) {
  const connected = !!api.s.setup?.claude;
  return (
    <Card title="Connect your Claude" id="connect-title" right={<span className={`chip ${connected ? "ok" : "warn"}`}>{connected ? "✓ Connected" : "Not yet"}</span>}>
      <div className="connect">
        <div className="url"><code title={api.links.connector}>{api.links.connector}</code><button className="btn primary sm" onClick={() => api.copy(api.links.connector, "Connector URL")}>Copy</button></div>
        <ol className="how">
          <li>In Claude (web or desktop): <b>Settings → Connectors → Add custom connector</b>.</li>
          <li>Name it <b>Altair Lite</b>, paste the URL and add it. No sign-in needed.</li>
          <li>In a new chat, turn it on from the tools menu and ask away.</li>
        </ol>
        <p className="small">Anyone with this URL can use this sandbox. Keep it to sample or test data.</p>
      </div>
    </Card>
  );
}

export function BookingPageCard({ api }: { api: Api }) {
  const web = api.s.bookings.filter((b) => b.source === "web").length;
  return (
    <Card title="Your booking page" id="bp-title" right={web ? <span className="chip ok">{web} request{web === 1 ? "" : "s"}</span> : undefined}>
      <div className="connect">
        <p className="muted" style={{ margin: "0 0 10px" }}>Travelers quote and book transfers and tours with your logo, colors and prices. Requests land here in seconds.</p>
        <div className="url"><code title={api.links.booking}>{api.links.booking}</code><button className="btn ghost sm" onClick={() => api.copy(api.links.booking, "Booking page link")}>Copy</button></div>
        <a className="btn primary sm brand" href={api.links.booking} target="_blank" rel="noopener noreferrer">Open booking page ↗</a>
      </div>
    </Card>
  );
}

export function Drafts({ api }: { api: Api }) {
  const { s, busy, act } = api;
  const pending = s.drafts.filter((d) => d.status === "pending");
  const zi = (id: string) => s.zones.findIndex((z) => z.id === id);
  const veh = (id: string) => s.vehicles.find((v) => v.id === id)?.name ?? id;
  return (
    <Card title="Waiting for your approval" id="drafts-title" right={pending.length > 0 ? <span className="chip claude">{pending.length}</span> : undefined}>
      {pending.length === 0 && <p className="empty-state">No drafts. When Claude proposes a rate change, loads a rate sheet or adds a tour, it waits here; nothing changes until you approve it.</p>}
      {pending.map((d) => {
        const kind = d.kind ?? "rates";
        const both = d.changes.filter((c) => zi(c.from) < zi(c.to));
        return (
          <article key={d.id} className="draft">
            <header>
              <span className={`chip ${d.source === "claude" ? "claude" : "team"}`}>{d.source === "claude" ? "Prepared by Claude" : "Team"} · {d.id}</span>
              <b style={{ marginTop: 8 }}>{d.title}</b>
              <p>{d.reason}</p>
            </header>
            {kind === "rates" && (
              <table>
                <tbody>
                  {both.slice(0, 5).map((c) => (
                    <tr key={`${c.from}${c.to}${c.vehicle}`}><td>{zoneName(s, c.from)} ↔ {zoneName(s, c.to)} · {veh(c.vehicle)}</td><td className="r"><s>${c.before}</s><b>${c.after}</b></td></tr>
                  ))}
                  {both.length > 5 && <tr><td colSpan={2} style={{ color: "var(--soft)" }}>+ {both.length - 5} more routes</td></tr>}
                </tbody>
              </table>
            )}
            {kind === "import" && d.import && (
              <table>
                <tbody>
                  <tr><td>Places</td><td className="r">{d.import.zones.slice(0, 4).map((z) => z.name).join(", ")}{d.import.zones.length > 4 ? ` +${d.import.zones.length - 4}` : ""}</td></tr>
                  <tr><td>Vehicles</td><td className="r">{d.import.vehicles.map((v) => `${v.name} (${v.seats})`).join(", ")}</td></tr>
                  {d.import.rates.slice(0, 4).map((r) => (
                    <tr key={`${r.from}${r.to}${r.vehicle}`}><td>{d.import!.zones.find((z) => z.id === r.from)?.name} → {d.import!.zones.find((z) => z.id === r.to)?.name} · {d.import!.vehicles.find((v) => v.id === r.vehicle)?.name}</td><td className="r"><b>${r.price}</b></td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {kind === "tour" && d.tour && (
              <table>
                <tbody>
                  <tr><td>Where · duration</td><td className="r">{zoneName(s, d.tour.zone) || "—"} · {d.tour.duration}</td></tr>
                  <tr><td>Price</td><td className="r"><b>${d.tour.adult}</b> adult · ${d.tour.child} child</td></tr>
                  <tr><td>Departures · seats</td><td className="r">{d.tour.times.join(", ")} · {d.tour.seats}</td></tr>
                </tbody>
              </table>
            )}
            <footer>
              <span className="grow">{kind === "import" && d.import ? importSummary(d.import) : kind === "tour" ? "Goes on sale when approved" : `${d.changes.length} rates, both directions`}</span>
              <button className="btn no sm" disabled={busy === d.id} onClick={() => act(d.id, { type: "discard", id: d.id }, `Draft ${d.id} discarded`)}>Discard</button>
              <button className="btn ok sm" disabled={busy === d.id} onClick={() => act(d.id, { type: "approve", id: d.id }, `Draft ${d.id} approved`)}>Approve</button>
            </footer>
          </article>
        );
      })}
    </Card>
  );
}

export function Activity({ api, fresh }: { api: Api; fresh: Set<string> }) {
  const { s, now } = api;
  const claudeActs = s.log.filter((l) => l.actor === "claude").length;
  const label = { claude: "Claude", team: "Team", web: "Website", system: "System" } as const;
  return (
    <Card title="Activity" id="feed-title" right={<span className="chip claude">Claude · {claudeActs}</span>}>
      <ul className="feed" aria-live="polite">
        {[...s.log].reverse().slice(0, 30).map((l) => (
          <li key={l.id} className={fresh.has(l.id) ? "fresh" : undefined}>
            <span className={`chip ${l.actor === "claude" ? "claude" : l.actor === "team" ? "team" : l.actor === "web" ? "web" : ""}`}>{label[l.actor]}</span>
            <div>{l.text}<time dateTime={l.at}>{ago(l.at, now)}</time></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Asks({ api, asks }: { api: Api; asks: string[] }) {
  return (
    <Card title="Try asking Claude" id="ask-title">
      <div className="asks">
        {asks.map((q) => (
          <button key={q} className="ask" onClick={() => api.copy(q, "Question")}><span>{q}</span><i>Copy</i></button>
        ))}
      </div>
    </Card>
  );
}
