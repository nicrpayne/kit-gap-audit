// The fader's ten states, one viewport, plus the uncut A–G interaction
// recording. Everything is driven with a real pointer — the point of the
// video is the drag behaviour, so nothing here may be cut around it.
//
//   node scripts/fader-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/fader-shoot";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const VIEWPORT = { width: 1680, height: 1050 };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: out, size: VIEWPORT },
});
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

// A visible pointer: Playwright's mouse leaves no cursor in the recording,
// and a drag film with no hand in it proves nothing.
await p.addInitScript(() => {
  window.addEventListener("DOMContentLoaded", () => {
    const d = document.createElement("div");
    d.id = "__cursor";
    Object.assign(d.style, {
      position: "fixed", width: "16px", height: "16px", borderRadius: "50%",
      border: "2px solid #ffffff", background: "rgba(255,255,255,0.28)",
      boxShadow: "0 0 10px rgba(0,0,0,0.9)", pointerEvents: "none",
      zIndex: "2147483647", transform: "translate(-50%,-50%)", left: "-100px", top: "-100px",
    });
    document.body.appendChild(d);
    addEventListener("pointermove", (e) => { d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px"; }, true);
    addEventListener("pointerdown", () => { d.style.background = "rgba(155,140,250,0.85)"; d.style.transform = "translate(-50%,-50%) scale(1.25)"; }, true);
    addEventListener("pointerup", () => { d.style.background = "rgba(255,255,255,0.28)"; d.style.transform = "translate(-50%,-50%)"; }, true);
  });
});

await p.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="fader-platform"]', { timeout: 30000 });
await p.waitForTimeout(3000);

const F = p.locator('[data-shoot="fader-platform"]');
const value = async () => Number(await F.getAttribute("aria-valuenow"));
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });

const clamp = (box, y) => Math.min(box.y + box.height - 1, Math.max(box.y + 1, y));
const yFor = (box, v, max) => box.y + box.height * (1 - v / max);

// Slow enough to read on film, still one continuous gesture.
async function dragTo(target, { alt = false, steps = 26, hold = 900 } = {}) {
  const box = await F.boundingBox();
  const max = Number(await F.getAttribute("aria-valuemax"));
  const from = clamp(box, yFor(box, Math.min(await value(), max), max));
  const to = clamp(box, yFor(box, target, max));
  const x = box.x + box.width / 2;
  await p.mouse.move(x, from);
  await p.waitForTimeout(240);
  if (alt) await p.keyboard.down("Alt");
  await p.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await p.mouse.move(x, from + ((to - from) * i) / steps);
    await p.waitForTimeout(16);
  }
  await p.mouse.up();
  if (alt) await p.keyboard.up("Alt");
  await p.waitForTimeout(hold);
}

// ── A. Platform starts at 3 FTE ────────────────────────────────────────
await dragTo(3, { hold: 1600 });
await shot("04-platform-3");

// ── B. 3 → 2 → 1 → 0, one stop at a time ───────────────────────────────
await dragTo(2); await shot("03-platform-2");
await dragTo(1); await shot("02-platform-1");
await dragTo(0); await shot("01-platform-0");
await p.waitForTimeout(1400);
// The rail at rest. Empty is the only state this roster is balanced in --
// almost the whole workforce is already committed to JSA and Design.
await shot("09-rail-balanced");

// ── C. back up 0 → 1 → 2 → 3 ───────────────────────────────────────────
await dragTo(1); await dragTo(2); await dragTo(3);
await p.waitForTimeout(1200);

// ── D. 3 → 4 → 5 → 6 while the workforce is insufficient ───────────────
await dragTo(4); await shot("05-platform-4-shortfall");
await dragTo(5); await shot("06-platform-5-shortfall");
await dragTo(6); await p.waitForTimeout(1600);
await shot("07-platform-6-shortfall");
await shot("10-rail-shortfall");

// ── E. precision: 6 → 5.5 → 5 ──────────────────────────────────────────
await dragTo(5.5, { alt: true, hold: 1400 });
await dragTo(3.5, { alt: true, hold: 1600 });
await shot("08-platform-3p5-precision");
await dragTo(5, { alt: true, hold: 1400 });

// ── F. free capacity elsewhere; the request settles, Platform holds ────
await dragTo(4, { hold: 1200 });
{
  const J = p.locator('[data-shoot="fader-jsa"]');
  const box = await J.boundingBox();
  const max = Number(await J.getAttribute("aria-valuemax"));
  const from = clamp(box, yFor(box, Number(await J.getAttribute("aria-valuenow")), max));
  const x = box.x + box.width / 2;
  await p.mouse.move(x, from);
  await p.waitForTimeout(300);
  await p.mouse.down();
  for (let i = 1; i <= 26; i++) {
    await p.mouse.move(x, clamp(box, from + i * 3));
    await p.waitForTimeout(16);
  }
  await p.mouse.up();
}
await p.waitForTimeout(2400);

// ── G. Discard — Reality restores exactly ──────────────────────────────
await p.locator('[data-shoot="discard"]').hover();
await p.waitForTimeout(500);
await p.locator('[data-shoot="discard"]').click();
await p.waitForTimeout(3200);

await ctx.close();
await b.close();
console.log(`shots + video → ${out}`);
