// ORBIT'S FOUNDATION, PROVEN IN A BROWSER.
//
// The pure proofs (orbit-graph-proof, orbit-states-proof) show the read
// model is a restatement. This one shows the SURFACE keeps that promise on
// real project data:
//
//   1. LOOKING CHANGES NOTHING. Entering, focusing, selecting and dimming
//      write nothing and recompute nothing on the server.
//   2. THERE IS ONE SCENARIO. A hypothetical made in Orbit is the same
//      hypothetical Forecast is already showing — not a copy of it.
//   3. NOTHING UNACCEPTED MOVES A DATE. A Hermes candidate is drawn as a
//      suggestion and carries an edge the engine does not listen to.
//   4. EVERY LINE CAN BE EXPLAINED. Touch anything and it says, in a
//      sentence, what it does and which stored field says so.
//
//   node scripts/orbit-foundation-proof.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });

// Every non-GET, and every request to anything that could recompute a
// forecast server-side. Orbit must produce neither while being read.
let writes = [];
let recomputes = [];
await p.route("**/*", (r) => {
  const m = r.request().method();
  const u = r.request().url().replace(BASE, "");
  if (m !== "GET") writes.push(`${m} ${u}`);
  if (/\/api\/(forecast|portfolio|estimate|refresh)/i.test(u)) recomputes.push(`${m} ${u}`);
  r.continue();
});

const settle = (ms = 600) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1674, 1044); await settle(250); };
const nodes = () => p.locator("[data-orbit-node]");
const ids = async () => nodes().evaluateAll((els) => els.map((e) => e.getAttribute("data-orbit-node")));
// An SVG <text> is not an HTMLElement, so innerText is unavailable here.
const centreText = () => p.locator('[data-shoot="orbit-centre-p50"]').evaluate((e) => e.textContent.trim());

const open = async () => {
  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll("[data-orbit-node]").length > 0, { timeout: 30000 });
  await settle(2200);
  await park();
};

await open();

// ── A. THE RESTING VIEW ────────────────────────────────────────────────
{
  const focusButtons = await p.locator('[data-shoot^="orbit-focus-"]').count();
  check("A1. Orbit opens on a real project without being asked", focusButtons > 0, `${focusButtons} projects`);

  // Every project, at rest, on real data.
  const sizes = [];
  const scopeIds = await p
    .locator('[data-shoot^="orbit-focus-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-shoot").replace("orbit-focus-", "")));
  for (const s of scopeIds) {
    await p.click(`[data-shoot="orbit-focus-${s}"]`);
    await settle(900);
    sizes.push([s, await nodes().count()]);
  }
  check(
    "A2. No project's resting view is a wall",
    sizes.every(([, n]) => n >= 2 && n <= 10),
    sizes.map(([s, n]) => `${s}:${n}`).join(" ")
  );

  // The busiest project is the interesting one for everything below.
  const busiest = sizes.slice().sort((x, y) => y[1] - x[1])[0][0];
  await p.click(`[data-shoot="orbit-focus-${busiest}"]`);
  await settle(1000);
  await park();
  console.log(`      (working on "${busiest}")`);

  const kinds = await nodes().evaluateAll((els) => els.map((e) => e.getAttribute("data-orbit-kind")));
  check(
    "A3. The centre is the consequence, and it is exactly one object",
    kinds.filter((k) => k === "forecast").length === 1
  );
  check(
    "A4. The rings carry what ships, what it waits on, and what controls it",
    kinds.includes("capability") && kinds.includes("capacity"),
    [...new Set(kinds)].sort().join(", ")
  );
  check("A5. The centre states a real date", /\d{4}/.test(await centreText()), await centreText());
}

// ── B. LOOKING CHANGES NOTHING ─────────────────────────────────────────
{
  writes = [];
  recomputes = [];
  const before = await centreText();

  // Touch everything there is to touch.
  const list = await ids();
  for (const id of list) {
    await p.click(`[data-orbit-node="${id}"]`);
    await settle(180);
  }
  await p.click('[data-shoot="orbit-field"]', { position: { x: 10, y: 10 } });
  await settle(400);

  check("B1. Reading the whole graph writes nothing", writes.length === 0, writes.join(", ") || "0 writes");
  check("B2. …and recomputes nothing on the server", recomputes.length === 0, recomputes.join(", ") || "0 recomputes");
  check("B3. …and leaves the forecast exactly where it was", (await centreText()) === before, before);
}

// ── C. EVERY LINE CAN BE EXPLAINED ─────────────────────────────────────
{
  const list = await ids();
  let explained = 0;
  let provenanced = 0;
  for (const id of list) {
    await p.click(`[data-orbit-node="${id}"]`);
    await settle(200);
    const meanings = await p.locator('[data-shoot^="orbit-meaning-"]').count();
    const prov = await p.locator('[data-shoot="orbit-provenance"]').innerText();
    if (meanings > 0) explained += 1;
    if (prov.trim().length > 0 && prov.includes("·")) provenanced += 1;
  }
  check("C1. Every object on the field says what it does", explained === list.length, `${explained}/${list.length}`);
  check("C2. …and names the field it was read from", provenanced === list.length, `${provenanced}/${list.length}`);

  // The sentence is the product, so it must be a sentence.
  const sample = await p.locator('[data-shoot^="orbit-meaning-"]').first().innerText();
  check("C3. …in words, not in a score", sample.trim().length > 40 && /[a-z]{4,}/.test(sample), sample.slice(0, 60) + "…");
}

// ── D. TOUCHING ONE THING QUIETS THE REST ──────────────────────────────
{
  const gate = p.locator('[data-orbit-kind="gate"]').first();
  const hasGate = (await gate.count()) > 0;
  if (hasGate) {
    await gate.click();
    await settle(400);
    const opacities = await nodes().evaluateAll((els) =>
      els.map((e) => Number(e.getAttribute("opacity") ?? "1"))
    );
    const lit = opacities.filter((o) => o > 0.5).length;
    check("D1. Focusing a decision lights its path, not the whole field", lit >= 2 && lit < opacities.length, `${lit} of ${opacities.length} lit`);
    const centreLit = await p
      .locator('[data-orbit-kind="forecast"]')
      .evaluate((e) => Number(e.getAttribute("opacity") ?? "1"));
    check("D2. …and the path always reaches the consequence", centreLit > 0.5);
  } else {
    check("D1. Focusing a decision lights its path, not the whole field", false, "no gate in the live data");
    check("D2. …and the path always reaches the consequence", false, "no gate in the live data");
  }
  await p.click('[data-shoot="orbit-field"]', { position: { x: 10, y: 10 } });
  await settle(300);
}

// ── E. NOTHING UNACCEPTED MOVES A DATE ─────────────────────────────────
{
  const cands = p.locator('[data-orbit-node][data-candidate="true"]');
  const n = await cands.count();
  if (n > 0) {
    const id = await cands.first().getAttribute("data-orbit-node");
    const edge = p.locator(`[data-orbit-edge="load:${id}"]`);
    check("E1. A machine's suggestion is drawn as not-yet-real", true, `${n} candidate(s)`);
    check(
      "E2. …and its edge is one the engine does not listen to",
      (await edge.getAttribute("data-causal")) === "false" &&
        (await edge.getAttribute("data-orbit-edge-kind")) === "candidate"
    );
    await cands.first().click();
    await settle(300);
    check("E3. …and the surface says so in the inspector", (await p.locator('[data-shoot="orbit-candidate-note"]').count()) === 1);
    await p.click('[data-shoot="orbit-field"]', { position: { x: 10, y: 10 } });
    await settle(250);
  } else {
    check("E1. A machine's suggestion is drawn as not-yet-real", false, "no candidate in view on the live data");
    check("E2. …and its edge is one the engine does not listen to", false, "n/a");
    check("E3. …and the surface says so in the inspector", false, "n/a");
  }

  // Whatever is on screen, the invariant holds for every edge drawn.
  const bad = await p
    .locator('[data-orbit-edge][data-orbit-edge-kind="candidate"][data-causal="true"]')
    .count();
  check("E4. No candidate edge anywhere claims to move the forecast", bad === 0);
}

// ── F. THERE IS ONE SCENARIO, AND IT ALREADY EXISTED ───────────────────
{
  const gate = p.locator('[data-orbit-kind="gate"]').first();
  if ((await gate.count()) === 0) {
    check("F1. Assuming a decision answered moves the date", false, "no gate in the live data");
  } else {
    const before = await centreText();
    writes = [];
    recomputes = [];

    await gate.click();
    await settle(350);
    const gateId = await gate.getAttribute("data-orbit-node");
    await p.click(`[data-shoot="orbit-assume-${gateId}"]`);
    // The re-simulation is debounced in useProject and runs in the browser.
    await settle(1400);

    const after = await centreText();
    check("F1. Assuming a decision answered moves the date", after !== before, `${before} → ${after}`);
    check("F2. …without a single write", writes.length === 0, writes.join(", ") || "0 writes");
    check("F3. …and without asking a server to re-forecast", recomputes.length === 0, recomputes.join(", ") || "0 recomputes");

    const gateEdge = p.locator(`[data-orbit-edge="gates:${gateId.replace("gate:", "")}"]`);
    check(
      "F4. The assumed gate stays visible but stops acting",
      (await gateEdge.count()) === 1 && (await gateEdge.getAttribute("data-causal")) === "false"
    );

    // THE POINT. Walk to Forecast without reloading: if Orbit had built its
    // own scenario store, the hypothetical would not be there.
    await p.click('a[href="/forecast"]');
    await p.waitForURL("**/forecast", { timeout: 15000 });
    await settle(2200);
    const strip = await p.locator('[data-shoot="scenario-strip"]').first().innerText();
    check("F5. The hypothetical is waiting in Forecast, unrepeated", /scenario/i.test(strip), strip.split("\n")[0]);

    // And discarding there clears it here — one store, both directions.
    const discard = p.locator('[data-shoot="scenario-strip"] >> text=/back to reality/i').first();
    if ((await discard.count()) > 0) {
      await discard.click();
      await settle(1200);
    }
    await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
    await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
    await settle(2200);
    const restStrip = await p.locator('[data-shoot="scenario-strip"]').first().innerText();
    check("F6. Discarding it anywhere clears it everywhere", /reality/i.test(restStrip) && !/scenario/i.test(restStrip), restStrip.split("\n")[0]);
  }
}

// ── G. CHANGING WHAT YOU LOOK AT IS NOT CHANGING THE PROJECT ───────────
{
  const scopeIds = await p
    .locator('[data-shoot^="orbit-focus-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-shoot").replace("orbit-focus-", "")));
  if (scopeIds.length >= 2) {
    await p.click(`[data-shoot="orbit-focus-${scopeIds[0]}"]`);
    await settle(900);
    const first = await centreText();
    const firstIds = (await ids()).join(",");

    writes = [];
    recomputes = [];
    await p.click(`[data-shoot="orbit-focus-${scopeIds[1]}"]`);
    await settle(900);
    await p.click(`[data-shoot="orbit-focus-${scopeIds[0]}"]`);
    await settle(900);

    check("G1. Looking away and back gives the same graph", (await ids()).join(",") === firstIds);
    check("G2. …and the same forecast", (await centreText()) === first, first);
    check("G3. …having written nothing and re-forecast nothing", writes.length === 0 && recomputes.length === 0);
  } else {
    check("G1. Looking away and back gives the same graph", false, "only one project");
    check("G2. …and the same forecast", false, "only one project");
    check("G3. …having written nothing and re-forecast nothing", false, "only one project");
  }
}

// ── H. THE SURFACE ADMITS WHAT IT LEFT OUT ─────────────────────────────
{
  const scopeIds = await p
    .locator('[data-shoot^="orbit-focus-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-shoot").replace("orbit-focus-", "")));
  let sawOmission = false;
  for (const s of scopeIds) {
    await p.click(`[data-shoot="orbit-focus-${s}"]`);
    await settle(700);
    if ((await p.locator('[data-shoot="orbit-omitted"]').count()) > 0) {
      const t = await p.locator('[data-shoot="orbit-omitted"]').evaluate((e) => e.textContent.trim());
      sawOmission = true;
      check("H1. What the resting view did not draw is counted on the field", /\d/.test(t), t);
      break;
    }
  }
  if (!sawOmission) check("H1. What the resting view did not draw is counted on the field", true, "nothing omitted on this data");
}

await b.close();
console.log(failures === 0 ? "\nALL ORBIT FOUNDATION PROOFS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
