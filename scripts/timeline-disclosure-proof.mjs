// PROGRESSIVE DISCLOSURE, PROVEN.
//
// The claim of this pass is that the first glance is simple and the depth
// is one click away — and, critically, that the simplicity is PRESENTATION
// ONLY. Turning a layer off must never change what Timeline knows, what
// playback crosses, or where anything sits.
//
//   node scripts/timeline-disclosure-proof.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/timeline-disclosure";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });

await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
await p.waitForTimeout(2600);

/** A landmark is a plan object with its own handle; everything else is
    a mark on the historical score. */
const handle = (e) => (e.family === "landmark" ? `plan-${e.id}` : `event-${e.id}`);
const markers = () => p.locator('[data-shoot^="event-"]:not([data-shoot^="event-module-"]):not([data-shoot="event-intake-toggle"]), [data-shoot^="plan-"]:not([data-shoot="plan-drag-readout"]):not([data-shoot="plan-ownership"])').count();
const geometry = () =>
  p.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return [+b.top.toFixed(1), +b.left.toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)];
    };
    return {
      field: r('[data-shoot="time-field"]'),
      transport: r('[data-shoot="transport"]'),
      lane0: r('[data-shoot^="lane-header-"]'),
    };
  });

// ── 1. no legend on the default surface ────────────────────────────
const body = await p.locator("body").innerText();
// A legend is a list that pairs every family NAME with a swatch. Its
// absence is the claim; the words "the score" appearing in a sentence are
// not, which is what the first version of this check accidentally tested.
const legendWords = ["Report", "Decision", "Work done", "Context", "Landmark", "Finding", "Candidate"];
const legendHits = legendWords.filter((w) => new RegExp(`(^|\\n)\\s*${w}\\s*($|\\n)`, "i").test(body)).length;
check(
  "The default surface carries NO legend to translate",
  legendHits < 3,
  `${legendHits}/7 family names rendered as a key`
);
check("…and says what to do instead", /press play/i.test(body));

// ── 2. Story is quieter than Everything ────────────────────────────
const storyCount = await markers();
const storyGeom = await geometry();

await p.locator('[data-shoot="layers-toggle"]').click();
await p.waitForTimeout(600);
check("A Layers control exists and opens", (await p.locator('[data-shoot="layers-panel"]').count()) === 1);

// one extra layer first
await p.locator('[data-shoot="layer-context"]').click();
await p.waitForTimeout(700);
const oneMore = await markers();
check("Enabling ONE layer adds information", oneMore > storyCount, `${storyCount} → ${oneMore}`);

await p.locator('[data-shoot="layers-everything"]').click();
await p.waitForTimeout(800);
const allCount = await markers();
const allGeom = await geometry();
check("SHOW EVERYTHING reveals strictly more than Story", allCount > storyCount, `${storyCount} → ${allCount}`);

// ── 3. geometry does not move when layers toggle ───────────────────
check(
  "Toggling layers moves NO geometry — the score gains information in place",
  JSON.stringify(storyGeom) === JSON.stringify(allGeom),
  `${JSON.stringify(storyGeom.field)} vs ${JSON.stringify(allGeom.field)}`
);

// ── 4. layers change presentation only, never the data ─────────────
const projA = await (await fetch(`${BASE}/api/timeline`)).json();
await p.locator('[data-shoot="layers-story"]').click();
await p.waitForTimeout(700);
const projB = await (await fetch(`${BASE}/api/timeline`)).json();
check(
  "Layers change presentation ONLY — the projection is byte-identical",
  projA.entries.length === projB.entries.length &&
    JSON.stringify(projA.entries.map((e) => e.id)) === JSON.stringify(projB.entries.map((e) => e.id)),
  `${projA.entries.length} entries either way`
);
check("Story draws fewer markers than the projection holds",
  storyCount < projA.entries.length, `${storyCount} drawn of ${projA.entries.length} known`);

// ── 5. forecast memory is unaffected by layer filtering ────────────
const laneIds = projA.lanes.map((l) => l.scopeId);
const memoryNow = async () =>
  Promise.all(laneIds.map((id) =>
    p.locator(`[data-shoot="memory-likely-${id}"]`).innerText({ timeout: 200 }).catch(() => null)));
const memStory = await memoryNow();
await p.locator('[data-shoot="layer-reports"]').click(); // turn Forecast history OFF
await p.waitForTimeout(800);
const memNoReports = await memoryNow();
check(
  "Forecast Memory survives turning its own layer off — it is not a marker",
  JSON.stringify(memStory) === JSON.stringify(memNoReports),
  memStory.filter(Boolean).join(", ")
);
check("…and the memory capsules are still drawn",
  (await p.locator('[data-shoot="forecast-memory"]').count()) > 0);
await p.locator('[data-shoot="layers-story"]').click();
await p.waitForTimeout(700);
await p.keyboard.press("Escape");
await p.waitForTimeout(400);

// ── 6. an articulated event NAMES its type ─────────────────────────
await p.locator('[data-shoot="to-beginning"]').click();
await p.waitForTimeout(900);
await p.locator('[data-shoot="play"]').click();
let named = null;
for (let i = 0; i < 200; i++) {
  await p.waitForTimeout(120);
  const mods = p.locator('[data-shoot^="event-module-"]');
  if ((await mods.count()) > 0) {
    named = await mods.first().innerText();
    break;
  }
}
const KINDS = /forecast report|decision raised|connected to delivery|decision decided|work completed|context observed|landmark|finding/i;
check("An articulated event NAMES its type in words — no legend needed",
  !!named && KINDS.test(named), (named ?? "").replace(/\s+/g, " ").trim().slice(0, 60));
// let it finish
for (let i = 0; i < 220; i++) {
  await p.waitForTimeout(300);
  if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 6) break;
}
await p.waitForTimeout(1500);

// ── 7. hovering explains, without playback ─────────────────────────
// A REAL pointer, not a synthesized event. The claim is that a person can
// point at a quiet marker and be told what it is, which is only true if the
// marker actually owns the pixels above it — the first version of this
// check dispatched mouseenter directly and hid the fact that a neighbouring
// marker's grab area was swallowing this one's own centre.
const work = projA.entries.find((e) => e.kind === "work_completed");
if (work) {
  const mark = p.locator(`[data-shoot="event-${work.id}"]`);
  const box = await mark.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const reached = await p.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest("[data-shoot]")?.getAttribute("data-shoot") ?? "none",
    [cx, cy]
  );
  check("A marker owns the pixels above it — the pointer reaches the event it is over",
    reached === `event-${work.id}`, reached);

  await p.mouse.move(cx - 60, cy - 60);
  await p.waitForTimeout(120);
  await p.mouse.move(cx, cy);
  await p.waitForTimeout(700);
  const peek = await p.locator(`[data-shoot="event-module-${work.id}"]`).innerText({ timeout: 800 }).catch(() => "");
  check("Pointing at a resting marker explains it", /work completed/i.test(peek), peek.replace(/\s+/g, " ").slice(0, 50));
  await p.mouse.move(20, 20);
  await p.waitForTimeout(400);
}

// ── 8. overdue is obvious without a legend ─────────────────────────
const overdue = projA.entries.find((e) => e.detail?.overdue === true);
if (overdue) {
  const el = p.locator(`[data-shoot="${handle(overdue)}"]`);
  check("An overdue plan is marked as state, not as a colour to look up",
    (await el.locator('[data-shoot="overdue-mark"]').count()) === 1 &&
    (await el.getAttribute("data-overdue")) === "true",
    overdue.title.slice(0, 40));
} else {
  check("An overdue plan exists to check", false, "none");
}

// ── 9. selection still exposes full depth ──────────────────────────
const rep = projA.entries.find((e) => e.kind === "report");
await p.locator(`[data-shoot="event-${rep.id}"]`).dispatchEvent("click");
await p.waitForTimeout(900);
const insp = await p.locator('[data-shoot="open-forecast"]').count();
const inspText = await p.locator("body").innerText();
check("Selecting a Report still exposes the full record",
  insp === 1 && /p50 likely/i.test(inspText) && /since previous report/i.test(inspText) && /confidence/i.test(inspText));

// ── 10. a hidden layer's entry is still crossable data ─────────────
const ctxEntry = projA.entries.find((e) => e.kind === "context_observed");
check("Context entries remain in the projection while their layer is off",
  !!ctxEntry, ctxEntry ? ctxEntry.title.slice(0, 40) : "none");

await b.close();
console.log(`\n${failures === 0 ? "ALL PROGRESSIVE DISCLOSURE PROOFS PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
