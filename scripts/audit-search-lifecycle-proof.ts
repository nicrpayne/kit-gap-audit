import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPhase3RubricCore } from "../lib/audit/rubricPhase3Core";

// Execute the actual generated search handler, not a duplicate implementation.
const core = buildPhase3RubricCore(readFileSync("public/audit-rubric-phase1/_core.js", "utf8"));
const code = core.slice(core.indexOf("let debounce = null;"), core.indexOf("    rebuildLegend();", core.indexOf("let debounce = null;")));
const input = { value: "", oninput: () => {}, onblur: () => {} };
const results = { innerHTML: "", style: { display: "none" }, querySelectorAll: () => [] };
let pendingTimer: (() => Promise<void>) | undefined;
let unload: () => void;
let read: (url: string, options: { signal: AbortSignal }) => Promise<unknown>;
new Function("input", "results", "fetch", "window", "setTimeout", "clearTimeout", "AbortController", code)(
  input, results, (url: string, options: { signal: AbortSignal }) => read(url, options),
  { addEventListener: (name: string, fn: () => void) => { assert.equal(name, "pagehide"); unload = fn; } },
  (fn: () => Promise<void>) => { pendingTimer = fn; return 1; }, () => { pendingTimer = undefined; }, AbortController,
);
const query = (value: string) => { input.value = value; input.oninput(); };
const fire = () => { const fn = pendingTimer!; pendingTimer = undefined; return fn(); };
async function main() {
  read = async () => { throw new TypeError("Load failed"); };
  query("offline"); await fire();
  assert.match(results.innerHTML, /Search unavailable/);
  read = async () => ({ ok: false }); query("http-error"); await fire();
  assert.match(results.innerHTML, /Search unavailable/);
  let finish: (value: unknown) => void = () => {};
  let signal: AbortSignal;
  read = (_url, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); };
  query("old"); const old = fire(); query("");
  assert.equal(signal!.aborted, true);
  finish({ ok: true, json: async () => ({ results: [] }) }); await old;
  assert.equal(results.innerHTML, ""); assert.equal(results.style.display, "none");
  query("old-again"); const stale = fire();
  const staleFinish = finish; query("new");
  read = async () => ({ ok: true, json: async () => ({ results: [] }) }); await fire();
  staleFinish({ ok: true, json: async () => ({ results: [] }) }); await stale;
  assert.match(results.innerHTML, /No hits/);
  query("debounced"); unload!(); assert.equal(pendingTimer, undefined);
  read = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new TypeError("Load failed"))));
  query("leaving"); const leaving = fire(); unload!(); await leaving;
  assert.equal(results.innerHTML, "");
  assert.match(readFileSync("public/audit-rubric-phase2/phase2-host.js", "utf8"), /input\.value = ''; input\.dispatchEvent\(new Event\('input'/);
  assert.match(readFileSync("public/audit-rubric-phase2/phase2-host.js", "utf8"), /nativeFetch\(endpoint\('search', q\), \{ signal: init && init.signal \}\)/);
  console.log("PASS: generated Audit search handles failed/HTTP reads, clear, superseded query, debounce cancellation and page exit without uncaught rejection or stale results");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
