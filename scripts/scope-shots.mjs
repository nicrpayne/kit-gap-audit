// Design-loop screenshot harness for the Scope instrument. Not part of the
// app build.  node scripts/scope-shots.mjs <outDir>
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/scope";
const BASE = "http://localhost:3000";
mkdirSync(out, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal,#__next-build-watcher{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
p.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200));
});

const settle = (ms = 1400) => p.waitForTimeout(ms);
const shot = async (n) => {
  await p.screenshot({ path: `${out}/${n}.png` });
  console.log("shot", n);
};

// Pulls a slab out of the column with a real pointer drag, the way a person
// would -- proving the gesture, not just the state change behind it.
async function pullOut(index) {
  const slab = p.locator('[data-shoot="stratum"]').nth(index);
  const box = await slab.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  for (const dx of [30, 70, 110, 150]) {
    await p.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 4 });
    await p.waitForTimeout(40);
  }
  await p.mouse.up();
}

const goScope = async (name) => {
  await p.goto(`${BASE}/scope`, { waitUntil: "networkidle" });
  await settle(3800);
  if (name) {
    await p.locator(`text="${name}"`).first().click();
    await settle(1600);
  }
};

// 1. REALITY. The calm default canvas.
await goScope();
await shot("1-reality");

// 2. Depth on demand: one piece of work, and the estimate control.
await p.locator('[data-shoot="stratum"]').first().click();
await settle(700);
await shot("2-selection");
await p.locator('text="Open detail"').click();
await settle(900);
await shot("3-work-detail");
await p.keyboard.press("Escape");
await settle(500);

// 4. THE CUT THAT HELPS -- Design, where capacity is small so one item is
//    worth many days of schedule.
await goScope("Design");
await shot("4-design-reality");
await pullOut(0);
await settle(1600);
await shot("5-design-cut");
await p.locator('[data-shoot="toggle-macros"]').click();
await settle(900);
await shot("6-design-macros");
await p.locator('[data-shoot="open-compare"]').click();
await settle(900);
await shot("7-compare-helped");
await p.keyboard.press("Escape");
await settle(400);

// 8. THE CUT THAT DOES NOT HELP -- iTrack, dominated by Platform.
await p.locator('[data-shoot="discard"]').click();
await settle(1400);
await goScope("iTrack");
await shot("8-itrack-reality");
await pullOut(0);
await settle(900);
await pullOut(0);
await settle(1700);
await shot("9-itrack-dominated");
await p.locator('[data-shoot="toggle-macros"]').click();
await settle(600);
await p.locator('[data-shoot="open-compare"]').click();
await settle(900);
await shot("10-compare-dominated");
await p.keyboard.press("Escape");
await settle(400);

// 11. The release-boundary prototype, clearly fenced off.
await p.locator('[data-shoot="open-boundary"]').click();
await settle(900);
await shot("11-boundary-prototype");
await p.keyboard.press("Escape");
await settle(400);

await b.close();
