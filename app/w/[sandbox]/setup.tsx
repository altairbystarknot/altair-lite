"use client";

import { useEffect, useRef, useState } from "react";
import { guessSeats, ratesSheet, setupChecklist, zoneName } from "@/lib/ops";
import { detectRates, download, readLogo, readSheet, toCsv, type Detected } from "@/lib/sheet";
import type { Activity, Driver } from "@/lib/types";
import { BrandMark, Card, money, type Api } from "./ui";

// The guided setup: everything a business needs to see Altair working with its own identity and prices.
// Each step can be done here by hand or by asking Claude through the connector; both land in the same place.

const STEPS = [
  { id: "profile", label: "Business & logo", hint: "Name, logo, colors" },
  { id: "rates", label: "Transfer rates", hint: "From your Excel or CSV" },
  { id: "tours", label: "Tours", hint: "Prices, times, seats" },
  { id: "team", label: "Drivers", hint: "Vehicle and languages" },
  { id: "claude", label: "Connect Claude", hint: "Your own Claude" },
  { id: "web", label: "Booking page", hint: "Try a booking" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

const COLORS = ["#16766b", "#0d4a47", "#1f5fa8", "#002b42", "#7a3cc2", "#c2413b", "#d9822b", "#2f7d32"];

export function Setup({ api, initialStep }: { api: Api; initialStep?: string }) {
  const [step, setStep] = useState<StepId>((STEPS.find((x) => x.id === initialStep)?.id ?? "profile") as StepId);
  useEffect(() => {
    if (initialStep && STEPS.some((x) => x.id === initialStep)) setStep(initialStep as StepId);
  }, [initialStep]);
  const c = setupChecklist(api.s, api.links);
  const doneOf: Record<StepId, boolean> = {
    profile: !!api.s.setup?.profile && !!api.s.business.logo,
    rates: !!api.s.setup?.rates,
    tours: !!api.s.setup?.tours,
    team: !!api.s.setup?.team,
    claude: !!api.s.setup?.claude,
    web: !!api.s.setup?.web,
  };
  const idx = STEPS.findIndex((x) => x.id === step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, idx + 1)].id);
  return (
    <div className="setup">
      <div className="setup-head">
        <div>
          <p className="kicker">Setup · {c.progress} done</p>
          <h1 className="h2" style={{ margin: "6px 0 4px" }}>Make it <em className="serif">your business.</em></h1>
          <p className="muted">The sandbox starts with sample data so everything works from minute one. Replace it step by step, here or by asking Claude. Nothing leaves this sandbox.</p>
        </div>
      </div>
      <div className="setup-grid">
        <ol className="steps-nav" aria-label="Setup steps">
          {STEPS.map((x, i) => (
            <li key={x.id}>
              <button aria-current={step === x.id ? "step" : undefined} className={doneOf[x.id] ? "done" : ""} onClick={() => setStep(x.id)}>
                <i aria-hidden="true">{doneOf[x.id] ? "✓" : i + 1}</i>
                <span><b>{x.label}</b><small>{x.hint}</small></span>
              </button>
            </li>
          ))}
        </ol>
        <div className="step-body">
          {step === "profile" && <ProfileStep api={api} onNext={next} />}
          {step === "rates" && <RatesStep api={api} onNext={next} />}
          {step === "tours" && <ToursStep api={api} onNext={next} />}
          {step === "team" && <TeamStep api={api} onNext={next} />}
          {step === "claude" && <ClaudeStep api={api} onNext={next} />}
          {step === "web" && <WebStep api={api} />}
        </div>
      </div>
    </div>
  );
}

function Ask({ api, text }: { api: Api; text: string }) {
  return (
    <div className="ask-claude">
      <span className="chip claude">Or ask Claude</span>
      <p>“{text}”</p>
      <button className="btn ghost sm" onClick={() => api.copy(text, "Prompt")}>Copy</button>
    </div>
  );
}

function ProfileStep({ api, onNext }: { api: Api; onNext: () => void }) {
  const b = api.s.business;
  const [f, setF] = useState({ name: b.name, tagline: b.tagline ?? "", phone: b.phone, email: b.email, prefix: b.prefix, color: b.color ?? "#16766b" });
  const [suggested, setSuggested] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === "prefix" ? e.target.value.toUpperCase() : e.target.value });
  const onLogo = async (fl?: File | null) => {
    if (!fl) return;
    try {
      const { dataUrl, color } = await readLogo(fl);
      setSuggested(color);
      const ok = await api.act("logo", { type: "profile", profile: { logo: dataUrl } }, "Logo saved");
      if (ok && color) api.say(`Logo saved. Suggested brand color: ${color}`);
    } catch (e) {
      api.say(e instanceof Error ? e.message : "That image did not work.", true);
    }
  };
  const save = async () => {
    const ok = await api.act("profile", { type: "profile", profile: f }, "Business profile saved");
    if (ok) onNext();
  };
  return (
    <Card title="Your business" id="st-profile">
      <div className="form">
        <div
          className={`logo-drop${drag ? " drag" : ""}`}
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => (e.preventDefault(), setDrag(false), onLogo(e.dataTransfer.files[0]))}
        >
          <BrandMark s={api.s} size={72} />
          <div>
            <b>Logo</b>
            <p className="muted">PNG, JPG, WebP or SVG. Drop it here or choose a file; it is resized for the panel and booking page.</p>
            <div className="row-actions">
              <button className="btn ghost sm" disabled={api.busy === "logo"} onClick={() => file.current?.click()}>{b.logo ? "Change logo" : "Upload logo"}</button>
              {b.logo && <button className="btn no sm" onClick={() => api.act("logo", { type: "profile", profile: { logo: null } }, "Logo removed")}>Remove</button>}
            </div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
          </div>
        </div>
        <div className="grid2">
          <label className="field"><span>Business name</span><input className="input" value={f.name} onChange={set("name")} maxLength={60} /></label>
          <label className="field"><span>Tagline</span><input className="input" value={f.tagline} onChange={set("tagline")} maxLength={120} placeholder="Private transfers and tours in…" /></label>
          <label className="field"><span>WhatsApp / phone</span><input className="input" value={f.phone} onChange={set("phone")} maxLength={40} /></label>
          <label className="field"><span>Email</span><input className="input" type="email" value={f.email} onChange={set("email")} maxLength={80} /></label>
          <label className="field"><span>Booking code prefix</span><input className="input" value={f.prefix} onChange={set("prefix")} maxLength={4} /><small>New bookings look like {f.prefix || "ABC"}-1051.</small></label>
          <div className="field">
            <span>Brand color</span>
            <div className="swatches">
              {[...(suggested && !COLORS.includes(suggested) ? [suggested] : []), ...COLORS].map((c) => (
                <button key={c} type="button" className={`sw${f.color === c ? " on" : ""}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={`Use ${c}${c === suggested ? " (from your logo)" : ""}`} title={c === suggested ? "From your logo" : c} />
              ))}
              <input type="color" value={f.color} onChange={set("color")} aria-label="Custom color" />
            </div>
            {suggested && <small>The first swatch comes from your logo.</small>}
          </div>
        </div>
        <div className="form-foot">
          <button className="btn primary brand" disabled={api.busy === "profile"} onClick={save}>Save and continue →</button>
        </div>
        <Ask api={api} text="Set up my business profile: the name is …, the WhatsApp is …, the email is … and the booking codes start with …" />
      </div>
    </Card>
  );
}

function RatesStep({ api, onNext }: { api: Api; onNext: () => void }) {
  const [det, setDet] = useState<Detected | null>(null);
  const [name, setName] = useState("");
  const [seats, setSeats] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const s = api.s;
  const onFile = async (f?: File | null) => {
    if (!f) return;
    try {
      const table = await readSheet(f);
      const d = detectRates(table);
      if (!d.rows.length) throw new Error("I could not find routes and prices in that sheet. Use the template: From, To, then one column per vehicle.");
      setDet(d);
      setName(f.name);
      setSeats(Object.fromEntries(d.vehicles.map((v) => [v, s.vehicles.find((x) => x.name.toLowerCase() === v.toLowerCase())?.seats ?? guessSeats(v)])));
    } catch (e) {
      api.say(e instanceof Error ? e.message : "That file did not work.", true);
    }
  };
  const template = () => download("altair-lite-rates-template.csv", toCsv(ratesSheet(s)));
  const apply = async () => {
    if (!det) return;
    const ok = await api.act("import", { type: "import", rows: det.rows, seats, file: name }, `Loaded ${det.rows.length} prices from ${name}`);
    if (ok) {
      setDet(null);
      onNext();
    }
  };
  return (
    <Card title="Your transfer rates" id="st-rates">
      <div className="form">
        {!det && (
          <>
            <p className="muted" style={{ margin: 0 }}>Most businesses keep their prices in a spreadsheet. Upload yours as it is: Altair Lite finds the places, the vehicles and the prices.</p>
            <div className="formats">
              <div>
                <b>One row per route</b>
                <table className="mini"><thead><tr><th>From</th><th>To</th><th>Sedan</th><th>Van</th></tr></thead><tbody><tr><td>SJO airport</td><td>La Fortuna</td><td>170</td><td>220</td></tr></tbody></table>
              </div>
              <div>
                <b>or one row per price</b>
                <table className="mini"><thead><tr><th>Origen</th><th>Destino</th><th>Vehículo</th><th>Precio</th></tr></thead><tbody><tr><td>LIR</td><td>Tamarindo</td><td>Van</td><td>110</td></tr></tbody></table>
              </div>
            </div>
            <div
              className={`dropzone${drag ? " drag" : ""}`}
              onDragOver={(e) => (e.preventDefault(), setDrag(true))}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => (e.preventDefault(), setDrag(false), onFile(e.dataTransfer.files[0]))}
              onClick={() => file.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && file.current?.click()}
            >
              <b>Drop your Excel (.xlsx) or CSV here</b>
              <span>or click to choose a file · Spanish or English headers · prices in USD</span>
            </div>
            <input ref={file} type="file" accept=".xlsx,.csv,.txt" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <div className="row-actions">
              <a className="btn ghost sm" href="/sample-rates.xlsx" download>No sheet handy? Try our sample .xlsx</a>
              <button className="btn ghost sm" onClick={template}>Download a template (your current rates)</button>
              <button className="btn ghost sm" onClick={onNext}>Keep the sample rates</button>
            </div>
            <Ask api={api} text="Here is my rate sheet (attached). Load it into Altair Lite as a draft so I can approve it." />
          </>
        )}
        {det && (
          <>
            <div className="found">
              <div><b>{det.rows.length}</b><span>prices</span></div>
              <div><b>{det.places.length}</b><span>places</span></div>
              <div><b>{det.vehicles.length}</b><span>vehicles</span></div>
              {det.skipped > 0 && <div className="warn"><b>{det.skipped}</b><span>rows skipped</span></div>}
            </div>
            <p className="muted" style={{ margin: 0 }}>From <b>{name}</b> ({det.format === "wide" ? "one row per route" : "one row per price"}). Check the seats of each vehicle; the reverse direction is added when your sheet has only one.</p>
            <div className="seats">
              {det.vehicles.map((v) => (
                <label key={v} className="field compact">
                  <span>{v}</span>
                  <input className="input" type="number" min={1} max={60} value={seats[v] ?? 4} onChange={(e) => setSeats({ ...seats, [v]: Number(e.target.value) })} />
                  <small>seats</small>
                </label>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="rates">
                <thead><tr><th>From</th><th>To</th><th>Vehicle</th><th>Price</th></tr></thead>
                <tbody>
                  {det.rows.slice(0, 10).map((r, i) => (
                    <tr key={i}><td>{r.from}</td><td>{r.to}</td><td>{r.vehicle}</td><td className="n">{money(r.price)}</td></tr>
                  ))}
                  {det.rows.length > 10 && <tr><td colSpan={4} style={{ color: "var(--soft)" }}>+ {det.rows.length - 10} more</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="callout">Loading replaces the current places, vehicles and rates. Sample transfers move onto your routes so the panel keeps showing a working day.</div>
            <div className="form-foot">
              <button className="btn ghost" onClick={() => setDet(null)}>Choose another file</button>
              <button className="btn primary brand" disabled={api.busy === "import"} onClick={apply}>Use these rates →</button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

const EMPTY_TOUR = { id: "", name: "", place: "", adult: "", child: "", times: "08:00, 14:00", seats: "12", duration: "3 h" };
type TourForm = typeof EMPTY_TOUR;
const toForm = (a: Activity, place: string): TourForm => ({ id: a.id, name: a.name, place, adult: String(a.adult), child: String(a.child), times: a.times.join(", "), seats: String(a.seats), duration: a.duration });

function ToursStep({ api, onNext }: { api: Api; onNext: () => void }) {
  const s = api.s;
  const [edit, setEdit] = useState<TourForm | null>(null);
  const save = async () => {
    if (!edit) return;
    const ok = await api.act("tour", { type: "tour", tour: { id: edit.id || undefined, name: edit.name, place: edit.place, adult: Number(edit.adult), child: Number(edit.child || 0), times: edit.times, seats: Number(edit.seats), duration: edit.duration } }, `${edit.name} saved`);
    if (ok) setEdit(null);
  };
  const set = (k: keyof TourForm) => (e: React.ChangeEvent<HTMLInputElement>) => edit && setEdit({ ...edit, [k]: e.target.value });
  return (
    <Card title="Your tours" id="st-tours" right={!edit ? <button className="btn primary sm brand" onClick={() => setEdit({ ...EMPTY_TOUR })}>+ Add a tour</button> : undefined}>
      <div className="form">
        {edit && (
          <div className="editor">
            <div className="grid2">
              <label className="field"><span>Name</span><input className="input" value={edit.name} onChange={set("name")} maxLength={60} placeholder="Sunset catamaran" autoFocus /></label>
              <label className="field"><span>Place</span><input className="input" value={edit.place} onChange={set("place")} maxLength={60} placeholder="Tamarindo" list="places" /></label>
              <label className="field"><span>Adult price (USD)</span><input className="input" type="number" min={1} value={edit.adult} onChange={set("adult")} /></label>
              <label className="field"><span>Child price (USD)</span><input className="input" type="number" min={0} value={edit.child} onChange={set("child")} /></label>
              <label className="field"><span>Departure times</span><input className="input" value={edit.times} onChange={set("times")} placeholder="08:00, 14:00" /></label>
              <label className="field"><span>Seats per departure</span><input className="input" type="number" min={1} max={200} value={edit.seats} onChange={set("seats")} /></label>
              <label className="field"><span>Duration</span><input className="input" value={edit.duration} onChange={set("duration")} maxLength={20} /></label>
            </div>
            <datalist id="places">{s.zones.map((z) => <option key={z.id} value={z.name} />)}</datalist>
            <div className="form-foot">
              <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn primary brand" disabled={api.busy === "tour"} onClick={save}>Save tour</button>
            </div>
          </div>
        )}
        <div className="list">
          {s.activities.map((a) => (
            <div key={a.id} className="li">
              <div>
                <b>{a.name}</b>
                <span>{zoneName(s, a.zone) || "—"} · {a.duration} · {money(a.adult)} adult / {money(a.child)} child · {a.times.join(", ")} · {a.seats} seats</span>
              </div>
              <button className="btn ghost sm" onClick={() => setEdit(toForm(a, zoneName(s, a.zone)))}>Edit</button>
              <button className="btn no sm" disabled={api.busy === `rm-${a.id}`} onClick={() => api.act(`rm-${a.id}`, { type: "tour-remove", id: a.id }, `${a.name} removed`)}>Remove</button>
            </div>
          ))}
        </div>
        <div className="form-foot">
          <button className="btn primary brand" onClick={onNext}>Continue →</button>
        </div>
        <Ask api={api} text="Add my tour: Sunset catamaran in Tamarindo, $85 adults and $60 kids, leaves at 15:00, 20 seats, 3 hours." />
      </div>
    </Card>
  );
}

function TeamStep({ api, onNext }: { api: Api; onNext: () => void }) {
  const s = api.s;
  const [d, setD] = useState<{ id?: string; name: string; vehicle: string; languages: string } | null>(null);
  const save = async () => {
    if (!d) return;
    const ok = await api.act("driver", { type: "driver", person: d }, `${d.name} saved`);
    if (ok) setD(null);
  };
  const edit = (x: Driver) => setD({ id: x.id, name: x.name, vehicle: x.vehicle, languages: x.languages.join(", ") });
  return (
    <Card title="Your drivers" id="st-team" right={!d ? <button className="btn primary sm brand" onClick={() => setD({ name: "", vehicle: s.vehicles[0]?.id ?? "", languages: "es, en" })}>+ Add a driver</button> : undefined}>
      <div className="form">
        {d && (
          <div className="editor">
            <div className="grid2">
              <label className="field"><span>Name</span><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={40} autoFocus /></label>
              <label className="field">
                <span>Vehicle</span>
                <select className="input" value={d.vehicle} onChange={(e) => setD({ ...d, vehicle: e.target.value })}>
                  {s.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.seats} seats</option>)}
                </select>
              </label>
              <label className="field"><span>Languages</span><input className="input" value={d.languages} onChange={(e) => setD({ ...d, languages: e.target.value })} placeholder="es, en, fr" /></label>
            </div>
            <div className="form-foot">
              <button className="btn ghost" onClick={() => setD(null)}>Cancel</button>
              <button className="btn primary brand" disabled={api.busy === "driver"} onClick={save}>Save driver</button>
            </div>
          </div>
        )}
        <div className="list">
          {s.drivers.map((x) => (
            <div key={x.id} className="li">
              <div>
                <b>{x.name}</b>
                <span>{s.vehicles.find((v) => v.id === x.vehicle)?.name ?? "—"} · {x.languages.map((l) => l.toUpperCase()).join(" / ")}</span>
              </div>
              <button className="btn ghost sm" onClick={() => edit(x)}>Edit</button>
              <button className="btn no sm" disabled={api.busy === `rmd-${x.id}`} onClick={() => api.act(`rmd-${x.id}`, { type: "driver-remove", id: x.id }, `${x.name} removed`)}>Remove</button>
            </div>
          ))}
        </div>
        <div className="form-foot">
          <button className="btn primary brand" onClick={onNext}>Continue →</button>
        </div>
        <Ask api={api} text="Add my drivers: José drives the Van and speaks Spanish and English; María drives the Sedan and speaks Spanish, English and French." />
      </div>
    </Card>
  );
}

function ClaudeStep({ api, onNext }: { api: Api; onNext: () => void }) {
  const connected = !!api.s.setup?.claude;
  return (
    <Card title="Connect your own Claude" id="st-claude" right={<span className={`chip ${connected ? "ok" : "warn"}`}>{connected ? "✓ Connected" : "Waiting for Claude…"}</span>}>
      <div className="form">
        <p className="muted" style={{ margin: 0 }}>Altair never calls an AI model and never stores Claude credentials: you use your own Claude, and it works on this sandbox through a connector.</p>
        <div className="url"><code title={api.links.connector}>{api.links.connector}</code><button className="btn primary sm" onClick={() => api.copy(api.links.connector, "Connector URL")}>Copy</button></div>
        <ol className="how big">
          <li>Open Claude (claude.ai or the desktop app) → <b>Settings → Connectors → Add custom connector</b>.</li>
          <li>Name it <b>Altair Lite</b>, paste the URL above and click <b>Add</b>. No sign-in, no keys.</li>
          <li>Start a new chat, enable <b>Altair Lite</b> in the tools menu, and say hello. This step turns green as soon as Claude calls the sandbox.</li>
        </ol>
        <div className="prompts">
          {["Let's set up my business. What's missing?", "What's on tomorrow, and which services still need a driver?", "Here is my rate sheet (attached). Load it as a draft."].map((p) => (
            <button key={p} className="ask" onClick={() => api.copy(p, "Prompt")}><span>{p}</span><i>Copy</i></button>
          ))}
        </div>
        <div className="form-foot">
          <button className="btn primary brand" onClick={onNext}>{connected ? "Continue →" : "I'll do it later →"}</button>
        </div>
      </div>
    </Card>
  );
}

function WebStep({ api }: { api: Api }) {
  const web = api.s.bookings.filter((b) => b.source === "web");
  return (
    <Card title="Your booking page" id="st-web" right={<span className={`chip ${web.length ? "ok" : "warn"}`}>{web.length ? `✓ ${web.length} request${web.length === 1 ? "" : "s"}` : "No requests yet"}</span>}>
      <div className="form">
        <p className="muted" style={{ margin: 0 }}>This is what your travelers see: your logo, your colors, your routes and prices, your tours with real seats. Open it, book something, and watch it arrive under <b>Today → New requests</b>.</p>
        <div className="url"><code title={api.links.booking}>{api.links.booking}</code><button className="btn ghost sm" onClick={() => api.copy(api.links.booking, "Booking page link")}>Copy</button></div>
        <div className="row-actions">
          <a className="btn primary brand" href={api.links.booking} target="_blank" rel="noopener noreferrer">Open my booking page ↗</a>
          <button className="btn ghost" onClick={() => api.go("today")}>Go to Today</button>
        </div>
        <div className="callout warm">
          <b>Like what you see?</b> Altair Lite is an experimental demo. The full Altair gives each business its own site and domain, two pricing engines, payments, a team panel with roles and a secure Claude connector. For a serious operation, Starknot builds custom software, quoted separately.
          <div className="row-actions" style={{ marginTop: 10 }}>
            <a className="btn primary sm" href="https://www.starknot.co/en/contacto" target="_blank" rel="noopener noreferrer">Book a free discovery session</a>
            <a className="btn ghost sm" href="https://altair-hub.vercel.app" target="_blank" rel="noopener noreferrer">See Altair</a>
          </div>
        </div>
      </div>
    </Card>
  );
}
