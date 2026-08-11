// Design-loop screenshot harness. Not part of the app build.
//   node scripts/shoot.mjs <outDir> [label]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const outDir = process.argv[2] ?? "/tmp/shots";
const label = process.argv[3] ?? "shot";
const BASE = "http://localhost:3000";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });

// Hide the Next dev-mode indicator; it isn't part of the design.
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal,#__next-build-watcher{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text()); });

const settle = (ms = 1500) => page.waitForTimeout(ms);
const shot = async (n) => { await page.screenshot({ path: `${outDir}/${label}-${n}.png` }); console.log("shot", n); };

await page.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
await settle(5000);

// 1. Reality
await shot("1-reality");

// 2. Scenario: raise Platform capacity with the keyboard (proves the fader
//    is a real ARIA slider, not a mouse-only affordance)
const cap = page.locator('[data-shoot="capacity-fader"]').first();
await cap.focus();
for (let i = 0; i < 4; i++) { await page.keyboard.press("ArrowUp"); await page.waitForTimeout(80); }
await settle(2400);
await shot("2-scenario-plus-fte");

// 3. Inspect JSA -- the scope that is behind, to show momentum falling and
//    the hatched miss-tail against a real target
const rows = page.locator('[role="button"][aria-pressed]');
await rows.nth(1).click();
await settle(1800);
await shot("3-momentum-jsa");

// 4. Presentation mode: rail hidden, inspector collapsed
await page.keyboard.press("Meta+\\");
await page.locator('button[aria-label="Collapse inspector"]').click();
await settle(1400);
await shot("4-presentation");

// 5. Command menu
await page.keyboard.press("Meta+k");
await settle(900);
await shot("5-command");

await browser.close();
