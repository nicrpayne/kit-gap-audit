// V2.2 motion review: the full cross-instrument story on video.
// "I change something in the instrument that owns it → Forecast responds."
// All committed values are reverted before the recording ends.
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
const discardIfActive = async () => {
  const btn = p.locator('[data-shoot="discard"]');
  if (await btn.isEnabled()) { await btn.click(); }
};
const gotoForecast = async (scope) => {
  await p.goto("http://localhost:3000/forecast", { waitUntil: "networkidle" });
  await wait(3000);
  await p.locator(`[data-shoot="scope-${scope}"]`).click();
  await wait(2400);
};
const gotoPortfolio = async (name) => {
  await p.goto("http://localhost:3000/portfolio", { waitUntil: "networkidle" });
  await wait(3600);
  await p.locator('[role="button"][aria-pressed]').filter({ hasText: name }).first().click();
  await wait(1200);
};
const commit = async () => { await p.locator('button:has-text("Commit changes")').click(); await wait(2800); };
const setCapacityTyped = async (v) => {
  await p.locator('[data-shoot="capacity-fader-value"]').click();
  await p.keyboard.press("ControlOrMeta+a");
  await p.keyboard.type(String(v));
  await p.keyboard.press("Enter");
  await wait(1200);
};

// 1. Reality at rest — Platform. Calm.
await gotoForecast("platform");
await wait(2200);

// 2. Target moved through the unchanged body.
const scrub = p.locator('[data-shoot="target-scrub"]');
await scrub.focus();
for (let i = 0; i < 28; i++) { await p.keyboard.press("ArrowLeft"); await wait(45); }
await wait(700);
for (let i = 0; i < 28; i++) { await p.keyboard.press("ArrowRight"); await wait(30); }
await wait(1000);

// 3. Portfolio owns capacity: double Platform's FTE and COMMIT.
await gotoPortfolio("PLATFORM");
await setCapacityTyped(16);
await wait(800);
await commit();

// 4. Forecast consumed it — but the serial gate limits the gain.
await gotoForecast("platform");
await wait(2200);

// 5. Assume the decision made — the wall releases; NOW it moves.
await p.locator('[data-shoot="toggle-macros"]').click();
await wait(600);
await p.locator('[data-shoot="macro-gate"]').first().click();
await wait(2600);

// 6. Click the ghost → Reality comparison.
const gb = await p.locator('[data-shoot="ghost-hit"]').boundingBox();
if (gb) {
  await p.locator('[data-shoot="ghost-hit"]').click({ position: { x: gb.width - 12, y: gb.height / 2 }, force: true });
  await wait(2200);
  await p.locator('[data-shoot="tool-close"]').click();
}
await wait(600);

// 7. Discard — home.
await discardIfActive();
await wait(2000);

// 8. The object is the door: body → Forecast Detail, two pages.
await p.locator('[data-shoot="object-hit"]').click({ force: true });
await wait(1400);
await p.locator('[data-shoot="detail-mode-distribution"]').click();
await wait(1600);
await p.locator('[data-shoot="tool-close"]').click();
await wait(700);

// 9. Portfolio: revert capacity, COMMIT.
await gotoPortfolio("PLATFORM");
await setCapacityTyped(8);
await commit();

// 10. Context switch is Portfolio's too: 12% → 62%, COMMIT; JSA responds.
const knob = p.locator('[data-shoot="switch-knob"]');
await knob.focus();
await p.keyboard.press("PageUp");
await p.keyboard.press("PageUp");
await wait(900);
await commit();
await gotoForecast("jsa");
await wait(2600);

// 11. Revert the switch; JSA comes home.
await gotoPortfolio("PLATFORM");
await knob.focus();
await p.keyboard.press("Home");
for (let i = 0; i < 12; i++) await p.keyboard.press("Shift+ArrowUp");
await wait(700);
await commit();

// 12. Rest.
await gotoForecast("jsa");
await wait(3000);

await ctx.close();
await b.close();
console.log("recorded");
