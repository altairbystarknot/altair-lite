// Reads a rate sheet in the browser: Excel (.xlsx) or CSV, without libraries. An .xlsx file is a zip of XML
// files; modern browsers can inflate it with DecompressionStream. The sheet can be "long" (one row per route
// and vehicle: From, To, Vehicle, Price) or "wide" (one row per route, one price column per vehicle).

import type { ImportRow } from "./ops";

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer, want: (name: string) => boolean) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66_000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This is not an Excel (.xlsx) file.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= u8.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (!want(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = u8.subarray(start, start + size);
    const data = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
    if (data) out.set(name, dec.decode(data));
  }
  return out;
}

const colIndex = (ref: string) => {
  const letters = ref.replace(/[^A-Z]/gi, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buf, (n) => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheetName = [...files.keys()].filter((n) => n.startsWith("xl/worksheets/")).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const parser = new DOMParser();
  const shared: string[] = [];
  const ss = files.get("xl/sharedStrings.xml");
  if (ss) {
    const doc = parser.parseFromString(ss, "application/xml");
    for (const si of Array.from(doc.getElementsByTagName("si"))) shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  }
  const doc = parser.parseFromString(files.get(sheetName)!, "application/xml");
  const rows: string[][] = [];
  for (const row of Array.from(doc.getElementsByTagName("row"))) {
    const r = Number(row.getAttribute("r") ?? rows.length + 1) - 1;
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const t = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const val = t === "s" ? (shared[Number(v)] ?? "") : t === "inlineStr" ? Array.from(c.getElementsByTagName("t")).map((x) => x.textContent ?? "").join("") : v;
      cells[colIndex(c.getAttribute("r") ?? "A")] = val;
    }
    rows[r] = Array.from(cells, (x) => (x ?? "").trim());
  }
  return Array.from(rows, (x) => x ?? []).filter((r) => r.some((c) => c !== ""));
}

function readCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) row.push(cell.trim()), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell.trim()), rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

export async function readSheet(file: File): Promise<string[][]> {
  if (file.size > 3_000_000) throw new Error("Use a file under 3 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return readXlsx(await file.arrayBuffer());
  if (name.endsWith(".xls")) throw new Error("Save the file as .xlsx (Excel 2007 or later) or .csv and try again.");
  return readCsv((await file.text()).replace(/^﻿/, ""));
}

/** "$1,250", "1.250,00", "USD 85" → 1250, 1250, 85. */
export function toPrice(v: string): number | null {
  const raw = String(v ?? "").replace(/[^0-9.,-]/g, "");
  if (!raw || !/\d/.test(raw)) return null;
  let n = raw;
  if (n.includes(",") && n.includes(".")) n = n.lastIndexOf(",") > n.lastIndexOf(".") ? n.replace(/\./g, "").replace(",", ".") : n.replace(/,/g, "");
  else if (n.includes(",")) n = /,\d{1,2}$/.test(n) ? n.replace(",", ".") : n.replace(/,/g, "");
  const x = Math.round(Number(n));
  return Number.isFinite(x) && x > 0 ? x : null;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const H = {
  from: /^(from|origin|origen|desde|salida|pick ?up|recogida|punto de partida)/,
  to: /^(to|destination|destino|hasta|llegada|drop ?off|entrega)/,
  vehicle: /^(vehicle|vehiculo|unidad|tipo de vehiculo|transporte|car type)/,
  price: /^(price|precio|tarifa|rate|usd|monto|costo|cost|valor|\$)/,
};

export type Detected = { rows: ImportRow[]; vehicles: string[]; places: string[]; skipped: number; format: "long" | "wide"; header: string[] };

export function detectRates(table: string[][]): Detected {
  let h = table.findIndex((r, i) => i < 15 && r.some((c) => H.from.test(fold(c))) && r.some((c) => H.to.test(fold(c))));
  if (h === -1) h = 0;
  const header = table[h] ?? [];
  const f = header.findIndex((c) => H.from.test(fold(c)));
  const t = header.findIndex((c) => H.to.test(fold(c)));
  const fi = f === -1 ? 0 : f;
  const ti = t === -1 ? 1 : t;
  const vi = header.findIndex((c) => H.vehicle.test(fold(c)));
  const pi = header.findIndex((c, i) => i !== fi && i !== ti && H.price.test(fold(c)));
  const body = table.slice(h + 1);
  const rows: ImportRow[] = [];
  let skipped = 0;
  let format: "long" | "wide";
  if (vi !== -1 && pi !== -1) {
    format = "long";
    for (const r of body) {
      const price = toPrice(r[pi]);
      if (!r[fi] || !r[ti] || !r[vi] || price === null) {
        skipped++;
        continue;
      }
      rows.push({ from: r[fi], to: r[ti], vehicle: r[vi], price });
    }
  } else {
    format = "wide";
    const cols = header.map((c, i) => ({ c: c.trim(), i })).filter(({ c, i }) => i !== fi && i !== ti && c && !/(seats|asientos|capacidad|notes?|notas?|km|distance|distancia|time|tiempo|duraci)/.test(fold(c)));
    const single = cols.length === 1 && H.price.test(fold(cols[0].c));
    for (const r of body) {
      if (!r[fi] || !r[ti]) {
        skipped++;
        continue;
      }
      let any = false;
      for (const { c, i } of cols) {
        const price = toPrice(r[i]);
        if (price === null) continue;
        any = true;
        rows.push({ from: r[fi], to: r[ti], vehicle: single ? "Private vehicle" : c, price });
      }
      if (!any) skipped++;
    }
  }
  return {
    rows,
    vehicles: [...new Set(rows.map((r) => r.vehicle.trim()))],
    places: [...new Set(rows.flatMap((r) => [r.from.trim(), r.to.trim()]))],
    skipped,
    format,
    header,
  };
}

export function toCsv(rows: string[][]) {
  return rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
}

export function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A logo file → a small PNG/WebP data URL (max 256 px) and the brand color it suggests. */
export async function readLogo(file: File): Promise<{ dataUrl: string; color: string | null }> {
  if (file.size > 6_000_000) throw new Error("Use an image under 6 MB.");
  if (!/^image\/(png|jpe?g|webp|svg\+xml|gif)$/.test(file.type)) throw new Error("Use a PNG, JPG, WebP or SVG image.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("That image could not be read. Try a PNG or JPG."));
      img.src = url;
    });
    const w0 = img.naturalWidth || 256;
    const h0 = img.naturalHeight || 256;
    let max = 256;
    for (;;) {
      const k = Math.min(1, max / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * k));
      const h = Math.max(1, Math.round(h0 * k));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0, w, h);
      let dataUrl = c.toDataURL("image/png");
      if (dataUrl.length > 88_000) dataUrl = c.toDataURL("image/webp", 0.86);
      if (dataUrl.length <= 88_000 || max <= 96) {
        if (dataUrl.length > 88_000) throw new Error("That image is too detailed; try a simpler logo.");
        return { dataUrl, color: dominant(g, w, h) };
      }
      max = Math.round(max * 0.7);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dominant(g: CanvasRenderingContext2D, w: number, h: number): string | null {
  const { data } = g.getImageData(0, 0, w, h);
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], gg = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 160) continue;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx - mn < 38 || mx < 40 || mn > 225) continue;
    const key = ((r >> 5) << 6) | ((gg >> 5) << 3) | (b >> 5);
    const x = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    x.n++, (x.r += r), (x.g += gg), (x.b += b);
    buckets.set(key, x);
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (!best || best.n < 6) return null;
  const hex = (v: number) => Math.round(v / best.n).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}
