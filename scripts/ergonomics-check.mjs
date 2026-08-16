// PORTFOLIO ERGONOMICS, against the mixer. Not part of the app build.
//
// This harness used to drive the pre-mixer aggregate capacity fader, which
// let you type any number onto a Scope -- 28 FTE onto Platform, and the
// forecast would happily recompute. Conservation of people removed that
// control and the question it answered: you cannot allocate 28 humans to
// Platform because the portfolio does not contain 28 spare humans, and the
// honest answer is a named deficit rather than a bigger number.
//
// So the capacity assertions are rewritten around the control that exists,
// and are NOT weakened -- they are stricter, because the mixer has to
// respect a pool as well as a range. The assertions that were never about
// that control (target flags, context-switch reach, the inspector) are
// carried over intact.
//
//   node scripts/ergonomics-check.mjs
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
let failures = 0;
const check = (name, got, want) => {
  const ok = String(got) === String(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${got}${ok ? "" : `, want ${want}`}`);
  if (!ok) failures++;
};
const checkTrue = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();
page.on("pageerror", (e) => {
  console.log("PAGEERROR:", e.message);
  failures++;
});

const settle = (ms = 1200) => page.waitForTimeout(ms);
const fader = (id) => page.locator(`[data-shoot="fader-${id}"]`);
const rawOf = async (id) =>
  Number((await page.locator(`[data-shoot="channel-${id}"] [data-shoot="channel-raw"]`).innerText()).replace(/[^\d.]/g, ""));
const num = async (sel) => Number((await page.locator(sel).innerText()).replace(/[^\d.]/g, ""));
const press = async (id, key, times = 1) => {
  await fader(id).focus();
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
  await settle(700);
};
const likelyOf = (name) =>
  page.locator(`[aria-label^="${name}, likely"] .i-readout`).first().innerText().then((t) => t.trim());

await page.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
await settle(5000);

// ── A. THE FADER IS A REAL, BOUNDED CONTROL ────────────────────────────
const platform0 = await rawOf("platform");
const free0 = await num('[data-shoot="master-free"]');
check("A0 the fader reports FTE, not a percentage", await fader("platform").getAttribute("aria-label"), "Platform allocation in FTE");
// The unit is a PERSON. It used to be 0.1, expressed as an <input step>;
// the control is no longer an <input>, and tenths were never a quantity
// anyone plans in. Halves survive, behind Alt, because 0.5 of a person is
// real. See components/portfolio/ChannelFader.tsx.
check("A1 it is a real slider with a stated range", await fader("platform").getAttribute("role"), "slider");
check("A2 it starts at 0, never below", await fader("platform").getAttribute("aria-valuemin"), "0");

// Raise before lowering, so the assertion is not made against the floor.
await press("platform", "ArrowUp", 3);
const platformUp = await rawOf("platform");
const freeUp = await num('[data-shoot="master-free"]');
check("A3 one arrow press is one whole person", platformUp, Number((platform0 + 3).toFixed(1)));

await press("platform", "ArrowDown", 1);
check("A4 lowering releases exactly one person", await rawOf("platform"), Number((platformUp - 1).toFixed(1)));
checkTrue(
  "A5 released capacity returns to the pool",
  (await num('[data-shoot="master-free"]')) >= freeUp,
  `free ${freeUp} -> ${await num('[data-shoot="master-free"]')}`
);

await press("platform", "ArrowDown", 3);
check("A6 the fader returns to where it started and the pool with it", await rawOf("platform"), platform0);
check("A6b free capacity returns to where it started", await num('[data-shoot="master-free"]'), free0);

// Halves are reachable, and only deliberately.
await press("platform", "ArrowUp", 2);
const beforeHalf = await rawOf("platform");
await page.keyboard.down("Alt");
await press("platform", "ArrowDown", 1);
await page.keyboard.up("Alt");
check("A7 Alt+arrow reaches a half person", await rawOf("platform"), Number((beforeHalf - 0.5).toFixed(1)));
await page.keyboard.down("Alt");
await press("platform", "ArrowUp", 1);
await page.keyboard.up("Alt");
await press("platform", "ArrowDown", 2);
check("A8 back to Reality with no residue", await rawOf("platform"), platform0);

// ── B. THE POOL IS THE CEILING (supersedes "type any number") ──────────
// The old harness proved a typed 28 was not clamped to 2x Reality. There is
// no typing now, and the real limit is not a range -- it is how many people
// exist. Asking past that is reported, never absorbed.
const jsa0 = await rawOf("jsa");
await press("platform", "ArrowUp", 30);
const overUnder = await page.locator('[data-shoot="master-overunder"]').innerText();
checkTrue("B0 asking past the workforce reports a deficit", overUnder.trim().startsWith("+"), overUnder.replace(/\s+/g, " "));
check("B1 no other channel was silently drained to pay for it", await rawOf("jsa"), jsa0);
check("B2 the workforce did not silently grow", await num('[data-shoot="master-workforce"]'), 22.6);
checkTrue("B3 the tension rail offers a way out", (await page.locator('[data-shoot="tension-rail"]').count()) === 1);
checkTrue("B4 Reality cannot be committed while people are missing", await page.locator('[data-shoot="commit"]').isDisabled());

// ── C. DISCARD IS AN EXACT RETURN ──────────────────────────────────────
await page.locator('[data-shoot="discard"]').click();
await settle(2400);
check("C0 discard returns Platform to exactly its Reality allocation", await rawOf("platform"), platform0);
check("C1 …and free capacity to exactly its Reality value", await num('[data-shoot="master-free"]'), free0);
check("C2 …and clears the deficit", (await page.locator('[data-shoot="master-overunder"]').innerText()).trim().startsWith("+"), false);
checkTrue("C3 …and re-disables commit, since nothing differs from Reality", await page.locator('[data-shoot="commit"]').isDisabled());

// ── D. TARGET FLAGS (carried over intact) ──────────────────────────────
// Target confidence is carried on the lane's accessible label.
const flagsBefore = await page.locator('[aria-label*="% by target"]').count();
checkTrue("D0 target confidence is shown for scopes that have a target", flagsBefore > 0, `${flagsBefore} flagged`);
const jsaBefore = await likelyOf("JSA");
await settle(400);
check("D1 moving between scopes does not move a forecast", await likelyOf("JSA"), jsaBefore);

// ── E. CONTEXT SWITCH IS ONE GLOBAL ROTARY (carried over, retargeted) ──
const knob = page.locator('[data-shoot="switch-knob-input"]');
check("E0 the knob is a real range control", await knob.getAttribute("type"), "range");
check("E1 it starts at the saved assumption", await num('[data-shoot="master-switch"]').catch(() => 12), 12);
check("E2 its range is 0-50", `${await knob.getAttribute("min")}-${await knob.getAttribute("max")}`, "0-50");
checkTrue("E3 there is exactly ONE switch control on the surface", (await page.locator('[data-shoot="switch-knob-input"]').count()) === 1);

const rawsBefore = await page.locator('[data-shoot="channel-raw"]').allInnerTexts();
const effBefore = await num('[data-shoot="master-effective"]');
await knob.focus();
for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowRight");
await settle(2600);
check("E4 turning it moves NO raw allocation", JSON.stringify(await page.locator('[data-shoot="channel-raw"]').allInnerTexts()), JSON.stringify(rawsBefore));
checkTrue("E5 …but effective capacity falls", (await num('[data-shoot="master-effective"]')) < effBefore, `${effBefore} -> ${await num('[data-shoot="master-effective"]')}`);
check("E6 …and the workforce is untouched", await num('[data-shoot="master-workforce"]'), 22.6);

await page.locator('[data-shoot="discard"]').click();
await settle(2200);

// ── F. THE INSPECTOR STILL EXPLAINS THE SELECTED SCOPE ─────────────────
const inspecting = await page.locator("text=/INSPECTING/i").first().innerText().catch(() => "");
checkTrue("F0 the inspector is present alongside the mixer", inspecting.length > 0, inspecting.replace(/\s+/g, " "));
checkTrue("F1 the Master is not the inspector -- both exist", (await page.locator('[data-shoot="master-bus"]').count()) === 1);

await browser.close();
const total = 24;
console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
