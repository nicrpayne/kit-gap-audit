// THE NINE STATES OF PROGRESSIVE DISCLOSURE.
//
// The claim of this pass is that the first glance is deceptively simple and
// every depth is one move away. These nine frames are the evidence, in the
// order a person meets them: the quiet default, then what happens when you
// press play, then what happens when you ask for more.
//
//   node scripts/timeline-disclosure-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/timeline-disclosure-shoot";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1680, height: 1050 };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: VIEWPORT });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log(`shot ${n}`); };
const settle = (ms = 900) => p.waitForTimeout(ms);
const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2600);
};

await open();
const proj = await (await fetch(`${BASE}/api/timeline`)).json();

// ── 1. the default. Story layers, playhead at NOW. ─────────────────
await shot("01-default-story-at-now");

// ── 2. the default, looking at the past ────────────────────────────
// Same quiet surface, scrubbed back — history is crossed and lit, and the
// screen still carries no key to translate.
await p.locator('[data-shoot="to-beginning"]').click();
await settle(1000);
await p.locator('[data-shoot="play"]').click();
await settle(9000);
await p.locator('[data-shoot="play"]').click(); // pause mid-history
await settle(1400);
await shot("02-default-historical");

// ── 3. playback articulation — the explanation, in motion ──────────
await p.locator('[data-shoot="play"]').click();
for (let i = 0; i < 240; i++) {
  await p.waitForTimeout(90);
  if ((await p.locator('[data-shoot^="event-module-"]').count()) >= 2) break;
}
await shot("03-playback-articulation");
// let it run out so nothing is left mid-flight
for (let i = 0; i < 200; i++) {
  await p.waitForTimeout(300);
  if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 6) break;
}
await settle(1600);

// ── 6. an overdue plan, unmistakable without a legend ──────────────
// Captured before the layer states change, since overdue is a Story-layer
// landmark and must read on the default surface.
const overdue = proj.entries.find((e) => e.detail?.overdue === true);
if (overdue) {
  const box = await p.locator(`[data-shoot="event-${overdue.id}"]`).boundingBox();
  if (box) {
    await p.mouse.move(box.x + box.width / 2 - 70, box.y + box.height / 2 - 70);
    await settle(150);
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await settle(800);
  }
}
await shot("06-overdue-planned-event");
// Park the pointer in dead space so the next frames carry no stray hover.
await p.mouse.move(VIEWPORT.width - 6, VIEWPORT.height - 6);
await settle(600);

// ── 7. a Report selected — the full record is still one click deep ──
const rep = proj.entries.find((e) => e.kind === "report");
await p.locator(`[data-shoot="event-${rep.id}"]`).dispatchEvent("click");
await settle(1100);
await shot("07-report-selected-inspector");

// ── 8. the clean four-lane surface, nothing selected ───────────────
await open();
await shot("08-clean-four-lane");

// ── 4. one extra layer, deliberately asked for ─────────────────────
// Panel open, because this frame is also the record of the control: seven
// checkboxes and two presets, each with its own line of plain English.
await p.locator('[data-shoot="layers-toggle"]').click();
await settle(600);
await p.locator('[data-shoot="layer-context"]').click();
await settle(900);
await shot("04-one-extra-layer");

// ── 5. show everything ─────────────────────────────────────────────
// Panel dismissed for this one — the claim is about what the SCORE gains,
// so the score has to be visible to make it.
await p.locator('[data-shoot="layers-everything"]').click();
await settle(900);
await p.keyboard.press("Escape");
await settle(900);
await shot("05-show-everything");
await p.locator('[data-shoot="layers-toggle"]').click();
await settle(500);
await p.locator('[data-shoot="layers-story"]').click();
await settle(700);
await p.keyboard.press("Escape");
await settle(500);

// ── 9. eight lanes, same quiet default ─────────────────────────────
// Real Scopes, created and removed here, so the density is real load and
// not a mock. The point of the frame is that the DEFAULT stays legible
// when the project count doubles.
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient();
const extra = [];
try {
  for (let i = proj.lanes.length; i < 8; i++) {
    const name = `Stress ${i + 1}`;
    const existing = await db.scope.findFirst({ where: { name } });
    const row = existing ?? (await db.scope.create({ data: { name, teamKey: "SOF" } }));
    if (!existing) extra.push(row.id);
  }
  await open();
  await shot("09-clean-eight-lane");
} finally {
  for (const id of extra) await db.scope.delete({ where: { id } }).catch(() => {});
  await db.$disconnect();
}

await ctx.close();
await b.close();
console.log(`\n9 frames in ${out}`);
