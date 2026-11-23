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
            <Link className="btn primary sm" href="/new?setup=1">Set up my business</Link>
          </nav>
        </header>

        <section className="hero">
          <div>
            <p className="kicker"><Star /> Open demo · Altair by Starknot</p>
            <h1 className="display">Run a tourism business from <em className="serif">your own Claude.</em></h1>
            <p className="lede">
              Set up a private sandbox of your transfer and tour company in minutes: your logo and colors, your rates straight
              from Excel, your tours and drivers. You get a panel, a booking page for travelers and a connector for your own
              Claude. Ask in plain words and watch the panel change while Claude works; prices are drafts you approve.
            </p>
            <div className="actions">
              <Link className="btn primary" href="/new?setup=1">Set up my business <span aria-hidden="true">→</span></Link>
              <Link className="btn ghost" href="/new">Explore the sample business</Link>
            </div>
            <p className="note">Free, no sign-up, no payment. Sample data fills whatever you skip. <Continue /></p>
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
              <div className="msg-u">Here is my 2027 rate sheet (rates.xlsx). Load it.</div>
              <span className="tool">altair-lite · import_rates</span>
              <div className="msg-c"><b>Draft D-01 ready</b> · 96 rates, 14 places, 3 vehicles from your sheet. Approve it in the panel and your booking page uses them.</div>
            </div>
          </div>
        </section>

        <section className="steps four" aria-label="How it works">
          <div className="step"><i>01</i><h3>Make it yours</h3><p>Name, logo and brand color. A guided setup; sample bookings, drivers and rates fill whatever you skip.</p></div>
          <div className="step"><i>02</i><h3>Load your rates</h3><p>Drop the Excel or CSV you already use: places, vehicles and prices are read for you. Then your tours and drivers.</p></div>
          <div className="step"><i>03</i><h3>Connect your Claude</h3><p>Paste your connector URL in Claude → Settings → Connectors. Claude can even finish the setup for you.</p></div>
          <div className="step"><i>04</i><h3>Take a booking</h3><p>Share your booking page. A traveler books, the request lands in your panel, Claude helps you run the day.</p></div>
        </section>
      </div>

      <section className="band">
        <div className="wrap">
          <p className="kicker">The connector</p>
          <h2 className="h2">{TOOLS.length} tools, <em className="serif">one small business.</em></h2>
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
              <li>An open, experimental demo of the idea behind Altair: the owner runs the business from their own Claude, and a person approves what matters.</li>
              <li>A private sandbox per visitor with your logo, rates, tours and team, a panel and a booking page. Reset any time.</li>
              <li>Simplified on purpose: one price per route and vehicle, no payments, no accounts, no real messages. Use test data.</li>
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
