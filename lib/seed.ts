import { addDays, nowISO, todayISO, TIMEZONE } from "./dates";
import type { Booking, Rate, State } from "./types";

// "Costa Brisa (demo)": a fictional private-transfer and tour company in Costa Rica. The bookings are placed
// around the day the sandbox is created, so the demo always has something for today and tomorrow.

const ROUTES: Array<[string, string, number]> = [
  // from, to, sedan price (USD, taxes included). Van and minibus are derived below.
  ["sjo", "sanjose", 40],
  ["sjo", "fortuna", 170],
  ["sjo", "monteverde", 181],
  ["sjo", "manuelantonio", 187],
  ["sjo", "tamarindo", 238],
  ["lir", "tamarindo", 85],
  ["lir", "fortuna", 175],
  ["lir", "monteverde", 198],
  ["fortuna", "monteverde", 150],
  ["fortuna", "tamarindo", 210],
  ["sanjose", "manuelantonio", 175],
  ["monteverde", "manuelantonio", 215],
];
const VEHICLE_FACTOR: Record<string, number> = { sedan: 1, van: 1.3, minibus: 1.8 };

function rates(): Rate[] {
  const out: Rate[] = [];
  for (const [from, to, base] of ROUTES) {
    for (const [vehicle, f] of Object.entries(VEHICLE_FACTOR)) {
      const price = Math.round((base * f) / 5) * 5;
      out.push({ from, to, vehicle, price }, { from: to, to: from, vehicle, price });
    }
  }
  return out;
}

export function seed(today = todayISO(), mode: "sample" | "own" = "sample"): State {
  const d = (n: number) => addDays(today, n);
  const bookings: Booking[] = [
    { code: "CBR-1041", kind: "transfer", customer: "Laura Méndez", country: "United States", adults: 2, children: 1, date: d(0), time: "10:30", from: "sjo", to: "fortuna", vehicle: "van", total: 220, status: "confirmed", source: "sample", driver: "carlos", notes: "Flight AA 1489 lands 09:55" },
    { code: "CBR-1042", kind: "tour", customer: "Sofía Rojas", country: "Costa Rica", adults: 4, children: 2, date: d(0), time: "14:00", activity: "sloths", pickup: "Hotel Arenal Kioro", total: 340, status: "confirmed", source: "sample", driver: null },
    { code: "CBR-1043", kind: "transfer", customer: "James Carter", country: "Canada", adults: 2, children: 0, date: d(1), time: "06:00", from: "fortuna", to: "monteverde", vehicle: "sedan", total: 150, status: "confirmed", source: "sample", driver: null },
    { code: "CBR-1044", kind: "transfer", customer: "Familie Weber", country: "Germany", adults: 5, children: 2, date: d(1), time: "09:00", from: "sjo", to: "manuelantonio", vehicle: "minibus", total: 335, status: "confirmed", source: "sample", driver: "luis" },
    { code: "CBR-1045", kind: "tour", customer: "Akira Tanaka", country: "Japan", adults: 2, children: 0, date: d(1), time: "05:30", activity: "birds", pickup: "Hotel Belmar, Monteverde", total: 130, status: "confirmed", source: "sample", driver: null },
    { code: "CBR-1046", kind: "transfer", customer: "Andrés Solano", country: "Costa Rica", adults: 2, children: 0, date: d(1), time: "14:00", from: "lir", to: "tamarindo", vehicle: "sedan", total: 85, status: "request", source: "sample", driver: null, notes: "Asked for a child seat" },
    { code: "CBR-1047", kind: "tour", customer: "Emma Dubois", country: "France", adults: 2, children: 1, date: d(2), time: "08:00", activity: "snorkel", pickup: "Tamarindo center", total: 185, status: "confirmed", source: "sample", driver: null },
    { code: "CBR-1048", kind: "transfer", customer: "Marco Bianchi", country: "Italy", adults: 3, children: 0, date: d(2), time: "11:15", from: "monteverde", to: "manuelantonio", vehicle: "sedan", total: 215, status: "confirmed", source: "sample", driver: "marta" },
    { code: "CBR-1049", kind: "transfer", customer: "Olivia Brown", country: "United Kingdom", adults: 6, children: 0, date: d(3), time: "16:40", from: "tamarindo", to: "lir", vehicle: "van", total: 110, status: "confirmed", source: "sample", driver: null },
    { code: "CBR-1050", kind: "tour", customer: "Lucas Silva", country: "Brazil", adults: 2, children: 2, date: d(4), time: "18:00", activity: "night", pickup: "Hotel Belmar, Monteverde", total: 156, status: "confirmed", source: "sample", driver: null },
    { code: "CBR-1038", kind: "transfer", customer: "Noah Wilson", country: "United States", adults: 2, children: 0, date: d(-1), time: "13:00", from: "manuelantonio", to: "sjo", vehicle: "sedan", total: 187, status: "confirmed", source: "sample", driver: "ana" },
  ];
  return {
    business: { name: "Costa Brisa (demo)", currency: "USD", timezone: TIMEZONE, prefix: "CBR", phone: "+506 0000 0000", email: "hello@costabrisa.example", color: "#16766b", logo: null, tagline: "Private transfers and tours in Costa Rica" },
    zones: [
      { id: "sjo", name: "SJO airport (San José)", kind: "airport", aliases: ["sjo", "juan santamaria", "san jose airport", "alajuela"] },
      { id: "lir", name: "LIR airport (Liberia)", kind: "airport", aliases: ["lir", "liberia", "guanacaste airport"] },
      { id: "sanjose", name: "San José", kind: "town", aliases: ["san jose", "escazu", "santa ana"] },
      { id: "fortuna", name: "La Fortuna (Arenal)", kind: "town", aliases: ["la fortuna", "fortuna", "arenal"] },
      { id: "monteverde", name: "Monteverde", kind: "town", aliases: ["monteverde", "santa elena"] },
      { id: "manuelantonio", name: "Manuel Antonio", kind: "town", aliases: ["manuel antonio", "quepos"] },
      { id: "tamarindo", name: "Tamarindo", kind: "town", aliases: ["tamarindo", "langosta", "playa grande"] },
    ],
    vehicles: [
      { id: "sedan", name: "Sedan", seats: 3, bags: 3 },
      { id: "van", name: "Van", seats: 8, bags: 8 },
      { id: "minibus", name: "Minibus", seats: 18, bags: 18 },
    ],
    rates: rates(),
    drivers: [
      { id: "carlos", name: "Carlos", vehicle: "van", languages: ["es", "en"] },
      { id: "marta", name: "Marta", vehicle: "sedan", languages: ["es", "en", "it"] },
      { id: "luis", name: "Luis", vehicle: "minibus", languages: ["es", "en"] },
      { id: "ana", name: "Ana", vehicle: "sedan", languages: ["es", "en", "fr"] },
    ],
    activities: [
      { id: "sloths", name: "Sloth & wildlife walk", zone: "fortuna", adult: 65, child: 40, times: ["08:00", "14:00"], seats: 12, duration: "2.5 h" },
      { id: "birds", name: "Birdwatching at dawn", zone: "monteverde", adult: 65, child: 45, times: ["05:30"], seats: 8, duration: "3 h" },
      { id: "snorkel", name: "Snorkel with turtles", zone: "tamarindo", adult: 70, child: 45, times: ["08:00", "13:00"], seats: 12, duration: "4 h" },
      { id: "night", name: "Night walk in the cloud forest", zone: "monteverde", adult: 45, child: 33, times: ["18:00"], seats: 10, duration: "2 h" },
    ],
    bookings,
    drafts: [],
    log: [{ id: "l0", at: nowISO(), actor: "system", text: "Sandbox created with sample data for Costa Brisa (demo)." }],
    seededOn: today,
    setup: { mode },
  };
}
