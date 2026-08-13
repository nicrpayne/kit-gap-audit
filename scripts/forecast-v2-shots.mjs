// Forecast Flagship V2.1 — interaction + motion evidence run.
// Exercises every cause→effect transition still owned by Forecast, captures
// frames DURING the morphs, and hard-asserts the critical semantic:
// scrubbing a target never changes the object's geometry.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/fc-v21";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const p = await ctx.newPage();
let errors = 0;
p.on("pageerror", (e) => { errors++; console.log("PAGEERROR:", e.message); });
p.on("console", (m) => { if (m.type() === "error") { errors++; console.log("CONSOLE:", m.text().slice(0, 160)); } });

const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log("shot", n); };
const wait = (ms) => p.waitForTimeout(ms);
let failures = 0;
const assert = (cond, label) => {
  console.log(cond ? `PASS  ${label}` : `FAIL  ${label}`);
  if (!cond) failures++;
};
const bodyPathD = () => p.evaluate(() => document.querySelector('.lf-subject svg path[data-shoot="object-hit"]')?.getAttribute("d"));
const ensureMacros = async (want) => {
  const open = (await p.locator('[data-shoot="macro-people"]').count()) > 0;
  if (open !== want) { await p.locator('[data-shoot="toggle-macros"]').click(); await wait(400); }
};

await p.goto("http://localhost:3000/forecast", { waitUntil: "networkidle" });
await wait(4500);

// ── A. Platform at rest ──────────────────────────────────────────────────
await p.locator('[data-shoot="scope-platform"]').click();
await wait(2600);
await shot("a1-platform-rest");
assert((await p.locator('[data-shoot^="gate-wall-"]').count()) === 1, "Platform shows one gate wall");
assert((await p.locator('[data-shoot="macro-capacity"]').count()) === 0, "no capacity fader on Forecast (Portfolio owns it)");

// ── B. CRITICAL TEST: target scrub must not move the object ─────────────
const dBefore = await bodyPathD();
const scrub = p.locator('[data-shoot="target-scrub"]');
await scrub.focus();
for (let i = 0; i < 25; i++) { await p.keyboard.press("ArrowLeft"); await wait(20); }
await wait(600);
await shot("a2-target-scrubbed-object-still");
const dAfter = await bodyPathD();
assert(dBefore === dAfter, "object geometry identical after scrubbing target 25 days");
// the % lives at the target line now
assert(/\d+%/.test(await p.locator('[data-shoot="target-caption"]').innerText()), "confidence shown at the target line");
await p.locator('[data-shoot="target-caption"]').click();
await wait(400);
await shot("b9-target-tool");
await p.locator('[data-shoot="target-reset"]').click();
await wait(300);
await p.locator('[data-shoot="tool-close"]').click();
await wait(400);

// ── C. Gate release ──────────────────────────────────────────────────────
await ensureMacros(true);
await shot("a3-macros-open");
await p.locator('[data-shoot="macro-gate"]').first().click();
await wait(120); await shot("m-gate-1");
await wait(220); await shot("m-gate-2");
await wait(900);
await shot("a4-gate-resolved-settled");
assert((await p.locator('[data-shoot^="gate-wall-"]').count()) === 0, "gate wall released after assume-resolved");
const ghostOp = await p.evaluate(() => {
  const g = document.querySelector('.lf-subject svg path[stroke-dasharray="5 4"]');
  return g ? getComputedStyle(g).opacity : null;
});
assert(ghostOp !== null && parseFloat(ghostOp) > 0.3, "Reality ghost visible during Scenario");

// ── D. Ghost click → Reality comparison ──────────────────────────────────
// Click near the ghost's right tip — its own territory, clear of the body.
const gb = await p.locator('[data-shoot="ghost-hit"]').boundingBox();
await p.locator('[data-shoot="ghost-hit"]').click({ position: { x: gb.width - 12, y: gb.height / 2 }, force: true });
await wait(450);
await shot("b11-reality-tool");
assert((await p.locator('[data-shoot="tool-reality"]').count()) === 1, "ghost summons the Reality comparison");
await p.locator('[data-shoot="tool-close"]').click();
await wait(300);

// ── E. Discard: Scenario collapses back into Reality ─────────────────────
await p.locator('[data-shoot="discard"]').click();
await wait(150); await shot("m-home-1");
await wait(350); await shot("m-home-2");
await wait(900);
await shot("a5-back-to-reality");
const ghostOp2 = await p.evaluate(() => {
  const g = document.querySelector('.lf-subject svg path[stroke-dasharray="5 4"]');
  return g ? getComputedStyle(g).opacity : null;
});
assert(ghostOp2 === null || parseFloat(ghostOp2) < 0.05, "ghost fades out on discard");

// ── F. Object click → Forecast Detail; the five pages ────────────────────
await p.locator('[data-shoot="object-hit"]').click({ force: true });
await wait(450);
assert((await p.locator('[data-shoot="tool-forecast"]').count()) === 1, "object body summons Forecast detail");
await shot("b1-detail-summary");
await p.locator('[data-shoot="detail-mode-drivers"]').click(); await wait(250); await shot("b2-detail-drivers");
await p.locator('[data-shoot="detail-mode-distribution"]').click(); await wait(250); await shot("b3-detail-distribution");
await p.locator('[data-shoot="detail-mode-inputs"]').click(); await wait(250); await shot("b4-detail-inputs");
assert((await p.locator('[data-shoot^="item-toggle-"]').count()) === 0, "INPUTS is read-only (Scope owns inclusion)");
await p.locator('[data-shoot="detail-mode-history"]').click(); await wait(250); await shot("b6-detail-history");
await p.locator('[data-shoot="tool-close"]').click();
await wait(300);

// ── G. Gate tool from the wall; assume resolved from inside it ───────────
await p.locator('[data-shoot^="gate-wall-"]').first().click();
await wait(400);
await shot("b7-gate-tool");
await p.locator('[data-shoot="gate-toggle"]').click();
await wait(600);
await shot("b8-gate-toggled-behind-tool");
await p.locator('[data-shoot="tool-close"]').click();
await wait(200);
await p.locator('[data-shoot="discard"]').click();
await wait(1000);

// ── H. Context tool ───────────────────────────────────────────────────────
await ensureMacros(true);
await p.locator('[data-shoot="open-context"]').click();
await wait(400);
await shot("b10-context-tool");
await p.locator('[data-shoot="tool-close"]').click();
await ensureMacros(false);

// ── I. The other subjects ─────────────────────────────────────────────────
await p.locator('[data-shoot="scope-design"]').click();
await wait(2800);
await shot("c1-design-wide-no-target");
assert((await p.locator('[data-shoot="no-target-entry"]').count()) === 1, "target-less scope offers the quiet evaluate entry");
await p.locator('[data-shoot="no-target-entry"]').click();
await wait(400);
await p.locator('[data-shoot="target-hypothetical"]').click();
await wait(500);
await shot("c2-hypothetical-target");
await p.locator('[data-shoot="target-reset"]').click();
await wait(200);
await p.locator('[data-shoot="tool-close"]').click();
await wait(300);

await p.locator('[data-shoot="scope-itrack"]').click();
await wait(2800);
await shot("c3-itrack-narrow");

await p.locator('[data-shoot="scope-jsa"]').click();
await wait(2800);
await shot("c4-jsa-rest");

console.log(`\nerrors=${errors} assertion-failures=${failures}`);
await b.close();
process.exit(failures > 0 || errors > 0 ? 1 : 0);
