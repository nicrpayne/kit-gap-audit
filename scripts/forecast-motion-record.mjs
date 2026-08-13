// Records the full cause→effect sequence as a webm for motion review.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
const out = process.argv[2] ?? "/tmp/fc-video";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({
  viewport: { width: 1680, height: 1050 },
  recordVideo: { dir: out, size: { width: 1680, height: 1050 } },
});
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const p = await ctx.newPage();
const wait = (ms) => p.waitForTimeout(ms);
// Discard is correctly disabled when the scenario is already empty (e.g.
// a capacity fader stepped exactly back onto Reality removes its override).
const ensureMacros = async (want) => {
  const open = (await p.locator('[data-shoot="macro-people"]').count()) > 0;
  if (open !== want) { await p.locator('[data-shoot="toggle-macros"]').click(); await wait(500); }
};
const discardIfActive = async () => {
  const btn = p.locator('[data-shoot="discard"]');
  if (await btn.isEnabled()) { await btn.click(); }
};

await p.goto("http://localhost:3000/forecast", { waitUntil: "networkidle" });
await wait(3500);

// 1. Reality at rest — Platform. Calm.
await p.locator('[data-shoot="scope-platform"]').click();
await wait(3000);

// 2. Target moved — the object does not move; the line sweeps through it.
const scrub = p.locator('[data-shoot="target-scrub"]');
await scrub.focus();
for (let i = 0; i < 30; i++) { await p.keyboard.press("ArrowLeft"); await wait(50); }
await wait(900);
for (let i = 0; i < 30; i++) { await p.keyboard.press("ArrowRight"); await wait(35); }
await wait(1200);

// 3. Constraint assumed resolved — the wall flashes and releases; the object
//    morphs earlier and tightens; Reality stays as the ghost.
await ensureMacros(true);
await wait(400);
await p.locator('[data-shoot="macro-gate"]').first().click();
await wait(2400);

// 4. Back to Reality — the scenario collapses home; ghost dissolves.
await discardIfActive();
await wait(2200);

// 5. The object is the entry point: body → Forecast Detail, pages tour.
await p.locator('[data-shoot="object-hit"]').click({ force: true });
await wait(1000);
await p.locator('[data-shoot="detail-mode-drivers"]').click(); await wait(900);
await p.locator('[data-shoot="detail-mode-distribution"]').click(); await wait(1100);
await p.locator('[data-shoot="detail-mode-inputs"]').click(); await wait(900);
await p.locator('[data-shoot="detail-mode-history"]').click(); await wait(900);
await p.locator('[data-shoot="tool-close"]').click();
await wait(800);

// 6. Resolve the gate again, then click the GHOST → Reality comparison.
await ensureMacros(true);
await p.locator('[data-shoot="macro-gate"]').first().click();
await wait(2000);
const gb = await p.locator('[data-shoot="ghost-hit"]').boundingBox();
if (gb) {
  await p.locator('[data-shoot="ghost-hit"]').click({ position: { x: gb.width - 12, y: gb.height / 2 }, force: true });
  await wait(1600);
  await p.locator('[data-shoot="tool-close"]').click();
}
await wait(500);
await discardIfActive();
await wait(2000);

// 7. Gate tool from the wall; assume resolved from inside it.
await p.locator('[data-shoot^="gate-wall-"]').first().click();
await wait(1100);
await p.locator('[data-shoot="gate-toggle"]').click();
await wait(2000);
await p.locator('[data-shoot="tool-close"]').click();
await wait(500);
await discardIfActive();
await wait(1800);

// 8. Subject switch: Design (wide, no target) then iTrack (tight).
await p.locator('[data-shoot="scope-design"]').click();
await wait(2600);
await p.locator('[data-shoot="scope-itrack"]').click();
await wait(2600);
await p.locator('[data-shoot="scope-jsa"]').click();
await wait(3000);

await ctx.close();
await b.close();
console.log("recorded");
