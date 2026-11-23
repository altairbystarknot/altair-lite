import { seed } from "./seed";
import type { State } from "./types";

// One sandbox = one JSON document. Locally (no SUPABASE_URL) sandboxes live in memory and reset when the
// server restarts. Online they live in Supabase, behind two database functions that only accept a valid
// sandbox id and a bounded document, with optimistic concurrency (a write based on an old version retries).

export const SANDBOX_ID = /^[a-z0-9]{6,32}$/;
export const PUBLIC_SANDBOX = "public000";

type Loaded = { state: State; version: number };

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const online = Boolean(URL && KEY);

const g = globalThis as unknown as { __liteMemory?: Map<string, Loaded> };
const memory = (g.__liteMemory ??= new Map<string, Loaded>());

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`store ${fn} failed (${res.status})`);
  return (await res.json()) as T;
}

async function read(id: string): Promise<Loaded | null> {
  if (!online) return memory.get(id) ?? null;
  const rows = await rpc<Array<{ data: State; version: number }>>("lite_load", { p_id: id });
  return rows[0] ? { state: rows[0].data, version: rows[0].version } : null;
}

/** Writes `state` if the stored version is still `version` (0 = create). Returns the new version or -1. */
async function write(id: string, state: State, version: number): Promise<number> {
  if (!online) {
    const cur = memory.get(id);
    if ((cur?.version ?? 0) !== version) return -1;
    memory.set(id, { state, version: version + 1 });
    return version + 1;
  }
  return rpc<number>("lite_save", { p_id: id, p_data: state, p_version: version });
}

export async function load(id: string): Promise<State> {
  if (!SANDBOX_ID.test(id)) throw new Error("Invalid sandbox id");
  const got = await read(id);
  if (got) return got.state;
  const fresh = seed();
  const v = await write(id, fresh, 0);
  if (v === -1) return (await read(id))!.state; // created by someone else a moment ago
  return fresh;
}

/** Applies `fn` to the sandbox and saves it, retrying if another write landed first. */
export async function mutate<T>(id: string, fn: (s: State) => T): Promise<T> {
  if (!SANDBOX_ID.test(id)) throw new Error("Invalid sandbox id");
  for (let attempt = 0; attempt < 5; attempt++) {
    let cur = await read(id);
    if (!cur) {
      await load(id);
      cur = await read(id);
      if (!cur) throw new Error("Sandbox unavailable");
    }
    const draft = structuredClone(cur.state);
    const result = fn(draft);
    draft.log = draft.log.slice(-60);
    if ((await write(id, draft, cur.version)) !== -1) return result;
  }
  throw new Error("The sandbox is busy, please try again");
}

export async function reset(id: string): Promise<void> {
  await mutate(id, (s) => {
    const fresh = seed();
    Object.assign(s, fresh);
  });
}

export const storeMode = online ? "supabase" : "memory";
