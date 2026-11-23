import * as ops from "./ops";
import { load, mutate } from "./store";
import type { State } from "./types";

// A small, dependency-free MCP server (Streamable HTTP, JSON responses, stateless). Each sandbox has its own
// endpoint, /mcp/<sandbox>, which a person adds to Claude as a custom connector. Claude can read the business,
// help set it up and prepare work; prices, rate sheets and new tours are drafts a person approves in the panel.
// Nothing here moves money or sends messages.

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Json = Record<string, unknown>;
export type Ctx = { sandbox: string; links: ops.Links };
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  readOnly: boolean;
  group: "run" | "setup";
  run: (ctx: Ctx, a: Json) => Promise<unknown>;
};

const str = (description: string, extra: Json = {}) => ({ type: "string", description, ...extra });
const num = (description: string, extra: Json = {}) => ({ type: "integer", description, ...extra });

/** The first time Claude calls any tool, the sandbox records that Claude is connected (the panel shows it). */
const seen = (s: State) => {
  if (!s.setup?.claude) {
    ops.markSetup(s, "claude");
    ops.log(s, "system", "Claude is connected to this sandbox.");
  }
};
const read = (fn: (s: State, a: Json, ctx: Ctx) => unknown) => async (ctx: Ctx, a: Json) => {
  const s = await load(ctx.sandbox);
  if (!s.setup?.claude) await mutate(ctx.sandbox, seen);
  return fn(s, a, ctx);
};
const write = (fn: (s: State, a: Json, ctx: Ctx) => unknown) => async (ctx: Ctx, a: Json) =>
  mutate(ctx.sandbox, (s) => {
    seen(s);
    return fn(s, a, ctx);
  });

export const TOOLS: Tool[] = [
  {
    name: "business_overview",
    title: "Business overview",
    description: "Start here. A snapshot of the business today: services today and tomorrow, services without a driver in the next 3 days, requests to confirm (including new ones from the booking page), drafts waiting for approval, what is booked for the next 7 days and how far the setup is.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    group: "run",
    run: read((s, _a, ctx) => ops.overview(s, ctx.links)),
  },
  {
    name: "day_schedule",
    title: "Day schedule",
    description: "Every service (transfers and tours) on one day, in time order, with customer, travelers, vehicle and driver.",
    inputSchema: { type: "object", properties: { date: str("today, tomorrow, or a date as YYYY-MM-DD. Defaults to today.") } },
    readOnly: true,
    group: "run",
    run: read((s, a) => ops.schedule(s, a.date as string | undefined)),
  },
  {
    name: "find_bookings",
    title: "Find bookings",
    description: "Search bookings by customer, code, place or tour, optionally on one date, only those without a driver, or by status.",
    inputSchema: {
      type: "object",
      properties: {
        query: str("Words to look for: a name, a booking code, a place or a tour."),
        date: str("today, tomorrow or YYYY-MM-DD."),
        unassigned_only: { type: "boolean", description: "Only services without a driver." },
        status: str("confirmed or request.", { enum: ["confirmed", "request"] }),
      },
    },
    readOnly: true,
    group: "run",
    run: read((s, a) => ops.findBookings(s, { query: a.query as string, date: a.date as string, unassignedOnly: Boolean(a.unassigned_only), status: a.status as string })),
  },
  {
    name: "booking_details",
    title: "Booking details",
    description: "Everything about one booking by its code.",
    inputSchema: { type: "object", properties: { code: str("Booking code, e.g. CBR-1043.") }, required: ["code"] },
    readOnly: true,
    group: "run",
    run: read((s, a) => ops.bookingDetails(s, String(a.code))),
  },
  {
    name: "quote_transfer",
    title: "Quote a private transfer",
    description: "Price of a private transfer between two places for a group, for every vehicle that fits. Prices come from the business's own rate table (USD, taxes included).",
    inputSchema: {
      type: "object",
      properties: { from: str("Origin, e.g. an airport or a town."), to: str("Destination."), passengers: num("Number of travelers.", { minimum: 1, maximum: 40 }) },
      required: ["from", "to", "passengers"],
    },
    readOnly: true,
    group: "run",
    run: read((s, a) => ops.quoteTransfer(s, String(a.from), String(a.to), Number(a.passengers))),
  },
  {
    name: "quote_tour",
    title: "Quote a tour",
    description: "Price of a tour for a group and the seats left on each departure of a date.",
    inputSchema: {
      type: "object",
      properties: { tour: str("Tour name."), date: str("today, tomorrow or YYYY-MM-DD."), adults: num("Adults.", { minimum: 1, maximum: 40 }), children: num("Children.", { minimum: 0, maximum: 20 }) },
      required: ["tour", "adults"],
    },
    readOnly: true,
    group: "run",
    run: read((s, a) => ops.quoteTour(s, String(a.tour), a.date as string | undefined, Number(a.adults), Number(a.children ?? 0))),
  },
  {
    name: "create_booking",
    title: "Add a booking request",
    description: "Turn a customer's message (WhatsApp, email, phone call) into a booking REQUEST: a private transfer or a tour. The price is computed from the business's own rates. A person confirms it in the panel. Ask for anything missing (date, time, travelers, places or tour) before calling.",
    inputSchema: {
      type: "object",
      properties: {
        type: str("transfer or tour.", { enum: ["transfer", "tour"] }),
        customer: str("Traveler's full name."),
        country: str("Traveler's country (optional)."),
        email: str("Traveler's email (optional)."),
        date: str("YYYY-MM-DD, today or tomorrow."),
        time: str("HH:MM, 24-hour. For tours, one of the tour's departure times."),
        adults: num("Adults.", { minimum: 1, maximum: 40 }),
        children: num("Children.", { minimum: 0, maximum: 20 }),
        from: str("Transfers: origin."),
        to: str("Transfers: destination."),
        vehicle: str("Transfers: vehicle (optional; the smallest that fits is used)."),
        tour: str("Tours: tour name."),
        pickup: str("Hotel or meeting point (optional)."),
        notes: str("Flight number, child seats, anything the team should know (optional)."),
      },
      required: ["type", "customer", "date", "time", "adults"],
    },
    readOnly: false,
    group: "run",
    run: write((s, a) =>
      ops.createBooking(
        s,
        { kind: a.type === "tour" ? "tour" : "transfer", customer: String(a.customer ?? ""), country: a.country as string, email: a.email as string, date: String(a.date ?? ""), time: String(a.time ?? ""), adults: Number(a.adults), children: Number(a.children ?? 0), from: a.from as string, to: a.to as string, vehicle: a.vehicle as string, activity: a.tour as string, pickup: a.pickup as string, notes: a.notes as string },
        "claude",
      ),
    ),
  },
  {
    name: "list_drivers",
    title: "Drivers and their day",
    description: "The drivers, their vehicles and languages, and what each one already has on a given day.",
    inputSchema: { type: "object", properties: { date: str("today, tomorrow or YYYY-MM-DD. Defaults to today.") } },
    readOnly: true,
    group: "run",
    run: read((s, a) => ops.drivers(s, a.date as string | undefined)),
  },
  {
    name: "assign_driver",
    title: "Assign a driver",
    description: "Assign a driver to a service. Refuses if the driver has another service within 2.5 hours that day or their vehicle is too small. Shows up live in the panel.",
    inputSchema: { type: "object", properties: { code: str("Booking code."), driver: str("Driver name.") }, required: ["code", "driver"] },
    readOnly: false,
    group: "run",
    run: write((s, a) => ops.assignDriver(s, String(a.code), String(a.driver), "claude")),
  },
  {
    name: "propose_rate_change",
    title: "Propose a rate change (draft)",
    description: "Prepare a change to transfer rates as a DRAFT: by percent or by a dollar amount, for every route or only routes touching a place and/or one vehicle. Nothing changes until a person approves the draft in the panel.",
    inputSchema: {
      type: "object",
      properties: {
        percent: { type: "number", description: "Change in percent, e.g. 10 for +10% or -5 for -5%." },
        amount: { type: "number", description: "Change in whole dollars instead of percent, e.g. 15 or -10." },
        place: str("Only routes that start or end at this place (optional)."),
        other_place: str("And whose other end is this place (optional)."),
        vehicle: str("Only this vehicle (optional)."),
        reason: str("Why, in one sentence, so the person approving understands."),
      },
      required: ["reason"],
    },
    readOnly: false,
    group: "run",
    run: write((s, a) => ops.proposeRateChange(s, { percent: a.percent as number | undefined, amount: a.amount as number | undefined, from: a.place as string | undefined, to: a.other_place as string | undefined, vehicle: a.vehicle as string | undefined, reason: String(a.reason ?? "") }, "claude")),
  },
  {
    name: "list_drafts",
    title: "Drafts",
    description: "Drafts (rate changes, rate sheets, tours) and their status: pending (waiting for a person), approved or discarded.",
    inputSchema: { type: "object", properties: { status: str("pending, approved or discarded.", { enum: ["pending", "approved", "discarded"] }) } },
    readOnly: true,
    group: "run",
    run: read((s, a) => ops.listDrafts(s, a.status as string | undefined)),
  },
  {
    name: "draft_customer_message",
    title: "Draft a message for a customer",
    description: "Write a confirmation, a reminder or the driver details for a booking, in English or Spanish, ready to paste into WhatsApp or email. It is never sent.",
    inputSchema: {
      type: "object",
      properties: { code: str("Booking code."), kind: str("confirmation, reminder or driver.", { enum: ["confirmation", "reminder", "driver"] }), language: str("en or es.", { enum: ["en", "es"] }) },
      required: ["code", "kind"],
    },
    readOnly: false,
    group: "run",
    run: write((s, a) => ops.customerMessage(s, String(a.code), a.kind as "confirmation", (a.language as "en" | "es") ?? "en")),
  },
  // ----- setting up the owner's own business -----
  {
    name: "setup_checklist",
    title: "Setup checklist",
    description: "Use this when the owner wants to set up THEIR business. What is already set up (profile, logo, rates, tours, drivers, Claude, booking page), what is missing, and how to do each step, with the panel and booking page links.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    group: "setup",
    run: read((s, _a, ctx) => ops.setupChecklist(s, ctx.links)),
  },
  {
    name: "update_business_profile",
    title: "Update the business profile",
    description: "Set the business name, tagline, WhatsApp/phone, email, booking code prefix (2-4 letters) and brand color (#rrggbb). Applies right away and shows on the panel and the booking page. The logo is uploaded in the panel.",
    inputSchema: {
      type: "object",
      properties: { name: str("Business name."), tagline: str("One line under the name, e.g. 'Private transfers and tours in Guanacaste'."), phone: str("WhatsApp or phone."), email: str("Contact email."), booking_prefix: str("2 to 4 letters for booking codes, e.g. GTX."), brand_color: str("Brand color as #rrggbb.") },
    },
    readOnly: false,
    group: "setup",
    run: write((s, a) => ops.updateProfile(s, { name: a.name as string | undefined, tagline: a.tagline as string | undefined, phone: a.phone as string | undefined, email: a.email as string | undefined, prefix: a.booking_prefix as string | undefined, color: a.brand_color as string | undefined }, "claude")),
  },
  {
    name: "import_rates",
    title: "Load a rate sheet (draft)",
    description: "Load the owner's transfer rates from their spreadsheet, PDF or message. Read the sheet the owner shared, then send EVERY route as rows {from, to, vehicle, price} (whole USD, one price per vehicle; one direction is enough, the reverse is added automatically) and the seats of each vehicle. It becomes ONE draft that replaces the current places, vehicles and rates once a person approves it in the panel.",
    inputSchema: {
      type: "object",
      properties: {
        rates: {
          type: "array",
          maxItems: 800,
          description: "Every route and vehicle with its price.",
          items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, vehicle: { type: "string" }, price: { type: "number" } }, required: ["from", "to", "vehicle", "price"] },
        },
        vehicles: {
          type: "array",
          maxItems: 8,
          description: "Seats per vehicle type, e.g. [{name: 'Sedan', seats: 3}, {name: 'Van', seats: 8}].",
          items: { type: "object", properties: { name: { type: "string" }, seats: { type: "integer" } }, required: ["name", "seats"] },
        },
        reason: str("One sentence for the person approving, e.g. 'Rates from your 2027 sheet'."),
      },
      required: ["rates"],
    },
    readOnly: false,
    group: "setup",
    run: write((s, a) => {
      const seats: Record<string, number> = {};
      for (const v of (a.vehicles as Array<{ name: string; seats: number }> | undefined) ?? []) if (v && v.name) seats[String(v.name).trim()] = Number(v.seats);
      return ops.proposeImport(s, (a.rates as ops.ImportRow[]) ?? [], seats, String(a.reason ?? ""), "claude");
    }),
  },
  {
    name: "add_tour",
    title: "Add or update a tour (draft)",
    description: "Prepare a tour from the owner's description: name, place, adult and child price (whole USD), departure times, seats per departure and duration. It goes on sale on the booking page once a person approves the draft. Use the exact current name to update an existing tour.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Tour name."),
        place: str("Where it happens."),
        adult_price: num("Price per adult, USD.", { minimum: 1 }),
        child_price: num("Price per child, USD.", { minimum: 0 }),
        times: { type: "array", items: { type: "string" }, description: "Departure times as HH:MM, e.g. ['08:00', '14:00']." },
        seats: num("Seats per departure.", { minimum: 1, maximum: 200 }),
        duration: str("e.g. 3 h."),
        reason: str("One sentence for the person approving."),
      },
      required: ["name", "adult_price", "times", "seats"],
    },
    readOnly: false,
    group: "setup",
    run: write((s, a) => {
      const existing = ops.findActivity(s, String(a.name ?? ""));
      const same = existing && ops.norm(existing.name) === ops.norm(String(a.name ?? ""));
      return ops.proposeTour(s, { id: same ? existing.id : undefined, name: a.name as string, place: a.place as string, adult: a.adult_price as number, child: (a.child_price as number) ?? 0, times: a.times as string[], seats: a.seats as number, duration: a.duration as string }, String(a.reason ?? ""), "claude");
    }),
  },
  {
    name: "add_driver",
    title: "Add a driver",
    description: "Add a driver (or update one with the same name) with their vehicle type and languages, e.g. ['es', 'en'].",
    inputSchema: { type: "object", properties: { name: str("Driver name."), vehicle: str("One of the business's vehicle types."), languages: { type: "array", items: { type: "string" }, description: "Two-letter codes: es, en, fr, de, it, pt…" } }, required: ["name"] },
    readOnly: false,
    group: "setup",
    run: write((s, a) => {
      const existing = s.drivers.find((d) => ops.norm(d.name) === ops.norm(String(a.name ?? "")));
      return ops.saveDriver(s, { id: existing?.id, name: a.name as string, vehicle: a.vehicle as string, languages: a.languages as string[] }, "claude");
    }),
  },
];

function instructions(s: State, links: ops.Links) {
  return (
    `You are helping the owner of ${s.business.name}, a small private-transfer and tour company, run the business from Claude through Altair Lite, an open demo. ` +
    "All data lives in the owner's own sandbox (sample data until they replace it). Start with business_overview. Prices are whole US dollars, taxes included. " +
    "You can assign drivers, add booking requests from customer messages and draft messages. Rate changes, rate sheets and new tours are drafts that a person approves in the panel. You never take payments or send messages. " +
    "If the owner wants to set up their own business, call setup_checklist and guide them step by step: profile (update_business_profile), rates (when they share a spreadsheet, read every row and call import_rates once), tours (add_tour), drivers (add_driver); the logo is uploaded in the panel. " +
    `Panel: ${links.panel} · Booking page: ${links.booking}. Answer in the user's language.`
  );
}

export type RpcReq = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };

export async function handle(ctx: Ctx, req: RpcReq): Promise<Json | null> {
  const id = req.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (req.id === undefined) return null; // a notification: nothing to answer
  switch (req.method) {
    case "initialize": {
      const asked = String((req.params as Json | undefined)?.protocolVersion ?? "");
      const s = await load(ctx.sandbox);
      return ok({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "altair-lite", title: `Altair Lite · ${s.business.name}`, version: "1.1.0" },
        instructions: instructions(s, ctx.links),
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: t.readOnly, openWorldHint: false } })),
      });
    case "tools/call": {
      const name = String((req.params as Json | undefined)?.name ?? "");
      const args = ((req.params as Json | undefined)?.arguments ?? {}) as Json;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return err(-32602, `Unknown tool: ${name}`);
      try {
        const data = await tool.run(ctx, args);
        return ok({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: Array.isArray(data) ? { items: data } : data, isError: false });
      } catch (e) {
        const message = e instanceof ops.OpError ? e.message : "Something went wrong in the sandbox; please try again.";
        if (!(e instanceof ops.OpError)) console.error("[mcp]", name, e);
        return ok({ content: [{ type: "text", text: message }], isError: true });
      }
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return err(-32601, `Method not found: ${req.method}`);
  }
}
