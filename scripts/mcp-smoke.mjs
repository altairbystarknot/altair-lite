#!/usr/bin/env node
// Talks to an Altair Lite MCP endpoint the way Claude does: initialize, list tools, call a few.
// Usage: node scripts/mcp-smoke.mjs [endpoint]   (default http://localhost:3200/mcp/smoketest1)
const URL = process.argv[2] ?? "http://localhost:3200/mcp/smoketest1";
let id = 0;
async function rpc(method, params) {
  const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
const call = async (name, args = {}) => {
  const res = await rpc("tools/call", { name, arguments: args });
  const text = res.content?.[0]?.text ?? "";
  console.log(`\n• ${name}${res.isError ? " (refused)" : ""}\n  ${text.split("\n").slice(0, 8).join("\n  ")}`);
  return res;
};
const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
console.log("initialize →", init.serverInfo.name, init.protocolVersion);
await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }).then((r) => console.log("initialized →", r.status));
const { tools } = await rpc("tools/list", {});
console.log("tools →", tools.map((t) => t.name).join(", "));
await call("business_overview");
await call("day_schedule", { date: "tomorrow" });
await call("quote_transfer", { from: "SJO airport", to: "La Fortuna", passengers: 5 });
await call("assign_driver", { code: "CBR-1043", driver: "Marta" });
await call("assign_driver", { code: "CBR-1046", driver: "Marta" });
await call("propose_rate_change", { percent: 10, vehicle: "Van", reason: "High season starts on December 15." });
await call("list_drafts", { status: "pending" });
await call("draft_customer_message", { code: "CBR-1043", kind: "driver", language: "es" });
await call("booking_details", { code: "CBR-9999" });
console.log("\nsmoke ok");
