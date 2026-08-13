// DRAG ACCEPTANCE EVIDENCE for the Scope tray. Not part of the app build.
//
// Stills cannot show whether a drag feels right, so this records video AND
// samples each motion state as its own frame, driving the real UI with a real
// pointer at human speed:
//
//   rest -> hover -> pickup -> carry -> armed over the shelf -> drop ->
//   settle -> recomposed;  and separately, pickup -> carry -> CANCEL -> home.
//
//   node scripts/scope-drag-record.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/scope-drag";
const frames = `${out}/frames`;
mkdirSync(frames, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({
  viewport: { width: 1500, height: 940 },
  recordVideo: { dir: out, size: { width: 1500, height: 940 } },
});
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const shot = async (n) => {
  await p.screenshot({ path: `${frames}/${n}.png` });
  console.log("frame", n);
};

await p.goto("http://localhost:3000/scope", { waitUntil: "networkidle" });
await p.waitForTimeout(4200);
await p.locator('[data-shoot="scope-jsa"]').click();
await p.waitForTimeout(1800);

const tile = p.locator('[data-shoot="capability"]').first();
const shelf = p.locator('[data-shoot="bay-out"]');

// ── STATE 1: rest ───────────────────────────────────────────────────────
await shot("01-rest");

// ── STATE 2: hover — the object answers the pointer before any press ────
let box = await tile.boundingBox();
const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
await p.mouse.move(from.x, from.y, { steps: 12 });
await p.waitForTimeout(450);
await shot("02-hover");

// ── STATE 3: pickup — lift, cast shadow, the tray keeps the footprint ──
await p.mouse.down();
await p.mouse.move(from.x + 9, from.y + 4, { steps: 4 }); // clear the 6px threshold
await p.waitForTimeout(320);
await shot("03-pickup");

// ── STATE 4: carry ──────────────────────────────────────────────────────
const shelfBox = await shelf.boundingBox();
const to = { x: shelfBox.x + shelfBox.width * 0.35, y: shelfBox.y + shelfBox.height / 2 };
const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 40 };
await p.mouse.move(mid.x, mid.y, { steps: 22 });
await p.waitForTimeout(260);
await shot("04-carry");

// ── STATE 5: armed — the exclusion boundary becomes intentional ────────
await p.mouse.move(to.x, to.y, { steps: 20 });
await p.waitForTimeout(420);
await shot("05-armed-over-shelf");

// ── STATE 6/7: drop, then settle ───────────────────────────────────────
await p.mouse.up();
await p.waitForTimeout(120);
await shot("06-drop");
await p.waitForTimeout(260);
await shot("07-settling");
await p.waitForTimeout(1500);
await shot("08-recomposed");

// ── CANCEL: picked up, carried, Escape, returns home exactly ───────────
await p.waitForTimeout(600);
const t2 = p.locator('[data-shoot="bay-in"] [data-shoot="capability"]').first();
const b2 = await t2.boundingBox();
await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 10 });
await p.mouse.down();
await p.mouse.move(b2.x + b2.width / 2 + 200, b2.y + b2.height / 2 + 120, { steps: 22 });
await p.waitForTimeout(400);
await shot("09-cancel-carrying");
await p.keyboard.press("Escape");
await p.waitForTimeout(150);
await shot("10-cancel-returning");
await p.mouse.up();
await p.waitForTimeout(1200);
await shot("11-cancel-home");

// ── Put it back by dragging out of the shelf, into the bay ─────────────
await p.waitForTimeout(500);
const parked = p.locator('[data-shoot="bay-out"] [data-shoot="capability"]').first();
if ((await parked.count()) > 0) {
  const pb = await parked.boundingBox();
  const bay = await p.locator('[data-shoot="bay-in"]').boundingBox();
  await p.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2, { steps: 10 });
  await p.mouse.down();
  await p.mouse.move(pb.x + pb.width / 2, pb.y - 60, { steps: 14 });
  await p.waitForTimeout(200);
  await p.mouse.move(bay.x + bay.width * 0.62, bay.y + bay.height * 0.5, { steps: 22 });
  await p.waitForTimeout(400);
  await shot("12-armed-over-bay");
  await p.mouse.up();
  await p.waitForTimeout(1600);
  await shot("13-put-back");
}

await p.waitForTimeout(700);
await ctx.close();
await b.close();
console.log("video + frames in", out);
