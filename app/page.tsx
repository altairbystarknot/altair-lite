import Link from "next/link";
import { TOOLS } from "@/lib/mcp";
import { Continue } from "./continue";
import { Star, Wordmark } from "./wordmark";

const GITHUB = "https://github.com/altairbystarknot/altair-lite";

export default function Home() {
  return (
    <>
      <div className="wrap">
        <header className="top">
          <Wordmark />
          <nav>
            <a className="btn ghost sm" href={GITHUB} target="_blank" rel="noopener noreferrer">GitHub</a>
            <Link className="btn primary sm" href="/new">Open my sandbox</Link>
          </nav>
        </header>

        <section className="hero">
          <div>
            <p className="kicker"><Star /> Open demo · Altair by Starknot</p>
            <h1 className="display">Run a tourism business from <em className="serif">your own Claude.</em></h1>
            <p className="lede">
              Altair Lite gives you a private sandbox of a small transfer and tour company, with sample bookings, drivers and
              rates. Connect it to Claude in one step, ask in plain words, and watch the panel change while Claude works.
              Price changes are drafts that you approve.
            </p>
            <div className="actions">
              <Link className="btn primary" href="/new">Open my sandbox <span aria-hidden="true">→</span></Link>
              <a className="btn ghost" href={GITHUB} target="_blank" rel="noopener noreferrer">Read the code</a>
            </div>
            <p className="note">No sign-up, no payment, sample data only. <Continue /></p>
          </div>
          <div className="mock" aria-hidden="true">
            <div className="cardx">
              <div className="msg-u">What&apos;s on tomorrow, and who still needs a driver?</div>
              <span className="tool">altair-lite · day_schedule</span>
              <div className="msg-c">
                <b>Tomorrow · 4 services</b>, three without a driver.
                <div className="row-s"><b>05:30</b> Birdwatching at dawn · Monteverde <span className="chip warn">No driver</span></div>
                <div className="row-s"><b>06:00</b> La Fortuna → Monteverde · Sedan <span className="chip warn">No driver</span></div>
                <div className="row-s"><b>09:00</b> SJO airport → Manuel Antonio · Luis <span className="chip ok">Assigned</span></div>
              </div>
            </div>
            <div className="cardx">
              <div className="msg-u">Raise Van rates 10%. I&apos;ll approve it.</div>
              <span className="tool">altair-lite · propose_rate_change</span>
              <div className="msg-c"><b>Draft D-01 ready</b> · 24 Van rates. Nothing changes until you approve it in the panel.</div>
            </div>
          </div>
        </section>

        <section className="steps" aria-label="How it works">
          <div className="step"><i>01</i><h3>Open a sandbox</h3><p>Your own copy of Costa Brisa (demo), with bookings around today, four drivers and a rate table.</p></div>
          <div className="step"><i>02</i><h3>Add it to Claude</h3><p>Copy your connector URL into Claude → Settings → Connectors → Add custom connector. No keys, no sign-in.</p></div>
          <div className="step"><i>03</i><h3>Ask, and approve</h3><p>Claude reads the day, quotes, assigns drivers and drafts messages. Rate changes wait for your approval.</p></div>
        </section>
      </div>

      <section className="band">
        <div className="wrap">
          <p className="kicker">The connector</p>
          <h2 className="h2">Ten tools, <em className="serif">one small business.</em></h2>
          <p className="lede">A remote MCP server with no dependencies, built for Claude. Read tools never change anything; the rest are logged in the panel.</p>
          <div className="tools">
            {TOOLS.map((t) => (
              <div className="tl" key={t.name}>
                <code>{t.name}</code>
                <span className={t.readOnly ? "chip" : "chip claude"}>{t.readOnly ? "read" : "acts"}</span>
                <p>{t.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="split2">
          <div className="box">
            <h3>What Altair Lite is</h3>
            <ul>
              <li>An open, experimental demo of the idea behind Altair: the owner runs the business from their own Claude.</li>
              <li>A private sandbox per visitor, sample data only, reset any time.</li>
              <li>Simplified on purpose: one price per route and vehicle, no payments, no real messages.</li>
            </ul>
          </div>
          <div className="box warm">
            <h3>Need the real thing?</h3>
            <p>
              Altair is Starknot&apos;s full booking system for tourism businesses: its own booking site, two pricing engines, a team
              panel and a secure Claude connector. For a serious operation, Starknot builds custom software, quoted separately.
            </p>
            <div className="actions" style={{ marginTop: 14 }}>
              <a className="btn primary sm" href="https://www.starknot.co/en/contacto" target="_blank" rel="noopener noreferrer">Book a free discovery session</a>
              <a className="btn ghost sm" href="https://altair-hub.vercel.app" target="_blank" rel="noopener noreferrer">See Altair</a>
            </div>
          </div>
        </div>
        <footer className="foot">
          <span>Altair Lite · MIT license · built with Claude Code for the Dojo AI Hackathon 2026</span>
          <span><a href="https://www.starknot.co/en" target="_blank" rel="noopener noreferrer">Starknot</a> · Costa Rica</span>
        </footer>
      </div>
    </>
  );
}
