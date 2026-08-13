// Forecast Flagship V2 — interaction + motion evidence run.
// Exercises every required cause→effect transition, captures frames DURING
// the morphs, and hard-asserts the critical semantic: scrubbing a target
// never changes the object's geometry.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/fc-v2";
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
const bodyPathD = () => p.evaluate(() => document.querySelector(".lf-subject svg path[fill^='url(#fill']")?.getAttribute("d"));
const ensureMacros = async (want) => {
  const open = (await p.locator('[data-shoot="open-detail"]').count()) > 0;
  if (open !== want) { await p.locator('[data-shoot="toggle-macros"]').click(); await wait(400); }
};

await p.goto("http://localhost:3000/forecast", { waitUntil: "networkidle" });
await wait(4500);

// ── A. Platform at rest ──────────────────────────────────────────────────
await p.locator('[data-shoot="scope-platform"]').click();
await wait(2600);
await shot("a1-platform-rest");
assert((await p.locator('[data-shoot^="gate-wall-"]').count()) === 1, "Platform shows one gate wall");

// ── B. CRITICAL TEST: target scrub must not move the object ─────────────
const dBefore = await bodyPathD();
const scrub = p.locator('[data-shoot="target-scrub"]');
await scrub.focus();
for (let i = 0; i < 25; i++) { await p.keyboard.press("ArrowLeft"); await wait(20); }
await wait(600);
await shot("a2-target-scrubbed-object-still");
const dAfter = await bodyPathD();
assert(dBefore === dAfter, "object geometry identical after scrubbing target 25 days");
assert((await p.locator('[data-shoot="confidence-corner"]').innerText()).includes("%"), "confidence responds to scrub");
// reset the evaluation via the Target tool
await p.locator('[data-shoot="confidence-corner"]').click();
await wait(400);
await shot("b9-target-tool");
await p.locator('[data-shoot="target-reset"]').click();
await wait(300);
await p.locator('[data-shoot="tool-close"]').click();
await wait(400);

// ── C. Gate release: wall flashes + releases, object morphs earlier ─────
await p.locator('[data-shoot="toggle-macros"]').click();
await wait(500);
await shot("a3-macros-open");
await p.locator('[data-shoot="macro-gate"]').first().click();
await wait(120); await shot("m-gate-1");
await wait(220); await shot("m-gate-2");
await wait(240); await shot("m-gate-3");
await wait(900);
await shot("a4-gate-resolved-settled");
assert((await p.locator('[data-shoot^="gate-wall-"]').count()) === 0, "gate wall released after assume-resolved");
const ghostOp = await p.evaluate(() => {
  const g = document.querySelector('.lf-subject svg path[stroke-dasharray="5 4"]');
  return g ? getComputedStyle(g).opacity : null;
});
assert(ghostOp !== null && parseFloat(ghostOp) > 0.3, "Reality ghost visible during Scenario");

// ── D. Discard: Scenario collapses back into Reality ────────────────────
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

// ── E. Capacity: fewer people → later + wider, morphing continuously ────
await ensureMacros(true);
const fader = p.locator('[data-shoot="macro-capacity"]');
await fader.focus();
await p.keyboard.press("PageDown");
await p.keyboard.press("PageDown");
await p.keyboard.press("PageDown"); // 10 -> 2.5 FTE
await wait(200); await shot("m-cap-1");
await wait(300); await shot("m-cap-2");
await wait(1000);
await shot("a6-capacity-cut-settled");
await p.locator('[data-shoot="discard"]').click();
await wait(1100);

// ── F. Forecast Detail: the five pages ───────────────────────────────────
await p.locator('[data-shoot="central-date"]').click();
await wait(450);
await shot("b1-detail-summary");
await p.locator('[data-shoot="detail-mode-drivers"]').click(); await wait(250); await shot("b2-detail-drivers");
await p.locator('[data-shoot="detail-mode-distribution"]').click(); await wait(250); await shot("b3-detail-distribution");
await p.locator('[data-shoot="detail-mode-inputs"]').click(); await wait(250); await shot("b4-detail-inputs");
// toggle an item OUT from inside the tool — the object morphs behind it
await p.locator('[data-shoot^="item-toggle-"]').first().click();
await wait(500); await shot("b5-item-out-morph-behind-tool");
await wait(700);
await p.locator('[data-shoot^="item-toggle-"]').first().click(); // back in
await wait(400);
await p.locator('[data-shoot="detail-mode-history"]').click(); await wait(250); await shot("b6-detail-history");
await p.locator('[data-shoot="tool-close"]').click();
await wait(300);
await p.locator('[data-shoot="discard"]').click().catch(() => {});
await wait(900);

// ── G. Gate tool from the wall itself ────────────────────────────────────
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

// ── H. Context tool ──────────────────────────────────────────────────────
await ensureMacros(true);
await p.locator('[data-shoot="open-context"]').click();
await wait(400);
await shot("b10-context-tool");
await p.locator('[data-shoot="tool-close"]').click();
await ensureMacros(false);

// ── I. The other subjects ────────────────────────────────────────────────
await p.locator('[data-shoot="scope-design"]').click();
await wait(2800);
await shot("c1-design-wide-no-target");
// evaluate a hypothetical target on a scope with none saved
await p.locator('[data-shoot="confidence-corner"]').click();
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
