// THE CONTROL ROOM V4, PHOTOGRAPHED.
//
// One frame per workspace, plus the Scenario mode, all reached by driving
// the real product. The Command frame is the one to hold beside the
// approved Master Control Room layout.
//
//   node scripts/control-room-v4-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "/tmp/control-room-v4";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const settle = (ms = 800) => p.waitForTimeout(ms);
const park = async () => {
  await p.mouse.move(1530, 1020);
  await settle(300);
};
const shot = async (name) => {
  await park();
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  shot", name);
};
const openCR = async () => {
  await p.goto(`${BASE}/control-room`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="cr-reading"]', { timeout: 30000 });
  await settle(3400);
};
const pick = async (lens) => {
  await p.click('[data-shoot="cr-views"]');
  await settle(350);
  await p.click(`[data-shoot="cr-lens-pick-${lens}"]`);
  await settle(1600);
};

// A clean workspace, so the shoot never photographs somebody's leftovers.
await p.goto(`${BASE}/control-room`, { waitUntil: "networkidle" });
await p.evaluate(() => localStorage.removeItem("kit.control-room.lens.v3"));
await openCR();

await shot("1-command");

for (const lens of ["delivery", "capacity", "dependency", "decision"]) {
  await pick(lens);
  await shot(`${["delivery", "capacity", "dependency", "decision"].indexOf(lens) + 2}-${lens}`);
}

// ── SCENARIO ───────────────────────────────────────────────────────────
// The hypothetical is made in the instrument that owns the lever, then the
// Control Room is walked back to — it can set nothing itself.
await pick("command");
await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
await settle(1400);
{
  const scopes = await p
    .locator('[data-shoot^="orbit-focus-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-shoot").replace("orbit-focus-", "")));
  let assumed = false;
  for (const s of scopes) {
    await p.click(`[data-shoot="orbit-focus-${s}"]`);
    await settle(700);
    const gate = p.locator('[data-orbit-kind="gate"]').first();
    if ((await gate.count()) === 0) continue;
    const id = await gate.getAttribute("data-orbit-node");
    await gate.click();
    await settle(600);
    await p.click(`[data-shoot="orbit-assume-${id}"]`);
    await settle(1600);
    assumed = true;
    break;
  }
  if (assumed) {
    await p.click('a[href="/control-room"]');
    await p.waitForURL("**/control-room", { timeout: 15000 });
    await p.waitForSelector('[data-shoot="cr-reading"]');
    await settle(3400);
    await shot("6-scenario");
    await p.click('[data-shoot="cr-discard"]');
    await settle(1600);
  } else {
    console.log("  ! no gate to release in Orbit");
  }
}

// The lens editor, which is the customization system the workspace rests on.
await openCR();
await p.click('[data-shoot="cr-lens-editor-open"]');
await p.waitForSelector('[data-shoot="cr-lens-editor"]', { timeout: 15000 });
await settle(700);
await shot("7-customize");
await p.click('[data-shoot="cr-lens-editor-close"]');
await settle(500);

// Leave the browser as it was found.
await p.evaluate(() => localStorage.removeItem("kit.control-room.lens.v3"));

console.log(`\nFrames in ${OUT}`);
await b.close();
