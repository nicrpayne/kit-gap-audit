// THE CONTROL ROOM V2, PHOTOGRAPHED.
//
// Four states, in the order a person meets them: the daily surface, the two
// workspaces that narrow it to a job, and the dialog that makes the choice.
//
//   node scripts/control-room-v2-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "/tmp/control-room-v2";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

const settle = (ms = 700) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1674, 1046); await settle(300); };
const shot = async (name) => { await park(); await p.screenshot({ path: `${OUT}/${name}.png` }); console.log("  shot", name); };

await p.goto(`${BASE}/control-room`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="cr-summary"]', { timeout: 30000 });
// Start from the shipped default rather than whatever this browser last chose.
await p.evaluate(() => localStorage.removeItem("kit.control-room.workspace.v2"));
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="cr-summary"]', { timeout: 30000 });
await settle(3500);

await shot("1-default");

await p.click('[data-shoot="cr-workspace-capacity"]');
await settle(1600);
await shot("2-capacity");

await p.click('[data-shoot="cr-workspace-dependencies"]');
await settle(1600);
await shot("3-dependencies");

await p.click('[data-shoot="cr-customize-open"]');
await p.waitForSelector('[data-shoot="cr-customize"]', { timeout: 15000 });
await settle(700);
await shot("4-customize");

// Leave the browser's stored preference as it was found: a screenshot run
// should not silently reconfigure somebody's workspace.
await p.click('[data-shoot="cr-reset-workspace"]');
await settle(600);

console.log(`\nFour states in ${OUT}`);
await b.close();
