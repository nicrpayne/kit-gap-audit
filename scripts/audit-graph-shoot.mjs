// SIGNAL GRAPH — THE VISUAL SWEEP.
//
// Ordered as the reading the instrument is built around: project shape at far
// zoom, delivery structure at medium, source detail at close — then the
// interactions that make it explorable.
//
//   node scripts/audit-graph-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/graph-shots";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// SHA-256("kit-gap-audit::" + APP_PASSWORD) for the local dev password "dev".
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1600, height: 1000 };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
p.on("console", (m) => m.type() === "error" && console.log("CONSOLE:", m.text()));

const shot = async (n) => {
  await p.screenshot({ path: `${out}/${n}.png` });
  console.log("shot", n);
};
const settle = (ms = 700) => p.waitForTimeout(ms);
const park = async () => {
  await p.mouse.move(VIEWPORT.width - 8, VIEWPORT.height - 8);
  await settle(300);
};
const centre = { x: 640, y: 560 };
const zoom = async (steps, delta = -260) => {
  await p.mouse.move(centre.x, centre.y);
  for (let i = 0; i < steps; i++) {
    await p.mouse.wheel(0, delta);
    await settle(90);
  }
  await settle(500);
};

await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(1400);
await park();

// ── 01. FAR ZOOM — project shape ─────────────────────────────────────
await shot("01-far-project-shape");

// ── 02. MEDIUM ZOOM — delivery structure ─────────────────────────────
await zoom(4);
await park();
await shot("02-medium-delivery-structure");

// ── 03. CLOSE ZOOM — ticket / evidence detail ────────────────────────
//
// Zooming on the viewport centre just magnifies Reality: the core is there,
// and there is no further detail inside it. Close zoom means "go and look at
// the source material", so this expands the evidence cluster and flies to it
// — which is what the acceptance test actually asks about.
await p.locator('[data-shoot="camera-fit"]').click();
await settle(500);
await p.locator('[data-shoot="cluster-toggle-evidence"]').click({ force: true });
await settle(1100);
await zoom(3);
await park();
await shot("03-close-source-detail");
await p.locator('[data-shoot="collapse-all"]').click();
await settle(400);

// back out
await p.locator('[data-shoot="camera-fit"]').click();
await settle(700);

// ── 04. SEARCH ───────────────────────────────────────────────────────
await p.locator('[data-shoot="graph-search"]').fill("offline");
await settle(900);
await shot("04-search-offline");
await p.locator('[data-shoot="graph-search"]').fill("");
await settle(600);

// ── 05. SELECTED DEPENDENCY ──────────────────────────────────────────
{
  const dep = p.locator('[data-shoot^="node-dependency:"]').first();
  if (await dep.count()) {
    await dep.locator("g[role=button]").click({ force: true });
    await settle(900);
    await park();
    await shot("05-selected-dependency");
  } else {
    console.log("SKIP 05 — no dependency node on this Scope");
  }
}

// ── 06. SELECTED FINDING ─────────────────────────────────────────────
{
  const f = p.locator('[data-shoot^="node-finding:"]').first();
  await f.locator("g[role=button]").click({ force: true });
  await settle(1000);
  await park();
  await shot("06-selected-finding");

  // ── 07. EVIDENCE SOLO ──────────────────────────────────────────────
  const soloToggle = p.locator('[data-shoot="evidence-solo-toggle"]');
  if (await soloToggle.count()) {
    await soloToggle.click();
    await settle(900);
    await park();
    await shot("07-evidence-solo");
    await soloToggle.click();
    await settle(400);
  }
}

// ── 08. EXPANDED EXECUTION / FEATURE CLUSTER ─────────────────────────
// Reset first: solo and search both auto-expand what they reveal, so without
// collapsing, this shot would show their leftovers rather than the execution
// cluster on its own.
await p.keyboard.press("Escape");
await settle(400);
await p.locator('[data-shoot="collapse-all"]').click();
await p.locator('[data-shoot="camera-fit"]').click();
await settle(700);
{
  const toggle = p.locator('[data-shoot="cluster-toggle-linear"]');
  if (await toggle.count()) {
    // Expanding flies to the cluster, so no manual camera move is needed.
    await toggle.click({ force: true });
    await settle(1100);
    await park();
    await shot("08-expanded-execution");
    await p.locator('[data-shoot="camera-fit"]').click();
    await settle(500);
  }
}

// ── 09. EXPAND ALL ───────────────────────────────────────────────────
await p.locator('[data-shoot="expand-all"]').click();
await settle(1000);
await park();
await shot("09-expand-all");
await p.locator('[data-shoot="collapse-all"]').click();
await settle(600);

// ── 10. RUN AUDIT ────────────────────────────────────────────────────
await p.locator('[data-shoot="run-audit"]').click();
await p.waitForTimeout(1100);
await shot("10-run-audit-sweep");
await p.waitForTimeout(2800);
await park();

// ── 11. SPARSE SCOPE ─────────────────────────────────────────────────
await p.goto(`${BASE}/audit?scope=design`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(1400);
await park();
await shot("11-sparse-scope");

// ── 12. THE NARROWER TARGET ──────────────────────────────────────────
await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await p.setViewportSize({ width: 1440, height: 900 });
await settle(1200);
await park();
await shot("12-1440x900");

await b.close();
console.log(`\nwrote ${out}`);
