// DENSITY + PROGRESSIVE IDENTITY — THE VISUAL QA.
//
// The acceptance question is "does far zoom communicate that there is a rich
// project system here, while staying understandable", and the way to answer
// it is to look at THE SAME AREA at three zooms rather than three different
// framings. So far/medium/close below zoom about one fixed world point on the
// Linear rim — the thing under the cursor stays under it, and what changes is
// only how much of itself each mark is showing.
//
//   node scripts/audit-density-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/density-shots";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1600, height: 1000 };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const settle = (ms = 700) => p.waitForTimeout(ms);
const park = async () => {
  await p.mouse.move(VIEWPORT.width - 8, VIEWPORT.height - 8);
  await settle(300);
};
const shot = async (n) => {
  await p.screenshot({ path: `${out}/${n}.png` });
  const stats = await p.evaluate(() => {
    const all = document.querySelectorAll('[data-shoot^="node-"]').length;
    const latent = document.querySelectorAll('[data-shoot^="node-"][data-identity="latent"]').length;
    return { all, latent, named: all - latent, edges: document.querySelectorAll("[data-rel]").length };
  });
  console.log(`shot ${n}  — ${stats.all} marks (${stats.named} identified, ${stats.latent} latent), ${stats.edges} edges`);
};

/** Screen point for a world point, read from the live viewBox. */
const screenOf = (wx, wy) =>
  p.evaluate(
    ([x, y]) => {
      const svg = document.querySelector('[data-shoot="signal-graph"]');
      const vb = svg.viewBox.baseVal;
      const r = svg.getBoundingClientRect();
      return { x: r.left + ((x - vb.x) / vb.width) * r.width, y: r.top + ((y - vb.y) / vb.height) * r.height };
    },
    [wx, wy]
  );

const zoomAbout = async (pt, steps, delta = -260) => {
  await p.mouse.move(pt.x, pt.y);
  for (let i = 0; i < steps; i++) {
    await p.mouse.wheel(0, delta);
    await settle(90);
  }
  await settle(520);
};

await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(1400);
await park();

// ── 01. FAR — the whole project, as mass ─────────────────────────────
await shot("01-far-whole-field");

// The Linear rim: sector axis 45 degrees, out where the work items sit.
const RIM = { x: 700 + 592 * Math.cos(Math.PI / 4), y: 700 + 592 * Math.sin(Math.PI / 4) };

// ── 02-04. THE SAME AREA AT THREE ZOOMS ──────────────────────────────
{
  const pt = await screenOf(RIM.x, RIM.y);
  await p.mouse.move(pt.x, pt.y);
  await settle(200);
  await park();
  await shot("02-same-area-far");

  await zoomAbout(pt, 3);
  await park();
  await shot("03-same-area-medium");

  await zoomAbout(await screenOf(RIM.x, RIM.y), 4);
  await park();
  await shot("04-same-area-close");

  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(700);
}

// ── 05/06. EXECUTION, COLLAPSED THEN EXPANDED ────────────────────────
{
  const pt = await screenOf(RIM.x, RIM.y);
  await zoomAbout(pt, 3);
  await park();
  await shot("05-execution-collapsed");

  await p.locator('[data-shoot="cluster-toggle-linear"]').click({ force: true });
  await settle(1200);
  await park();
  await shot("06-execution-expanded");

  await p.locator('[data-shoot="collapse-all"]').click();
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(800);
}

// ── 07/08. EVIDENCE, COLLAPSED THEN EXPANDED ─────────────────────────
{
  // Evidence owns the last sector: -90 + 7*45 = 225 degrees.
  const a = (225 * Math.PI) / 180;
  const EV = { x: 700 + 590 * Math.cos(a), y: 700 + 590 * Math.sin(a) };
  const pt = await screenOf(EV.x, EV.y);
  await zoomAbout(pt, 3);
  await park();
  await shot("07-evidence-collapsed");

  await p.locator('[data-shoot="cluster-toggle-evidence"]').click({ force: true });
  await settle(1200);
  await park();
  await shot("08-evidence-expanded");

  await p.locator('[data-shoot="collapse-all"]').click();
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(800);
}

// ── 09. EVERYTHING OPEN — the density ceiling ────────────────────────
await p.locator('[data-shoot="expand-all"]').click();
await settle(1100);
await park();
await shot("09-expand-all");
await p.locator('[data-shoot="collapse-all"]').click();
await settle(700);

// ── 10. A SPARSE SCOPE MUST STILL READ AS SPARSE ─────────────────────
await p.goto(`${BASE}/audit?scope=design`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(1400);
await park();
await shot("10-sparse-scope");

// ── 11. THE NARROWER TARGET ──────────────────────────────────────────
await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await p.setViewportSize({ width: 1440, height: 900 });
await settle(1300);
await park();
await shot("11-1440x900");

await b.close();
console.log(`\nwrote ${out}`);
