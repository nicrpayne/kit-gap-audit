// THE FUTURE PLAN CANVAS, IN TEN STATES.
//
// The order is the order a person meets it: the canvas at LIVE NOW, then
// composing something onto it, then arranging what is there, then the two
// densities it has to survive.
//
//   node scripts/timeline-plan-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/timeline-plan-shoot";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1680, height: 1050 };
const DAY = 86400000;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: VIEWPORT })).newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log(`shot ${n}`); };
const settle = (ms = 900) => p.waitForTimeout(ms);
const proj = async () => (await fetch(`${BASE}/api/timeline`)).json();
const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2700);
};
const park = async () => { await p.mouse.move(VIEWPORT.width - 6, VIEWPORT.height - 6); await settle(500); };

await open();
const j = await proj();
const laneOf = (n) => j.lanes.find((l) => l.name === n) ?? j.lanes[0];

// ── 1. the canvas at LIVE NOW ──────────────────────────────────────
// Left of NOW the story; right of NOW named objects you can arrange;
// floating through both, the forecast the model computed.
await shot("01-live-now-plan-canvas");

// ── 2. composing a span ────────────────────────────────────────────
// The tool asks for SHAPE first, because a moment and an activity are
// different objects on the score.
await p.locator('[data-shoot="add-event"]').click();
await settle(600);
await p.locator('[data-shoot="event-title"]').fill("Launch comms");
await p.locator('[data-shoot="event-shape-span"]').click();
await settle(400);
const d0 = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
const d1 = new Date(Date.now() + 52 * DAY).toISOString().slice(0, 10);
await p.locator('[data-shoot="event-date"]').fill(d0);
await p.locator('[data-shoot="event-end"]').fill(d1);
await settle(500);
await shot("02-composing-a-span");
await p.locator('[data-shoot="event-save"]').click();
await settle(1800);

// ── 3. two overlapping plans, on their own subtracks ───────────────
const jsa = laneOf("JSA");
await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
await settle(900);
await park();
await shot("03-overlapping-plans-subtracks");

// ── 7. the opened lane, at plan depth ──────────────────────────────
// Same state, framed as the answer to "show me this project's plan".
await shot("07-expanded-lane-plan-depth");
await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
await settle(700);

// ── 4. a planned point milestone ───────────────────────────────────
const now = await proj();
const pin = now.entries.find((e) => e.family === "landmark" && e.temporalState === "planned" && !e.endDate);
{
  const box = await p.locator(`[data-shoot="plan-${pin.id}"]`).boundingBox();
  await p.mouse.move(box.x + 3, box.y + box.height / 2);
  await settle(700);
  await shot("04-planned-point-milestone");
}

// ── 5. an object mid-drag ──────────────────────────────────────────
const mk = now.entries.find((e) => e.title === "Marketing plan");
const original = { date: mk.date, endDate: mk.endDate };
{
  const box = await p.locator(`[data-shoot="plan-${mk.id}"]`).boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await p.mouse.move(cx, cy);
  await settle(200);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(cx + i * 7, cy); await p.waitForTimeout(40); }
  await settle(500);
  await shot("05-object-being-dragged");
  await p.mouse.up();
  await settle(1700);
  await park();
  await shot("06-object-after-move");
}

// ── 9. forecast, plan and target in one frame ──────────────────────
// The three kinds of time the canvas holds, side by side: a soft computed
// capsule, a solid named plan block, and an amber target flag.
{
  const plat = laneOf("Platform");
  await p.locator(`[data-shoot="lane-expand-${plat.scopeId}"]`).click();
  await settle(900);
  await park();
  await shot("09-forecast-plan-and-target");
  await p.locator(`[data-shoot="lane-expand-${plat.scopeId}"]`).click();
  await settle(600);
}

// put Marketing plan back where the seed left it
await fetch(`${BASE}/api/timeline-events/${mk.id}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(original),
});
// and remove the one this shoot composed
{
  const after = await proj();
  const made = after.entries.find((e) => e.title === "Launch comms");
  if (made) await fetch(`${BASE}/api/timeline-events/${made.id}`, { method: "DELETE" });
}

// ── 8. eight lanes, still compact ──────────────────────────────────
// Real extra Scopes, created and removed here, so the density is real load.
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();
const extra = [];
try {
  for (let i = j.lanes.length; i < 8; i++) {
    const name = `Stress ${i + 1}`;
    const existing = await db.scope.findFirst({ where: { name } });
    const row = existing ?? (await db.scope.create({ data: { name, teamKey: "SOF" } }));
    if (!existing) extra.push(row.id);
  }
  await open();
  await shot("08-eight-lanes-compact");
  // …and one of them opened, which is where expanding earns its keep.
  await p.locator(`[data-shoot="lane-expand-${jsa.scopeId}"]`).click();
  await settle(900);
  await park();
  await shot("08b-eight-lanes-one-opened");
} finally {
  for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
  await db.$disconnect();
}

await b.close();
console.log(`\nframes in ${out}`);
