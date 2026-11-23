# Altair Lite

**Run a small tourism business from your own Claude.** An open, experimental demo of the idea behind
[Altair by Starknot](https://altair-hub.vercel.app): open a private sandbox of a transfer and tour company, connect it
to Claude in one step, ask in plain words, and watch the panel change while Claude works.

<p>
  <a href="https://altair-lite.vercel.app"><b>Try it live → altair-lite.vercel.app</b></a> ·
  no sign-up, no keys, sample data only
</p>

![The Altair Lite panel: services, rates, a rate-change draft prepared by Claude waiting for approval, and the connector URL](docs/panel.jpg)

## How it works

1. **Open a sandbox** at [altair-lite.vercel.app](https://altair-lite.vercel.app). You get your own copy of
   *Costa Brisa (demo)*: bookings placed around today, four drivers, three vehicles and a rate table.
2. **Add it to Claude.** Copy your connector URL from the panel (`https://altair-lite.vercel.app/mcp/<your-sandbox>`)
   into **Claude → Settings → Connectors → Add custom connector**. No sign-in is needed.
3. **Ask.** "What's on tomorrow, and who still needs a driver?" · "Assign drivers without clashing times." ·
   "Quote SJO airport to La Fortuna for 5." · "Raise Van rates 10% as a draft." The panel refreshes every few seconds,
   so you see Claude's work as it happens. **Price changes are drafts**: nothing changes until you approve them.

## The connector (MCP)

A remote [Model Context Protocol](https://modelcontextprotocol.io) server written without dependencies
(`lib/mcp.ts`): Streamable HTTP, JSON responses, stateless. Read tools never change anything; the others are logged
in the panel's activity feed.

| Tool | What it does |
|---|---|
| `business_overview` | Today and tomorrow, services without a driver, requests, drafts, what is booked |
| `day_schedule` | Every service of one day, in time order |
| `find_bookings` | Search by customer, code, place or tour |
| `booking_details` | One booking by its code |
| `quote_transfer` | Price per vehicle that fits the group |
| `list_drivers` | Drivers, vehicles, languages and their day |
| `assign_driver` | Assigns a driver; refuses time clashes and vehicles that are too small |
| `propose_rate_change` | Prepares a rate change as a **draft** for a person to approve |
| `list_drafts` | Drafts and their status |
| `draft_customer_message` | A confirmation, reminder or driver message (EN/ES), never sent |

There is also a shared sandbox at `https://altair-lite.vercel.app/mcp` for a quick try.

## Run it yourself

```bash
git clone https://github.com/altairbystarknot/altair-lite.git
cd altair-lite
npm install
npm run dev            # http://localhost:3200
npm run smoke          # talks to the local connector like Claude does
```

Without configuration, sandboxes live in memory and reset when the server restarts. To keep them, create a Supabase
project, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor and set `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). The table is closed to the API; the app only calls two database
functions that accept a valid sandbox id and a bounded document, with optimistic concurrency.

To try a local server from Claude, expose it over HTTPS (for example with a tunnel) and add `<url>/mcp/<sandbox>`
as a custom connector.

## What Altair Lite is, and is not

- An **experimental demo**, built in a few hours with Claude Code for the Dojo AI Hackathon 2026, to show the idea:
  the owner runs the business from their own Claude, and a person approves what matters.
- **Simplified on purpose**: one price per route and vehicle, no payments, no real messages, no accounts. It is not
  Altair's engine.
- Each sandbox is private by its long random id. Anyone with the URL can use that sandbox, which only holds sample
  data. Sandboxes nobody touches for two weeks are forgotten.

**Need the real thing?** [Altair](https://altair-hub.vercel.app) is Starknot's full booking system for tourism
businesses. For a serious operation, Starknot builds custom software, quoted separately:
[book a free discovery session](https://www.starknot.co/en/contacto).

## Stack

Next.js 16 · React 19 · TypeScript · Supabase (Postgres) · Vercel · Model Context Protocol

## License

[MIT](LICENSE) © 2026 Starknot
