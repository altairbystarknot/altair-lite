// The whole state of one sandbox: a small tourism business with private transfers and tours.
// Everything here is sample data or data the visitor typed in. Prices are whole US dollars, taxes included.

export type Zone = { id: string; name: string; kind: "airport" | "town"; aliases: string[] };
export type Vehicle = { id: string; name: string; seats: number; bags: number };
export type Rate = { from: string; to: string; vehicle: string; price: number };
export type Driver = { id: string; name: string; vehicle: string; languages: string[] };
/** `zone` is a zone id, or a plain place name once the zones were replaced by an import. */
export type Activity = { id: string; name: string; zone: string; adult: number; child: number; times: string[]; seats: number; duration: string };

export type BookingSource = "sample" | "web" | "claude" | "team";

export type Booking = {
  code: string;
  kind: "transfer" | "tour";
  customer: string;
  country: string;
  email?: string;
  adults: number;
  children: number;
  date: string; // YYYY-MM-DD, business time zone
  time: string; // HH:MM
  from?: string; // zone id (transfers)
  to?: string; // zone id (transfers)
  vehicle?: string; // vehicle id (transfers)
  activity?: string; // activity id (tours)
  pickup?: string; // free text
  total: number;
  status: "confirmed" | "request";
  driver: string | null;
  notes?: string;
  source?: BookingSource;
  createdAt?: string;
};

export type RateChange = { from: string; to: string; vehicle: string; before: number; after: number };
export type ImportPayload = { zones: Zone[]; vehicles: Vehicle[]; rates: Rate[]; file?: string };

export type Draft = {
  id: string;
  kind?: "rates" | "import" | "tour"; // missing = "rates"
  title: string;
  reason: string;
  changes: RateChange[];
  import?: ImportPayload;
  tour?: Activity;
  status: "pending" | "approved" | "discarded";
  createdAt: string;
  decidedAt?: string;
  source: "claude" | "team";
};

export type LogEntry = { id: string; at: string; actor: "claude" | "team" | "system" | "web"; text: string };

export type Business = {
  name: string;
  currency: "USD";
  timezone: string;
  prefix: string;
  phone: string;
  email: string;
  color?: string; // brand color, #rrggbb
  logo?: string | null; // small PNG/JPG/WebP as a data URL
  tagline?: string;
};

/** Onboarding: when each part was set up by the visitor (ISO time), so the panel can show what is left. */
export type Setup = {
  mode: "sample" | "own";
  profile?: string;
  logo?: string;
  rates?: string;
  tours?: string;
  team?: string;
  claude?: string;
  web?: string;
};

export type State = {
  business: Business;
  zones: Zone[];
  vehicles: Vehicle[];
  rates: Rate[];
  drivers: Driver[];
  activities: Activity[];
  bookings: Booking[];
  drafts: Draft[];
  log: LogEntry[];
  seededOn: string;
  setup?: Setup;
};
