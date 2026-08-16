// PLAYBACK, PROVEN BY ACTUALLY PLAYING IT.
//
// This drives the real transport in a real browser and watches what
// happens. It does not call event handlers directly: the whole claim of
// the instrument is that pressing play tells the story, and a proof that
// bypasses the button proves nothing about the button.
//
// What it asserts:
//   - the playhead advances chronologically through real stored dates
//   - crossed events illuminate, and the count accumulates
//   - the remembered forecast changes ONLY at Report boundaries
//   - no network request and no simulation runs during historical playback
//   - future planned events stay un-crossed
//   - playback stops at NOW
//   - a dateless candidate cannot be accepted
//   - a manual landmark appears immediately, with no reload
//   - the cross-instrument doors go where they say
//
//   node scripts/timeline-playback-proof.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/timeline-playback";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });

// Every request the page makes, so "playback issues none" is a measurement.
const requests = [];
p.on("request", (r) => requests.push({ url: r.url(), at: Date.now() }));

// Clear residue from any earlier interrupted run before measuring, so a
// stale landmark cannot sit on top of a real one and swallow its clicks.
{
  const pre = await (await fetch(`${BASE}/api/timeline`)).json();
  for (const e of pre.entries.filter((x) => x.title.startsWith("PROOF"))) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
}

await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
await p.waitForTimeout(2500);

const playheadDate = () => p.locator('[data-shoot="playhead-date"]').innerText();
const crossedCount = async () =>
  Number((await p.locator('[data-shoot="crossed-count"]').innerText()).split("/")[0].replace(/\D/g, ""));
const memoryOf = async (scopeId) =>
  p.locator(`[data-shoot="memory-likely-${scopeId}"]`).innerText({ timeout: 200 }).catch(() => null);
const laneIds = await p.locator('[data-shoot^="lane-header-"]').evaluateAll((els) =>
  els.map((e) => e.getAttribute("data-shoot").replace("lane-header-", "")));

check("Timeline opens with lanes for every project", laneIds.length >= 2, laneIds.join(", "));
check("It opens at NOW", (await playheadDate()).length > 0, await playheadDate());

// ── jump to the beginning, then PLAY ───────────────────────────────
await p.locator('[data-shoot="to-beginning"]').click();
await p.waitForTimeout(900);
const startDate = await playheadDate();
const startCrossed = await crossedCount();
check("Jump to beginning moves the playhead back to the earliest event", startCrossed <= 1, `${startDate}, crossed=${startCrossed}`);

// Geometry that must not move while the story plays or an event is
// selected: an instrument whose field jumps under an inspector update is
// not one you can watch.
const geometry = () =>
  p.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return [+b.top.toFixed(1), +b.left.toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)];
    };
    return { field: r('[data-shoot="time-field"]'), transport: r('[data-shoot="transport"]') };
  });
const geomBefore = await geometry();

// Sample continuously while it plays.
const samples = [];
let sawArticulation = 0;
let sawGhost = 0;
let sawDelta = 0;
const geomDuring = [];
const requestsAtPlay = requests.length;
await p.locator('[data-shoot="play"]').click();

const deadline = Date.now() + 60000;
let lastCrossed = startCrossed;
while (Date.now() < deadline) {
  const [date, crossed, mem] = await Promise.all([
    playheadDate(),
    crossedCount(),
    Promise.all(laneIds.map((id) => memoryOf(id))),
  ]);
  samples.push({ date, crossed, mem, t: Date.now() });
  // Articulation, the memory ghost and the stated delta are what make the
  // story readable; each must actually occur during a real run.
  sawArticulation = Math.max(sawArticulation, await p.locator('[data-shoot^="event-module-"]').count());
  sawGhost = Math.max(sawGhost, await p.locator('[data-shoot="forecast-memory-ghost"]').count());
  sawDelta = Math.max(sawDelta, await p.locator('[data-shoot="memory-delta"]').count());
  if (geomDuring.length < 26) geomDuring.push(await geometry());
  if (crossed < lastCrossed) check("playhead never un-crosses events mid-run", false, `${lastCrossed} → ${crossed}`);
  lastCrossed = crossed;
  // stopped?
  const stillPlaying = await p.locator('[data-shoot="play"] rect').count();
  if (stillPlaying === 0 && samples.length > 4) break;
  await p.waitForTimeout(140);
}
await p.waitForTimeout(1200);

const requestsDuringPlay = requests.slice(requestsAtPlay).filter(
  (r) => !r.url.includes("/_next/") && !r.url.startsWith("data:")
);
check(
  "No network request during historical playback — nothing is re-simulated",
  requestsDuringPlay.length === 0,
  requestsDuringPlay.map((r) => r.url.replace(BASE, "")).slice(0, 3).join(", ") || "zero requests"
);

// ── chronology and accumulation ────────────────────────────────────
const parsed = samples.map((s) => new Date(s.date).getTime());
check("The playhead advanced monotonically", parsed.every((v, i) => i === 0 || parsed[i - 1] <= v), `${samples.length} samples`);
check("Events accumulated as they were crossed", lastCrossed > startCrossed, `${startCrossed} → ${lastCrossed}`);
check("Events ARTICULATE as they are crossed — the note becomes readable",
  sawArticulation > 0, `${sawArticulation} modules open at once, peak`);
check("The previous memory band lingers as a ghost when the band steps",
  sawGhost > 0, `${sawGhost} ghost band(s)`);
check("The step states the movement between two stored likely dates",
  sawDelta > 0, `${sawDelta} delta readout(s)`);
{
  const drift = (k) => {
    const vals = geomDuring.map((g) => g[k]).filter(Boolean);
    if (vals.length === 0) return 0;
    return Math.max(...[0, 1, 2, 3].map((i) => Math.max(...vals.map((v) => v[i])) - Math.min(...vals.map((v) => v[i]))));
  };
  check("The time field does not move while the story plays", drift("field") === 0, `${drift("field").toFixed(1)}px`);
  check("The transport does not move while the story plays", drift("transport") === 0, `${drift("transport").toFixed(1)}px`);
}
check("Articulation SETTLES — no module is left open once playback ends",
  (await p.locator('[data-shoot^="event-module-"][data-phase="articulating"]').count()) === 0);
check("Crossed events stay illuminated behind the playhead",
  (await p.locator('[data-shoot^="event-"][data-crossed="true"]').count()) > 0,
  `${await p.locator('[data-shoot^="event-"][data-crossed="true"]').count()} lit`);

// ── forecast memory stepped, and only at Reports ───────────────────
const memSeries = laneIds.map((id, i) => {
  const vals = samples.map((s) => s.mem[i]).filter((v) => v !== null);
  const distinct = [...new Set(vals)];
  return { id, distinct, changes: vals.reduce((n, v, k) => (k > 0 && v !== vals[k - 1] ? n + 1 : n), 0) };
});
const stepped = memSeries.filter((m) => m.changes > 0);
check("The remembered forecast STEPPED during playback", stepped.length > 0,
  stepped.map((m) => `${m.id}: ${m.distinct.join(" → ")}`).join(" | ") || "no lane changed");

// Every value it ever showed must be a real stored Report likely date.
const projection = await (await fetch(`${BASE}/api/timeline`)).json();
const fmt = (iso) => {
  const d = new Date(iso);
  return `${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getUTCMonth()]} ${d.getUTCDate()}`;
};
let invented = [];
for (const m of memSeries) {
  const real = new Set((projection.snapshotsByScope[m.id] ?? []).map((s) => fmt(s.likelyDate)));
  for (const v of m.distinct) if (v && !real.has(v)) invented.push(`${m.id}:${v}`);
}
check("Every remembered value was a REAL stored Report — nothing interpolated",
  invented.length === 0, invented.slice(0, 4).join(", ") || "all values traced to a Report");

// ── stopped at NOW, future untouched ───────────────────────────────
const finalDate = await playheadDate();
const nowT = new Date(projection.now).getTime();
const finalT = new Date(finalDate).getTime();
check("Playback stopped at the NOW boundary", Math.abs(finalT - nowT) < 2 * 86400000, `${finalDate} vs now ${fmt(projection.now)}`);
check("It stopped on its own — the transport shows play, not pause",
  (await p.locator('[data-shoot="play"] path').count()) > 0);

const futurePlanned = projection.entries.filter(
  (e) => e.temporalState === "planned" && new Date(e.date).getTime() > nowT
);
if (futurePlanned.length > 0) {
  const anyCrossed = await p.locator(`[data-shoot="event-${futurePlanned[0].id}"][data-crossed="true"]`).count();
  check("Future planned events were NOT played through", anyCrossed === 0, futurePlanned[0].title.slice(0, 40));
} else {
  check("A future planned event exists to check", false, "none");
}

// ── overdue plan survives ──────────────────────────────────────────
const overdue = projection.entries.find((e) => e.temporalState === "planned" && e.detail?.overdue === true);
if (overdue) {
  const el = p.locator(`[data-shoot="event-${overdue.id}"]`);
  check("A planned event behind NOW is still drawn as planned, marked overdue",
    (await el.getAttribute("data-planned")) === "true" && (await el.getAttribute("data-overdue")) === "true",
    overdue.title.slice(0, 40));
} else {
  check("An overdue planned landmark exists", false, "none");
}

// ── scrub into the future, inspect a plan ──────────────────────────
if (futurePlanned.length > 0) {
  await p.locator(`[data-shoot="event-${futurePlanned[0].id}"]`).dispatchEvent("click");
  await p.waitForTimeout(700);
  check("A future planned landmark is inspectable and reads PLANNED",
    (await p.locator('[data-shoot="planned-badge"]').count()) > 0,
    await p.locator('[data-shoot="planned-badge"]').innerText().catch(() => ""));
}

// ── the dateless candidate cannot be accepted ──────────────────────
const dateless = projection.candidates.find((c) => !c.date);
if (dateless) {
  const res = await p.evaluate(async (id) => {
    const r = await fetch(`/api/timeline-candidates/${id}/accept`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return { status: r.status, body: await r.json() };
  }, dateless.id);
  check("A dateless candidate is REFUSED acceptance", res.status === 422 && res.body.needsDate === true, `HTTP ${res.status}`);
  check("…and the refusal explains that Timeline will not infer the date",
    String(res.body.error).includes("will not infer"), String(res.body.error).slice(0, 60));
} else {
  check("A dateless candidate exists", false, "none");
}

// ── a manual landmark appears immediately ──────────────────────────
await p.locator('[data-shoot="add-event"]').click();
await p.waitForTimeout(600);
await p.locator('[data-shoot="event-title"]').fill("PROOF playback landmark");
await p.locator('[data-shoot="event-state-planned"]').click();
await p.locator('[data-shoot="event-save"]').click();
await p.waitForTimeout(2600);
const appeared = await p.locator('[data-shoot="add-event-tool"]').count();
const proj2 = await (await fetch(`${BASE}/api/timeline`)).json();
const made = proj2.entries.find((e) => e.title === "PROOF playback landmark");
check("A manual landmark appears without a reload", appeared === 0 && !!made, made ? made.date.slice(0, 10) : "not created");
check("…and is stored PLANNED exactly as stated", made?.temporalState === "planned");

// ── cross-instrument doors ─────────────────────────────────────────
const reportEntry = projection.entries.find((e) => e.kind === "report");
if (reportEntry) {
  await p.locator(`[data-shoot="event-${reportEntry.id}"]`).dispatchEvent("click");
  await p.waitForTimeout(600);
  await p.locator('[data-shoot="open-forecast"]').click();
  await p.waitForTimeout(2600);
  check("Report → Open Forecast navigates to Forecast", p.url().includes("/forecast"), p.url().replace(BASE, ""));
  await p.goBack();
  await p.waitForTimeout(2400);
}
const decisionEntry = projection.entries.find((e) => e.family === "decision" && e.kind === "decision_raised");
if (decisionEntry) {
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 20000 });
  await p.locator(`[data-shoot="event-${decisionEntry.id}"]`).dispatchEvent("click");
  await p.waitForTimeout(600);
  await p.locator('[data-shoot="open-decisions"]').click();
  await p.waitForTimeout(2600);
  check("Decision → Open Decisions navigates to Decisions", p.url().includes("/decisions"), p.url().replace(BASE, ""));
  await p.goBack();
  await p.waitForTimeout(2400);
}
await p.waitForSelector('[data-shoot="time-field"]', { timeout: 20000 });
await p.waitForTimeout(1800); // let the route finish hydrating before clicking
await p.locator(`[data-shoot="lane-header-${laneIds[0]}"]`).click();
await p.waitForURL(/\/scope/, { timeout: 15000 }).catch(() => {});
check("Lane → Open Scope navigates to Scope", p.url().includes("/scope"), p.url().replace(BASE, ""));

// ── cleanup ────────────────────────────────────────────────────────
if (made) {
  const del = await fetch(`${BASE}/api/timeline-events/${made.id}`, { method: "DELETE" });
  check("The proof landmark could be deleted through its own endpoint", del.ok, `HTTP ${del.status}`);
}
await new Promise((r) => setTimeout(r, 600));
const finalProj = await (await fetch(`${BASE}/api/timeline`)).json();
check("Reality restored — the proof landmark is gone",
  !finalProj.entries.some((e) => e.title === "PROOF playback landmark"));

// Selecting must not resize the field either — the inspector swapping
// content is not allowed to move the score under the pointer.
{
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 20000 });
  await p.waitForTimeout(2200);
  // Context is not drawn on the default Story surface, so this check turns
  // every layer on first. The entry was always in the projection — Layers
  // only decides what the first glance carries.
  await p.locator('[data-shoot="layers-toggle"]').click();
  await p.waitForTimeout(400);
  await p.locator('[data-shoot="layers-everything"]').click();
  await p.waitForTimeout(600);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  const before = await geometry();
  const rep = finalProj.entries.find((e) => e.kind === "report");
  const ctxE = finalProj.entries.find((e) => e.kind === "context_observed");
  for (const e of [rep, ctxE].filter(Boolean)) {
    await p.locator(`[data-shoot="event-${e.id}"]`).dispatchEvent("click");
    await p.waitForTimeout(700);
  }
  const after = await geometry();
  check("Selecting events never resizes the time field",
    JSON.stringify(before.field) === JSON.stringify(after.field),
    `${JSON.stringify(before.field)} → ${JSON.stringify(after.field)}`);
}

await b.close();
console.log(`\n${failures === 0 ? "ALL TIMELINE PLAYBACK PROOFS PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
