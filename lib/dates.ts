// Dates in the business's own time zone, never the server's clock or UTC.

export const TIMEZONE = "America/Costa_Rica";

export function todayISO(tz = TIMEZONE, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "today", "tomorrow", "yesterday", a weekday name, or YYYY-MM-DD → YYYY-MM-DD. */
export function resolveDate(input: string | undefined, tz = TIMEZONE): string | null {
  const today = todayISO(tz);
  const v = (input ?? "today").trim().toLowerCase();
  if (v === "" || v === "today" || v === "hoy") return today;
  if (v === "tomorrow" || v === "mañana" || v === "manana") return addDays(today, 1);
  if (v === "yesterday" || v === "ayer") return addDays(today, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

export function longDate(iso: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
}

export function nowISO(): string {
  return new Date().toISOString();
}
