// SIGNAL AUDIT — THE VISUAL SWEEP.
//
// Ordered as the interaction hierarchy the instrument is built around:
// calm at rest, focused on selection, alive during analysis.
//
//   node scripts/audit-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/audit-shots";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// The session cookie is SHA-256("kit-gap-audit::" + APP_PASSWORD). The
// default below is that hash for the local dev password "dev" — not a
// secret, and overridable with KIT_SESSION for any other environment.
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
mkdirSync(out, { recursive: true });

// The stated primary target, and the narrower size it must stay usable at.
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

await p.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="truth-map"]', { timeout: 30000 });
await settle(1200);
await park();

// ── 01. CALM AT REST ────────────────────────────────────────────────
await shot("01-rest");

// ── 02. HOVER IS A PREVIEW, NOT AN INVESTIGATION ────────────────────
const first = p.locator('[data-shoot^="finding-"]').first();
await first.locator(".audit-callout").hover();
await settle(500);
await shot("02-hover");
await park();

// ── 03. FOCUSED ON SELECTION ────────────────────────────────────────
const critical = p.locator('[data-shoot^="finding-"][data-tier="critical"]').first();
const target = (await critical.count()) ? critical : first;
await target.locator(".audit-callout").click();
await settle(800);
await park();
await shot("03-selected");

// ── 04. EVIDENCE SOLO ───────────────────────────────────────────────
await p.locator('[data-shoot="evidence-solo-toggle"]').click();
await settle(700);
await park();
await shot("04-evidence-solo");

// ── 05. B · CANDIDATE REALITY ───────────────────────────────────────
await p.locator('[data-shoot="mode-B"]').click();
await settle(700);
await shot("05-candidate");
await p.locator('[data-shoot="mode-A"]').click();
await settle(400);

// ── 06. ALIVE DURING ANALYSIS ───────────────────────────────────────
await p.locator('[data-shoot="run-audit"]').click();
await p.waitForTimeout(900);
await shot("06-sweep");
await p.waitForTimeout(2600);
await park();

// ── 07. NEEDS-HUMAN FILTER ──────────────────────────────────────────
await p.locator('[data-shoot="filter-human"]').click();
await settle(700);
await shot("07-filter-human");
await p.locator('[data-shoot="filter-all"]').click();
await settle(400);

// ── 08. THE NARROWER TARGET ─────────────────────────────────────────
await p.setViewportSize({ width: 1440, height: 900 });
await settle(900);
await park();
await shot("08-1440x900");

await b.close();
console.log(`\nwrote ${out}`);
