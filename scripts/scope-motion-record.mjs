// Motion evidence for the Scope instrument. Not part of the app build.
//
// Records the one motion that carries the whole idea: a slab is pulled out of
// the column, and the column SETTLES -- everything below rises by exactly the
// days that item was costing, and the landing date rises with it. Then the
// same gesture on a dominated scope, where the column settles and the date
// does not move at all.
//
//   node scripts/scope-motion-record.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/scope-motion";
mkdirSync(out, { recursive: true });
const frames = `${out}/frames`;
mkdirSync(frames, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({
  viewport: { width: 1320, height: 900 },
  recordVideo: { dir: out, size: { width: 1320, height: 900 } },
});
const p = await ctx.newPage();

async function open(scope) {
  await p.goto("http://localhost:3000/scope", { waitUntil: "networkidle" });
  await p.waitForTimeout(3800);
  await p.locator(`text="${scope}"`).first().click();
  await p.waitForTimeout(1600);
}

// Frame-by-frame through the settle, so the motion can be read without video.
async function pullAndSample(label) {
  const slab = p.locator('[data-shoot="stratum"]').nth(0);
  const box = await slab.boundingBox();
  const y = box.y + box.height / 2;
  await p.mouse.move(box.x + box.width / 2, y);
  await p.mouse.down();
  for (const dx of [40, 90, 140, 180]) {
    await p.mouse.move(box.x + box.width / 2 + dx, y, { steps: 3 });
    await p.waitForTimeout(50);
  }
  await p.screenshot({ path: `${frames}/${label}-0-pulled.png` });
  await p.mouse.up();
  // The settle runs 300ms; sample across it.
  for (const [i, ms] of [60, 90, 90, 160].entries()) {
    await p.waitForTimeout(ms);
    await p.screenshot({ path: `${frames}/${label}-${i + 1}-settle.png` });
  }
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${frames}/${label}-5-settled.png` });
}

await open("Design");
await p.screenshot({ path: `${frames}/design-reality.png` });
await pullAndSample("design");

await p.locator('[data-shoot="discard"]').click();
await p.waitForTimeout(1600);
await p.locator('text="iTrack"').first().click();
await p.waitForTimeout(1600);
await pullAndSample("itrack");

await p.waitForTimeout(600);
await ctx.close();
await b.close();
console.log("video + frames in", out);
