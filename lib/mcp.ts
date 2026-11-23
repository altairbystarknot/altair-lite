import * as ops from "./ops";
import { load, mutate } from "./store";

// A small, dependency-free MCP server (Streamable HTTP, JSON responses, stateless). Each sandbox has its own
// endpoint, /mcp/<sandbox>, which a person adds to Claude as a custom connector. Claude can read the business
// and prepare work; changes to prices are drafts a person approves in the panel. Nothing here moves money
// or sends messages.

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Json = Record<string, unknown>;
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  readOnly: boolean;
  run: (sandbox: string, a: Json) => Promise<unknown>;
};

const str = (description: string, extra: Json = {}) => ({ type: "string", description, ...extra });
const read = (fn: (s: Awaited<ReturnType<typeof load>>, a: Json) => unknown) => async (sb: string, a: Json) => fn(await load(sb), a);
const write = (fn: (s: Awaited<ReturnType<typeof load>>, a: Json) => unknown) => async (sb: string, a: Json) => mutate(sb, (s) => fn(s, a));

export const TOOLS: Tool[] = [
  {
    name: "business_overview",
    title: "Business overview",
    description: "Start here. A snapshot of the business today: services today and tomorrow, services without a driver in the next 3 days, requests to confirm, drafts waiting for approval and what is booked for the next 7 days.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    run: read((s) => ops.overview(s)),
  },
  {
    name: "day_schedule",
    title: "Day schedule",
    description: "Every service (transfers and tours) on one day, in time order, with customer, travelers, vehicle and driver.",
    inputSchema: { type: "object", properties: { date: str("today, tomorrow, or a date as YYYY-MM-DD. Defaults to today.") } },
    readOnly: true,
    run: read((s, a) => ops.schedule(s, a.date as string | undefined)),
  },
  {
    name: "find_bookings",
    title: "Find bookings",
    description: "Search bookings by customer, code, place or tour, optionally on one date, only those without a driver, or by status.",
    inputSchema: {
      type: "object",
      properties: {
        query: str("Words to look for: a name, a code like CBR-1043, a place or a tour."),
        date: str("today, tomorrow or YYYY-MM-DD."),
        unassigned_only: { type: "boolean", description: "Only services without a driver." },
        status: str("confirmed or request.", { enum: ["confirmed", "request"] }),
      },
    },
    readOnly: true,
    run: read((s, a) => ops.findBookings(s, { query: a.query as string, date: a.date as string, unassignedOnly: Boolean(a.unassigned_only), status: a.status as string })),
  },
  {
    name: "booking_details",
    title: "Booking details",
    description: "Everything about one booking by its code (for example CBR-1043).",
    inputSchema: { type: "object", properties: { code: str("Booking code, e.g. CBR-1043.") }, required: ["code"] },
    readOnly: true,
    run: read((s, a) => ops.bookingDetails(s, String(a.code))),
  },
  {
    name: "quote_transfer",
    title: "Quote a private transfer",
    description: "Price of a private transfer between two places for a group, for every vehicle that fits. Prices come from the business's own rate table (USD, taxes included).",
    inputSchema: {
      type: "object",
      properties: { from: str("Origin, e.g. SJO airport, La Fortuna, Tamarindo."), to: str("Destination."), passengers: { type: "integer", minimum: 1, maximum: 40, description: "Number of travelers." } },
      required: ["from", "to", "passengers"],
    },
    readOnly: true,
    run: read((s, a) => ops.quoteTransfer(s, String(a.from), String(a.to), Number(a.passengers))),
  },
  {
    name: "list_drivers",
    title: "Drivers and their day",
    description: "The drivers, their vehicles and languages, and what each one already has on a given day.",
    inputSchema: { type: "object", properties: { date: str("today, tomorrow or YYYY-MM-DD. Defaults to today.") } },
    readOnly: true,
    run: read((s, a) => ops.drivers(s, a.date as string | undefined)),
  },
  {
    name: "assign_driver",
    title: "Assign a driver",
    description: "Assign a driver to a service. Refuses if the driver has another service within 2.5 hours that day or their vehicle is too small. Shows up live in the panel.",
    inputSchema: { type: "object", properties: { code: str("Booking code."), driver: str("Driver name, e.g. Carlos.") }, required: ["code", "driver"] },
    readOnly: false,
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
        vehicle: str("Only this vehicle: Sedan, Van or Minibus (optional)."),
        reason: str("Why, in one sentence, so the person approving understands."),
      },
      required: ["reason"],
    },
    readOnly: false,
    run: write((s, a) => ops.proposeRateChange(s, { percent: a.percent as number | undefined, amount: a.amount as number | undefined, from: a.place as string | undefined, to: a.other_place as string | undefined, vehicle: a.vehicle as string | undefined, reason: String(a.reason) }, "claude")),
  },
  {
    name: "list_drafts",
    title: "Drafts",
    description: "Rate-change drafts and their status: pending (waiting for a person), approved or discarded.",
    inputSchema: { type: "object", properties: { status: str("pending, approved or discarded.", { enum: ["pending", "approved", "discarded"] }) } },
    readOnly: true,
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
    run: write((s, a) => ops.customerMessage(s, String(a.code), a.kind as "confirmation", (a.language as "en" | "es") ?? "en")),
  },
];

const INSTRUCTIONS =
  "You are helping the owner of Costa Brisa (demo), a small private-transfer and tour company in Costa Rica, run the day from Claude. " +
  "All data is sample data in the owner's own sandbox. Start with business_overview. Prices are whole US dollars, taxes included. " +
  "You can assign drivers and draft messages; price changes are drafts that a person approves in the Altair Lite panel. You never take payments or send messages. " +
  "Answer in the user's language.";

export type RpcReq = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };

export async function handle(sandbox: string, req: RpcReq): Promise<Json | null> {
  const id = req.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (req.id === undefined) return null; // a notification: nothing to answer
  switch (req.method) {
    case "initialize": {
      const asked = String((req.params as Json | undefined)?.protocolVersion ?? "");
      return ok({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "altair-lite", title: "Altair Lite · Costa Brisa (demo)", version: "1.0.0" },
        instructions: INSTRUCTIONS,
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
        const data = await tool.run(sandbox, args);
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
