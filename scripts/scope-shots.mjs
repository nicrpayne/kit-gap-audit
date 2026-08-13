// The nine scenarios Scope V3 has to answer for. Not part of the app build.
//   node scripts/scope-shots.mjs <outDir>
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/scope";
const BASE = "http://localhost:3000";
mkdirSync(out, { recursive: true });

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1560, height: 980 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
p.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 180));
});

const settle = (ms = 1300) => p.waitForTimeout(ms);
const shot = async (n) => {
  await p.screenshot({ path: `${out}/${n}.png` });
  console.log("shot", n);
};
const go = async (key) => {
  await p.goto(`${BASE}/scope`, { waitUntil: "networkidle" });
  await settle(4000);
  await p.locator(`[data-shoot="scope-${key}"]`).click();
  await settle(1700);
};
const mode = async (m) => {
  await p.locator(`[data-shoot="mode-${m}"]`).click();
  await settle(600);
};
/** Back to Reality, but only if there is a hypothetical to discard. */
const reset = async () => {
  const d = p.locator('[data-shoot="discard"]');
  if (await d.isEnabled()) {
    await d.click();
    await settle(1400);
  }
};

/** A real pointer drag from a tile to a bay, at human speed. */
async function dragTo(tile, target) {
  const a = await tile.boundingBox();
  const t = await target.boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 8 });
  await p.mouse.down();
  await p.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 6, { steps: 4 });
  await p.mouse.move(t.x + t.width * 0.4, t.y + t.height / 2, { steps: 24 });
  await settle(380);
  await p.mouse.up();
  await settle(1500);
}

// 1 · Reality at rest.
await go("jsa");
await shot("1-reality-at-rest");

// 3 · A capability taken out, the release recomposed. (2 = the drag itself,
//     which lives in scripts/scope-drag-record.mjs as frames + video.)
await dragTo(p.locator('[data-shoot="bay-in"] [data-shoot="capability"]').first(), p.locator('[data-shoot="bay-out"]'));
await shot("3-taken-out-recomposed");

// 4 · A Hermes candidate, unseated, waiting outside accepted Reality.
await reset();
const candidate = p.locator('[data-shoot="capability"][data-material="spectral"]').first();
await candidate.hover();
await settle(700);
await shot("4-candidate-unseated");

// 5 · Working with the candidate: its evidence, and seating it.
await candidate.click();
await settle(800);
await mode("evidence");
await shot("5a-candidate-evidence");
await p.locator('[data-shoot="accept-candidate"]').click();
await settle(900);
await p.keyboard.press("Escape");
await settle(1400);
await shot("5b-candidate-seated");
await reset();

// 6 · Unmapped work, and building a capability out of it.
const raw = p.locator('[data-shoot="capability"][data-material="raw"]').first();
await raw.click();
await settle(800);
await shot("6a-unmapped-work");
await p.keyboard.press("Escape");
await settle(600);
await p.locator('[data-shoot="add-feature"]').click();
await settle(700);
await p.locator("#feature-name").fill("Crew Directory");
await p.locator("#feature-intent").fill("Supervisors need an accurate crew list before a JSA can be signed off.");
const claim = p.locator('[data-shoot="claim-item"]');
if ((await claim.count()) > 0) await claim.first().click();
await settle(400);
await shot("6b-add-capability");
await p.locator('[data-shoot="create-feature"]').click();
await settle(1200);
await p.keyboard.press("Escape");
await settle(1400);
await shot("6c-capability-created");

// 9 · The detail tool, V2 information architecture intact.
await reset();
await p.locator('[data-shoot="bay-in"] [data-shoot="capability"]').first().click();
await settle(800);
await shot("9a-detail-overview");
await mode("work");
await shot("9b-detail-work");
await mode("estimate");
await p.locator('[data-shoot="tune-estimate"]').first().click();
await settle(700);
await shot("9c-detail-estimate");
await mode("history");
await shot("9d-detail-history");
await p.keyboard.press("Escape");
await settle(600);

// 7 · A cut that materially moves the forecast (Design: 0.35 FTE, so one
//     capability is worth many days), carried through to Forecast itself.
await reset();
await go("design");
await shot("7a-design-reality");
await dragTo(p.locator('[data-shoot="bay-in"] [data-shoot="capability"]').first(), p.locator('[data-shoot="bay-out"]'));
await shot("7b-design-cut-moves-date");
await p.locator('[data-shoot="open-forecast"]').click();
await p.waitForURL("**/forecast");
await settle(4000);
await shot("7c-forecast-consequence");

// 8 · A large cut that does NOT move the date, because Platform dominates.
await reset();
await go("itrack");
await shot("8a-itrack-reality");
for (let i = 0; i < 3; i++) {
  const t = p.locator('[data-shoot="bay-in"] [data-shoot="capability"]').first();
  if ((await t.count()) === 0) break;
  await dragTo(t, p.locator('[data-shoot="bay-out"]'));
}
await shot("8b-itrack-dominated");

await b.close();
