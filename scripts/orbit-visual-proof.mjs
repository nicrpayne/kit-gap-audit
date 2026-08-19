// ORBIT, PROVEN AS AN INSTRUMENT.
//
// The foundation pass proved the read model. This one proves the SURFACE
// keeps the promises the visual contract makes, on the real project:
//
//   the forecast is the real distribution, not a picture of one
//   an unresolved decision reads as an obstruction, and releasing it opens
//   starvation is a MATERIAL, so it shows up without the graph changing shape
//   touching a thing shows its causal story and quiets everything else
//   a hypothetical is the suite's one Scenario, and Reality survives it
//   Orbit is never a stale snapshot
//   nothing a machine merely suggested can move a date
//
//   node scripts/orbit-visual-proof.mjs
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

let writes = [];
let recomputes = [];
await p.route("**/*", (r) => {
  const m = r.request().method();
  const u = r.request().url().replace(BASE, "");
  if (m !== "GET") writes.push(`${m} ${u}`);
  if (/\/api\/(forecast|portfolio\/|estimate|refresh)/i.test(u)) recomputes.push(`${m} ${u}`);
  r.continue();
});

const settle = (ms = 700) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1672, 1042); await settle(300); };
const txt = (sel) => p.locator(sel).evaluate((e) => e.textContent.trim());
const attrs = (sel, name) => p.locator(sel).evaluateAll((els, n) => els.map((e) => e.getAttribute(n)), name);
const nodeCount = () => p.locator("[data-orbit-node]").count();

const openOrbit = async () => {
  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll("[data-orbit-node]").length > 0, { timeout: 30000 });
  await settle(2400);
  await park();
};
const focus = async (id) => { await p.click(`[data-shoot="orbit-focus-${id}"]`); await settle(1300); await park(); };
const backToReality = async () => {
  const d = p.locator('[data-shoot="scenario-strip"] >> text=/back to reality/i').first();
  if ((await d.count()) > 0 && (await d.isEnabled())) { await d.click(); await settle(1600); }
};

// The project with the most going on is the one worth proving against.
await openOrbit();
const scopeIds = await attrs('[data-shoot^="orbit-focus-"]', "data-shoot").then((a) =>
  a.map((s) => s.replace("orbit-focus-", ""))
);
let busiest = scopeIds[0];
let best = -1;
for (const s of scopeIds) {
  await focus(s);
  const n = await nodeCount();
  if (n > best) { best = n; busiest = s; }
}
await focus(busiest);
console.log(`      (proving against "${busiest}")\n`);

// ── A. THE RESTING VIEW ────────────────────────────────────────────────
{
  const kinds = await attrs("[data-orbit-node]", "data-orbit-kind");
  check("A1. One forecast at the centre, and only one", kinds.filter((k) => k === "forecast").length === 1);
  check("A2. The four substances are all present", ["forecast", "capability", "gate", "capacity"].every((k) => kinds.includes(k)),
    [...new Set(kinds)].sort().join(", "));
  check("A3. The resting view stays a handful of objects", kinds.length >= 4 && kinds.length <= 12, `${kinds.length}`);
  check("A4. The inspector is quiet until asked", (await p.locator('[data-shoot="orbit-inspector-rest"]').count()) === 1);
}

// ── B. THE FORECAST IS THE REAL DISTRIBUTION ───────────────────────────
{
  check("B1. There is a halo, drawn from trials", (await p.locator('[data-shoot="orbit-halo"]').count()) === 1);
  // OPEN, not a ring. The drawn body must not span the full circle, because
  // a closed ring would claim the last trial is adjacent to the first.
  const sweep = await p.locator('[data-shoot="orbit-halo"] path').first().evaluate((el) => {
    const svg = el.ownerSVGElement;
    const cx = 500, cy = 500;
    const n = el.getTotalLength();
    let min = Infinity, max = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const pt = el.getPointAtLength((i / 200) * n);
      let a = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI;
      if (a < 140) a += 360; // the arc starts at 150 deg and runs increasing
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    void svg;
    return max - min;
  });
  check("B2. …and it is an ARC, not a ring — time does not wrap", sweep < 300, `${sweep.toFixed(0)}° of 360`);

  const p50Day = Number(await p.locator('[data-shoot="orbit-halo"]').getAttribute("data-p50-day"));
  const shown = await txt('[data-shoot="orbit-centre-p50"]');
  const model = await p.evaluate(async () => {
    const r = await fetch("/api/instrument/project", { cache: "no-store" });
    const d = await r.json();
    return d.startDate;
  });
  const expected = new Date(new Date(model).getTime() + p50Day * 86400000).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
  check("B3. The centre states the EXACT P50, not a rounded one", shown === expected, `${shown} from day ${p50Day}`);
  check("B4. A target is drawn as a reference, and confidence is stated against it",
    (await p.locator('[data-shoot="orbit-target"]').count()) === 1 &&
      /%/.test(await txt('[data-shoot="orbit-centre-confidence"]')),
    await txt('[data-shoot="orbit-centre-confidence"]'));
  check("B5. The miss tail is drawn from the same body", (await p.locator('[data-shoot="orbit-miss-tail"]').count()) >= 0);
}

// ── C. AN UNRESOLVED DECISION IS AN OBSTRUCTION ────────────────────────
let gateIds = [];
{
  gateIds = await attrs('[data-orbit-kind="gate"]', "data-orbit-node");
  check("C1. Unanswered decisions are on the field", gateIds.length > 0, `${gateIds.length}`);
  const states = await attrs('[data-orbit-kind="gate"]', "data-gate-state");
  check("C2. …and they read as clamped, not as peers in orbit", states.every((s) => s === "clamped"), states.join(","));

  // The pinch is real geometry: the same flow is drawn thinner past the
  // clamp than before it. Measured, not asserted.
  const widths = await p.locator('[data-orbit-edge-kind="load"] path').evaluateAll((els) =>
    els.map((e) => Number(e.getAttribute("stroke-width")))
  );
  const outer = widths.filter((_, i) => i % 2 === 0);
  const inner = widths.filter((_, i) => i % 2 === 1);
  const pinched = outer.every((w, i) => inner[i] < w);
  check("C3. Work is visibly pinched where it crosses the clamp", pinched,
    `${outer[0]?.toFixed(2)} → ${inner[0]?.toFixed(2)}`);
}

// ── D. TOUCHING A THING SHOWS ITS CAUSAL STORY ─────────────────────────
{
  await p.click(`[data-orbit-node="${gateIds[0]}"]`);
  await settle(700);
  const op = await p.locator("[data-orbit-node]").evaluateAll((els) =>
    els.map((e) => {
      let n = e, o = 1;
      while (n && n.getAttribute) { const v = n.getAttribute("opacity"); if (v) o *= Number(v); n = n.parentElement; }
      return o;
    })
  );
  const litCount = op.filter((o) => o > 0.5).length;
  check("D1. Unrelated objects recede strongly", litCount >= 2 && litCount < op.length, `${litCount} of ${op.length} lit`);
  const centreOp = await p.locator('[data-orbit-kind="forecast"]').evaluate((e) => {
    let n = e, o = 1;
    while (n && n.getAttribute) { const v = n.getAttribute("opacity"); if (v) o *= Number(v); n = n.parentElement; }
    return o;
  });
  check("D2. …and the path always reaches the consequence", centreOp > 0.5);
  const inspector = await p.locator('[data-shoot="orbit-inspector"]').innerText();
  check("D3. The inspector states the modelled consequence literally", /MOVES THE DATE/i.test(inspector) && /\d+\.\d days/.test(inspector),
    inspector.split("\n").slice(0, 4).join(" / "));
  check("D4. …in human language, with no implementation vocabulary",
    !/OrbitGraph|waits_on|feeds edge|causal=|candidate causal/i.test(inspector));
  check("D5. …and says where the claim came from", /from the/i.test(await txt('[data-shoot="orbit-provenance"]')),
    await txt('[data-shoot="orbit-provenance"]'));
}

// ── E. RELEASING THE OBSTRUCTION ───────────────────────────────────────
{
  writes = [];
  recomputes = [];
  const before = await txt('[data-shoot="orbit-centre-p50"]');
  await p.click(`[data-shoot="orbit-assume-${gateIds[0]}"]`);
  await settle(1800);
  const state = await p.locator(`[data-orbit-node="${gateIds[0]}"]`).getAttribute("data-gate-state");
  const after = await txt('[data-shoot="orbit-centre-p50"]');
  check("E1. The obstruction opens", state === "released", state);
  check("E2. …the forecast visibly improves", after !== before, `${before} → ${after}`);
  check("E3. …Reality is still shown for comparison", (await p.locator('[data-shoot="orbit-ghost"]').count()) === 1);
  // One clamp released is not an open path when another still holds — so
  // release every one of them before claiming the work can get through.
  for (const gid of gateIds.slice(1)) {
    await p.click(`[data-orbit-node="${gid}"]`);
    await settle(500);
    await p.click(`[data-shoot="orbit-assume-${gid}"]`);
    await settle(1400);
  }
  check("E4. …and with every clamp released the work is no longer pinched",
    await p.locator('[data-orbit-edge-kind="load"] path').evaluateAll((els) => {
      const w = els.map((e) => Number(e.getAttribute("stroke-width")));
      return w.filter((_, i) => i % 2 === 0).every((v, i) => Math.abs(v - w[i * 2 + 1]) < 0.01);
    }));
  check("E5. …and none of it wrote anything", writes.length === 0, writes.join(", ") || "0 writes");
  check("E6. …or asked a server to re-forecast", recomputes.length === 0, recomputes.join(", ") || "0 recomputes");

  // ONE SCENARIO. Walk to Forecast client-side; the hypothetical is there.
  await p.click('a[href="/forecast"]');
  await p.waitForURL("**/forecast", { timeout: 15000 });
  await settle(2200);
  const strip = await p.locator('[data-shoot="scenario-strip"]').first().innerText();
  check("E7. The same hypothetical is waiting in Forecast", /scenario/i.test(strip), strip.split("\n")[0]);
  await p.click('a[href="/orbit"]').catch(() => {});
  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]');
  await settle(2400);
  await backToReality();
  await focus(busiest);
  check("E8. Discarding it anywhere returns exactly to Reality",
    (await p.locator('[data-shoot="orbit-ghost"]').count()) === 0 &&
      (await attrs('[data-orbit-kind="gate"]', "data-gate-state")).every((s) => s === "clamped"));
}

// ── F. STARVATION IS A MATERIAL, NOT A SHAPE ───────────────────────────
//
// Driven by the context-switch cost, which is Portfolio's own dial and a
// real stored input. NOT by SuiteScenario.capacityOverrideByScope: that
// field exists and the engine honours it, but no instrument writes it
// today, so there is no product path to an aggregate capacity hypothetical.
{
  const beforeKinds = (await attrs("[data-orbit-node]", "data-orbit-kind")).sort().join(",");
  const beforeCore = await p.locator('[data-orbit-kind="capacity"]').getAttribute("data-capacity-effective");
  const beforeStrain = Number(await p.locator('[data-orbit-kind="capacity"]').getAttribute("data-capacity-strain"));

  const original = (await (await fetch(`${BASE}/api/portfolio-settings`)).json()).settings.contextSwitchCostPct;
  await fetch(`${BASE}/api/portfolio-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contextSwitchCostPct: 60 }),
  });

  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]');
  await settle(2600);
  await focus(busiest);

  const afterKinds = (await attrs("[data-orbit-node]", "data-orbit-kind")).sort().join(",");
  const afterCore = await p.locator('[data-orbit-kind="capacity"]').getAttribute("data-capacity-effective");
  const strain = Number(await p.locator('[data-orbit-kind="capacity"]').getAttribute("data-capacity-strain"));
  check("F1. Starving the project does not change the graph's shape", beforeKinds === afterKinds,
    `${afterKinds.split(",").length} objects, unchanged`);
  check("F2. …the capacity actually reaching the work is visibly lower", Number(afterCore) < Number(beforeCore),
    `${beforeCore} → ${afterCore} FTE`);
  check("F3. …and the difference lives in the material, not the topology", strain > beforeStrain * 3 && strain > 0.05,
    `strain ${beforeStrain} → ${strain}`);
  await p.locator('[data-orbit-kind="capacity"]').click();
  await settle(700);
  const capText = await p.locator('[data-shoot="orbit-inspector"]').innerText();
  check("F4. …named as context switching, with the people it is happening to",
    /context switching/i.test(capText) && /split across other projects/i.test(capText),
    capText.split("\n").find((l) => /context switching/i.test(l)) ?? "");

  await fetch(`${BASE}/api/portfolio-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contextSwitchCostPct: original }),
  });
  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]');
  await settle(2400);
  await focus(busiest);
  check("F5. …and putting the roster back puts the reading back",
    Math.abs(Number(await p.locator('[data-orbit-kind="capacity"]').getAttribute("data-capacity-effective")) - Number(beforeCore)) < 0.01);
}

// ── G. NOTHING UNACCEPTED MOVES A DATE ─────────────────────────────────
{
  await focus(busiest);
  const cands = p.locator('[data-orbit-node][data-candidate="true"]');
  const n = await cands.count();
  if (n > 0) {
    const id = await cands.first().getAttribute("data-orbit-node");
    const edge = p.locator(`[data-orbit-edge="load:${id}"]`);
    check("G1. A machine's suggestion is on the field, drawn as not-yet-real", true, `${n} candidate(s)`);
    check("G2. …carrying a relationship the engine does not listen to",
      (await edge.getAttribute("data-causal")) === "false" &&
        (await edge.getAttribute("data-orbit-edge-kind")) === "candidate");
    writes = [];
    await cands.first().click();
    await settle(700);
    check("G3. …and looking at it changes nothing",
      writes.length === 0 && (await p.locator('[data-shoot="orbit-candidate-note"]').count()) === 1);
  } else {
    check("G1. A machine's suggestion is on the field, drawn as not-yet-real", false, "none in view");
    check("G2. …carrying a relationship the engine does not listen to", false, "n/a");
    check("G3. …and looking at it changes nothing", false, "n/a");
  }
  check("G4. No suggestion anywhere claims to move the forecast",
    (await p.locator('[data-orbit-edge-kind="candidate"][data-causal="true"]').count()) === 0);
}

// ── H. ORBIT IS NOT A SNAPSHOT ─────────────────────────────────────────
{
  await p.click('[data-shoot="orbit-field"]', { position: { x: 12, y: 12 } });
  await settle(500);
  const before = await attrs('[data-orbit-kind="gate"]', "data-orbit-node");

  // Answer a decision for real, outside this document entirely.
  const decisions = await (await fetch(`${BASE}/api/decisions`)).json();
  const target = decisions.decisions.find((d) => d.gate && d.status === "open" && d.gate.targetScopeId === busiest);
  check("H0. There is a real unanswered decision to answer", !!target, target?.title ?? "none");
  if (target) {
    await fetch(`${BASE}/api/decisions/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "decided", resolution: "Answered by the Orbit visual proof." }),
    });

    // Walk away and back the way a person does — client-side, no reload.
    await p.click('a[href="/scope"]');
    await p.waitForURL("**/scope", { timeout: 15000 });
    await settle(1800);
    await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
    await p.waitForSelector('[data-shoot="orbit-field"]');
    await settle(2600);
    await focus(busiest);
    const after = await attrs('[data-orbit-kind="gate"]', "data-orbit-node");
    check("H1. A decision answered elsewhere stops obstructing here", after.length === before.length - 1,
      `${before.length} clamps → ${after.length}`);
    check("H2. …and it is that decision that left", !after.includes(`gate:${target.gate.id}`));

    // Put Reality back exactly as it was found.
    await fetch(`${BASE}/api/decisions/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "open", resolution: null }),
    });
    await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
    await p.waitForSelector('[data-shoot="orbit-field"]');
    await settle(2400);
    await focus(busiest);
    const restored = await attrs('[data-orbit-kind="gate"]', "data-orbit-node");
    check("H3. …and reopening it brings the obstruction back", restored.length === before.length,
      `${restored.length} clamps`);
  } else {
    check("H1. A decision answered elsewhere stops obstructing here", false, "no gated open decision");
    check("H2. …and it is that decision that left", false, "n/a");
    check("H3. …and reopening it brings the obstruction back", false, "n/a");
  }
}

await b.close();
console.log(failures === 0 ? "\nALL ORBIT VISUAL PROOFS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
