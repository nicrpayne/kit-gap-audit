// PLAYING THE PORTFOLIO. Records the interaction and asserts it. Not part
// of the app build.
//
// The sequence is the product argument, in order:
//
//   1. raise a channel      -> free capacity falls, the lane above moves
//   2. raise past the pool  -> +N FTE REQUIRED, nothing silently taken
//   3. name a donor         -> both faders move as ONE action, master balances
//   4. split a human        -> raw conserved, effective drops
//   5. turn the switch knob -> faders stand still, effectiveness and dates move
//
// If that reads as obvious while you watch it, the instrument is right.
//
//   node scripts/mixer-interaction-proof.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/mixer-proof";
const BASE = "http://localhost:3000";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({
  viewport: { width: 1680, height: 1050 },
  recordVideo: { dir: out, size: { width: 1680, height: 1050 } },
});
const p = await ctx.newPage();
p.on("pageerror", (e) => {
  console.log("PAGEERROR:", e.message);
  failures++;
});

const settle = (ms = 1400) => p.waitForTimeout(ms);
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
const num = async (sel) => Number((await p.locator(sel).innerText()).replace(/[^\d.]/g, ""));
const text = async (sel) => (await p.locator(sel).innerText()).replace(/\s+/g, " ").trim();
const laneDate = (name) =>
  p.locator(`[aria-label^="${name}, likely"] .i-readout`).first().innerText().then((t) => t.trim());

// Drive a vertical fader by keyboard. NOTE the unit: one arrow press is one
// whole FTE, and Alt+arrow is half of one. It used to be 0.1, which is why
// every count in this file changed when the fader learned to speak in
// people. This harness proves the MODEL; the pointer behaviour it cannot
// see is proved in fader-direct-manipulation-proof.mjs -- keyboard-only
// coverage here is exactly what let a 17px-travel fader ship.
const nudge = async (scopeId, people, key = "ArrowUp") => {
  const f = p.locator(`[data-shoot="fader-${scopeId}"]`);
  await f.focus();
  for (let i = 0; i < people; i++) await p.keyboard.press(key);
  await settle(900);
};

await p.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
await settle(5000);

// ── 0. REALITY ──────────────────────────────────────────────────────────
const workforce0 = await num('[data-shoot="master-workforce"]');
const free0 = await num('[data-shoot="master-free"]');
const platformRaw0 = await num('[data-shoot="channel-platform"] [data-shoot="channel-raw"]');
const platformLane0 = await laneDate("Platform");
check("The mixer opens on Reality with a finite workforce", workforce0 > 0, `${workforce0} FTE, ${free0} free`);
check(
  "Channel and swim lane agree on Platform's date",
  (await text('[data-shoot="channel-platform"] [data-shoot="channel-date"]')).toUpperCase() ===
    platformLane0.toUpperCase(),
  `channel "${await text('[data-shoot="channel-platform"] [data-shoot="channel-date"]')}" vs lane "${platformLane0}"`
);
await shot("1-reality");

// ── 1. RAISE: free capacity is consumed first ───────────────────────────
// One person. The roster this runs against keeps only a fraction of an FTE
// genuinely free, so a whole-person request necessarily runs past the pool
// -- which is the sharper test anyway: free capacity must be spent BEFORE
// anything is declared missing, never alongside it.
await nudge("platform", 1);
const free1 = await num('[data-shoot="master-free"]');
const platformRaw1 = await num('[data-shoot="channel-platform"] [data-shoot="channel-raw"]');
const deficit1 = parseFloat((await text('[data-shoot="master-overunder"]')).replace(/[^\d.]/g, "")) || 0;
check("Raising Platform consumed free capacity", platformRaw1 > platformRaw0 && free1 < free0, `${platformRaw0} -> ${platformRaw1} FTE, free ${free0} -> ${free1}`);
check(
  "Free capacity was spent before anything was declared missing",
  Math.abs(deficit1 - (1 - free0)) < 0.05,
  `asked +1.0, had ${free0} free, reported +${deficit1.toFixed(1)} missing`
);
check("The workforce did not change", (await num('[data-shoot="master-workforce"]')) === workforce0, `${workforce0} FTE`);
await shot("2-consumed-free");

// ── 2. RAISE PAST THE POOL: a named deficit, not a silent theft ─────────
// Two more people, so the shortfall is real but still inside what a single
// donor channel can actually cover -- step 3 has to be able to resolve it.
const jsaRawBefore = await num('[data-shoot="channel-jsa"] [data-shoot="channel-raw"]');
await nudge("platform", 2);
const overUnder = await text('[data-shoot="master-overunder"]');
check("Asking for more than exists is reported, not absorbed", overUnder.startsWith("+"), overUnder);
check(
  "No other channel was quietly drained",
  (await num('[data-shoot="channel-jsa"] [data-shoot="channel-raw"]')) === jsaRawBefore,
  `JSA still ${jsaRawBefore} FTE`
);
check("The workforce was not quietly grown", (await num('[data-shoot="master-workforce"]')) === workforce0, `${workforce0} FTE`);
check("The capacity tension rail wakes, offering only real capacity", (await p.locator('[data-shoot="tension-rail"]').count()) === 1);
check("Reality cannot be committed while people are missing", await p.locator('[data-shoot="commit"]').isDisabled().catch(() => true));
await shot("3-required");

// ── 3. DONOR TRANSFER: two faders, one action ───────────────────────────
const donor = p.locator('[data-shoot^="take-from-"]').first();
const donorId = (await donor.getAttribute("data-shoot")).replace("take-from-", "");
const donorRawBefore = await num(`[data-shoot="channel-${donorId}"] [data-shoot="channel-raw"]`);
await donor.click();
await settle(2600);
const donorRawAfter = await num(`[data-shoot="channel-${donorId}"] [data-shoot="channel-raw"]`);
const platformRaw3 = await num('[data-shoot="channel-platform"] [data-shoot="channel-raw"]');
check("The donor gave capacity up", donorRawAfter < donorRawBefore, `${donorId} ${donorRawBefore} -> ${donorRawAfter} FTE`);
check("Platform received it in the same action", platformRaw3 >= platformRaw1, `${platformRaw3} FTE`);
check("The workforce is untouched by a transfer", (await num('[data-shoot="master-workforce"]')) === workforce0, `${workforce0} FTE`);
check("The deficit is resolved", !(await text('[data-shoot="master-overunder"]')).startsWith("+"), await text('[data-shoot="master-overunder"]'));
await shot("4-donor-transfer");

// ── 4. SPLIT ONE HUMAN ──────────────────────────────────────────────────
await p.locator('[data-shoot="discard"]').click();
await settle(2600);
await p.locator('[data-shoot="bridge-person"]').first().click().catch(async () => {
  await p.locator('[data-shoot^="splits-"]').first().click();
});
await settle(1600);
check("The patchbay opens on one person", (await p.locator('[data-shoot="patchbay"]').count()) === 1);
const patchRaw = await text('[data-shoot="patch-raw"]');
const patchEff = await text('[data-shoot="patch-effective"]');
check("A split person is still exactly one human", parseFloat(patchRaw) <= 1.0001, `${patchRaw} physical`);
check("…and delivers less than they cost", parseFloat(patchEff) < parseFloat(patchRaw), `${patchRaw} -> ${patchEff}`);
await shot("5-patchbay-split");
await p.locator('[data-shoot="patchbay"] [aria-label="Close"]').click();
await settle(1400);

// ── 5. THE KNOB MOVES EFFECTIVENESS, NOT PEOPLE ─────────────────────────
const rawsBefore = await p.locator('[data-shoot="channel-raw"]').allInnerTexts();
const effBefore = await num('[data-shoot="master-effective"]');
const allocBefore = await text('[data-shoot="master-allocated"]');
const designLaneBefore = await laneDate("Design");

const knob = p.locator('[data-shoot="switch-knob-input"]');
await knob.focus();
for (let i = 0; i < 18; i++) await p.keyboard.press("ArrowRight");
await settle(3000);

const rawsAfter = await p.locator('[data-shoot="channel-raw"]').allInnerTexts();
const effAfter = await num('[data-shoot="master-effective"]');
check(
  "Raw allocation is numerically unmoved by the knob",
  JSON.stringify(rawsBefore) === JSON.stringify(rawsAfter),
  rawsAfter.join(" | ")
);
check("Allocated is unmoved too — nobody was lost", (await text('[data-shoot="master-allocated"]')) === allocBefore, allocBefore);
check("Effective capacity fell", effAfter < effBefore, `${effBefore} -> ${effAfter} FTE`);
const designLaneAfter = await laneDate("Design");
check(
  "A split-exposed project's forecast responded",
  designLaneAfter !== designLaneBefore,
  `Design ${designLaneBefore} -> ${designLaneAfter}`
);
await shot("6-switch-cost");

await p.locator('[data-shoot="discard"]').click();
await settle(2200);
check("Discard returns the whole surface to Reality", (await num('[data-shoot="master-free"]')) === free0, `free back to ${free0}`);
await shot("7-back-to-reality");

await ctx.close();
await b.close();
console.log(failures === 0 ? "\nALL PROOFS PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
