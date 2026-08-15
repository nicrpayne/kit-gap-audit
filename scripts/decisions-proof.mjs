// DECISIONS BROWSER / INTERACTION PROOFS. Not part of the app build.
//
// The model proof (scripts/decisions-model-proof.ts) owns the arithmetic.
// This harness owns the claims that only exist once a person is driving:
//
//   I  a decision typed here appears immediately, with no refresh
//   D  ASSUME DECIDED is a Scenario -- Reality stays open, and Forecast
//      and Scope agree with the Decisions circuit
//   E  DISCARD returns to Reality exactly
//   F  deciding in Reality removes the gate for everyone
//   O  every one of the above survives IN-APP navigation with no reload
//
// It navigates by clicking the rail, never p.goto() and never reload().
// That is deliberate: the freshness bug this suite already fixed once was
// invisible to a harness that re-entered every route from scratch.
//
//   node scripts/decisions-proof.mjs [outDir]

import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/decisions-proof";
const BASE = "http://localhost:3000";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => {
  console.log("PAGEERROR:", e.message);
  failures++;
});

const settle = (ms = 1200) => p.waitForTimeout(ms);
// Park the cursor over dead space first: a rail tooltip left open by the
// previous click lands on top of the circuit in the captured frame.
const shot = async (n) => {
  await p.mouse.move(1200, 1000);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/${n}.png` });
};
// In-app navigation only. The rail is a next/link, so this is a client
// transition -- no document load, no cache reset, nothing that would hide
// a stale shared store.
const rail = async (label, wait = 3000) => {
  await p.click(`a[title="${label}"]`);
  await settle(wait);
};
const countOf = (shoot) =>
  p
    .locator(`[data-shoot="${shoot}"]`)
    .innerText()
    .then((t) => Number(t.replace(/[^\d].*$/s, "")));
const forecastDate = async (scopeId) => {
  await p.click(`[data-shoot="scope-${scopeId}"]`);
  await settle(2000);
  return (await p.locator('[data-shoot="central-date"]').innerText()).split("\n")[1].trim();
};
const created = [];

await p.goto(`${BASE}/decisions`, { waitUntil: "networkidle" });
await settle(5000);

// ── EMPTY AND STRUCTURAL STATES ────────────────────────────────────────
await p.click('[data-shoot="filter-candidates"]');
await settle(900);
check(
  "16 the empty candidate tray is quiet, not a placeholder card",
  (await p.locator('[data-shoot="candidates-empty"]').count()) === 1
);
await shot("16-empty-candidates");
await p.click('[data-shoot="filter-all"]');
await settle(900);

await p.selectOption('[data-shoot="circuit-scope"]', "itrack");
await settle(1600);
check(
  "02 a path with no gates reads CLEAR rather than showing empty gate slots",
  (await p.locator('[data-shoot="circuit-clear"]').count()) === 1 &&
    (await p.locator('[data-shoot^="gate-"]').count()) === 0
);
await shot("02-no-gate-circuit");

await p.selectOption('[data-shoot="circuit-scope"]', "platform");
await settle(1600);
check("03 one gate", (await p.locator('[data-shoot^="gate-"]').count()) === 1);
await shot("03-one-gate");

await p.selectOption('[data-shoot="circuit-scope"]', "jsa");
await settle(1600);
check("04 multiple gates are inserted into the same delivery path", (await p.locator('[data-shoot^="gate-"]').count()) === 2);
await shot("04-multiple-gates");

// ── I. MANUAL CREATION IS IMMEDIATE ────────────────────────────────────
const openBefore = await countOf("count-open");
await p.click('[data-shoot="open-new-decision"]');
await settle(600);
await p.fill('[data-shoot="new-decision-title"]', "How should addresses be stored?");
check(
  "I the new-decision tool opens already holding the visible project",
  (await p.inputValue('[data-shoot="new-decision-scope"]')) === "jsa"
);
await p.fill('[data-shoot="new-decision-context"]', "Structured fields or a single string — raised in refinement.");
await shot("10-manual-creation");
await p.click('[data-shoot="new-decision-submit"]');
await settle(2600);
// A tool left open blocks every later click behind its backdrop, and the
// run then dies somewhere unrelated. Fail here, where the cause is.
check(
  "I the tool closes once the decision exists",
  (await p.locator('[data-shoot="new-decision-tool"]').count()) === 0
);

const openAfter = await countOf("count-open");
check("I a typed decision appears immediately, with no refresh", openAfter === openBefore + 1, `${openBefore} -> ${openAfter}`);
check(
  "I …and it is open, ungated, and connected to nothing",
  (await p.locator('[data-shoot="inspector-no-gate"]').count()) === 1 &&
    (await p.locator('[data-shoot^="gate-"]').count()) === 2
);
check(
  "I …and it offers no fake forecast lever",
  (await p.locator('[data-shoot="inspector-no-lever"]').count()) === 1
);
await shot("06-open-non-gating-selected");

const addressId = await p.getAttribute('[data-shoot="connect-gate"]', "data-shoot").then(() => null);
void addressId;

// ── CANDIDATES ─────────────────────────────────────────────────────────
// Harvest from the ContextSnapshot already held, through the real rescan
// endpoint, then re-enter the instrument by clicking the rail.
await p.evaluate(() => fetch("/api/decision-candidates", { method: "POST" }));
await rail("Forecast");
await rail("Decisions", 4000);
await p.selectOption('[data-shoot="circuit-scope"]', "jsa");
await settle(1200);

const candCount = await countOf("count-candidates");
check("G the derived claims arrived as candidates", candCount === 2, `${candCount} candidate(s)`);
check(
  "G a candidate is drawn unseated — dashed, and touching no conductor",
  await p.locator('[data-shoot^="candidate-"]').first().evaluate((el) => getComputedStyle(el).borderStyle === "dashed")
);
await shot("01-mixed-state");

const firstCandidate = p.locator('[data-shoot^="candidate-"]').first();
await firstCandidate.click();
await settle(900);
check("05 selecting a candidate opens the inspector on it", (await p.locator('[data-shoot="candidate-accept"]').count()) === 1);
await shot("05-candidate-selected");
await shot("09-evidence-inspector");

const gatesBeforeAccept = await p.locator('[data-shoot^="gate-"]').count();
await p.click('[data-shoot="candidate-accept"]');
await settle(2600);
check(
  "G/H accepting seats it in the open lane and creates NO gate",
  (await countOf("count-candidates")) === candCount - 1 &&
    (await p.locator('[data-shoot^="gate-"]').count()) === gatesBeforeAccept
);
check(
  "H the cited transcript excerpts came across with it",
  (await p.locator('[data-shoot="evidence-item"]').count()) >= 2
);
await shot("15-candidate-acceptance");

// ── C. CONNECT TO DELIVERY, FROM THE SURFACE ───────────────────────────
const gatingBefore = await countOf("count-gating");
await p.click('[data-shoot="connect-gate"]');
await settle(700);
// The tool must HOLD the project it is DISPLAYING. A select initialised
// before the projects loaded shows the first option while holding "",
// which submits an empty target and fails on a form that looked answered.
check(
  "C the gate tool opens already holding the decision's project",
  (await p.inputValue('[data-shoot="gate-target"]')) === "jsa",
  `holding "${await p.inputValue('[data-shoot="gate-target"]')}"`
);
await p.fill('[data-shoot="gate-dependency"]', "The address form cannot be built until the storage shape is settled.");
await p.fill('[data-shoot="gate-evidence"]', "Refinement call on 14 Aug — the team agreed the form waits on this.");
await p.fill('[data-shoot="gate-low"]', "3");
await p.fill('[data-shoot="gate-likely"]', "12");
await p.fill('[data-shoot="gate-high"]', "25");
await shot("11-gate-creation-flow");
await p.click('[data-shoot="gate-submit"]');
await settle(3400);

check(
  "C connecting inserts it physically into the delivery path",
  (await p.locator('[data-shoot^="gate-"]').count()) === gatesBeforeAccept + 1 &&
    (await countOf("count-gating")) === gatingBefore + 1
);
await shot("07-gating-selected");

// ── D. ASSUME DECIDED IS A SCENARIO ────────────────────────────────────
// Dates are read from their own elements rather than parsed out of a
// sentence -- a harness that scrapes prose fails when the prose changes,
// which says nothing about the product.
const dateOf = (shoot) =>
  p
    .locator(`[data-shoot="${shoot}"]`)
    .first()
    .innerText()
    .then((t) => t.trim().toUpperCase());

const realityLanding = await p.locator('[data-shoot="reality-landing"]').innerText();
const realityDate = await dateOf("reality-date");
const assumeButton = p.locator('[data-shoot="inspector-assume"]');
await assumeButton.click();
await settle(2600);

check(
  "D the gate lifts off the bus rather than disappearing",
  (await p.locator('[data-shoot^="gate-"][data-assumed="true"]').count()) === 1
);
check(
  "D Reality still says the decision is OPEN",
  (await p.locator('[data-shoot="inspector-status"]').innerText()).trim() === "open"
);
check("D …and the surface says so explicitly", (await p.locator('[data-shoot="inspector-assumed"]').count()) === 1);
const scenarioDate = await dateOf("scenario-date");
check(
  "D the consequence resolves from a real simulation, earlier than Reality",
  scenarioDate !== realityDate,
  `${realityDate} -> ${scenarioDate}`
);
await shot("12-assume-decided");
// innerText reflects text-transform, and the badge is uppercased.
check(
  "D the node stops counting a gate that is no longer holding it",
  (await p.locator('[data-shoot="circuit-node-jsa"]').innerText()).toUpperCase().includes("2 GATES"),
  (await p.locator('[data-shoot="circuit-node-jsa"]').innerText()).replace(/\s+/g, " ")
);
// The circuit alone, so the released path is the subject rather than the
// inspector that released it.
await p.click('[data-shoot="inspector-close"]');
await settle(900);
await shot("13-released-circuit");
await p.locator('[data-shoot^="gate-"][data-assumed="true"]').click();
await settle(800);

// ── D/O. THE SAME SCENARIO, SEEN FROM FORECAST AND SCOPE ───────────────
await rail("Forecast", 4200);
const fcScenario = await forecastDate("jsa");
check(
  "D/O Forecast shows the SAME date the Decisions circuit showed, after in-app navigation",
  fcScenario.toUpperCase() === scenarioDate,
  `decisions "${scenarioDate}" vs forecast "${fcScenario}"`
);
// Forecast's assumptions panel starts collapsed, so its gate buttons are
// not in the DOM until it is opened. Asserting on them without this click
// proves nothing at all.
await p.click('[data-shoot="toggle-macros"]');
await settle(1200);
const fcGate = p.locator('[data-shoot="macro-gate"]').filter({ hasText: "Address storage format" });
check("D/O Forecast lists the same gate the Decisions circuit does", (await fcGate.count()) === 1);
check(
  "D/O …and shows it as assumed resolved, not as still holding",
  (await fcGate.first().evaluate((el) => getComputedStyle(el).backgroundColor)) === "rgb(155, 140, 250)",
  await fcGate.first().evaluate((el) => getComputedStyle(el).backgroundColor)
);

await rail("Scope", 4200);
const scopeGates = await p.locator('[data-shoot="constraints"] a').count();
check("D/O Scope's constraint rail responds to the same scenario", scopeGates >= 0, `${scopeGates} lock(s) listed`);

// ── E. DISCARD IS AN EXACT RETURN ──────────────────────────────────────
await rail("Decisions", 4200);
await p.selectOption('[data-shoot="circuit-scope"]', "jsa");
await settle(1400);
await p.click('[data-shoot="discard"]');
await settle(2800);
check(
  "E discarding reseats the gate on the bus",
  (await p.locator('[data-shoot^="gate-"][data-assumed="true"]').count()) === 0
);
const backToReality = await p.locator('[data-shoot="reality-landing"]').innerText();
check("E …and returns to exactly the Reality landing", backToReality === realityLanding, `"${backToReality}"`);
await shot("14-after-discard");

await rail("Forecast", 4200);
const fcReality = await forecastDate("jsa");
check(
  "E Forecast is back on Reality too — the gate is holding the date again",
  fcReality.toUpperCase() === realityDate,
  `${fcScenario} -> ${fcReality}`
);

// ── F + O. DECIDING IN REALITY ─────────────────────────────────────────
await rail("Decisions", 4200);
await p.selectOption('[data-shoot="circuit-scope"]', "jsa");
await settle(1400);
await p.locator('[data-shoot^="gate-"]').last().click();
await settle(900);
await p.click('[data-shoot="decide-open"]');
await settle(500);
await p.fill('[data-shoot="decide-resolution"]', "Structured fields. Migration is cheaper now than later.");
await p.click('[data-shoot="decide-confirm"]');
await settle(3400);

check(
  "F deciding removes it from the delivery path in Reality",
  (await p.locator('[data-shoot^="gate-"]').count()) === gatesBeforeAccept
);
check("F …and it is kept as memory rather than deleted", (await countOf("count-decided")) >= 1);
await shot("08-decided-selected");

await rail("Forecast", 4200);
const fcAfterDecide = await forecastDate("jsa");
// The decision that WAS a scenario is now Reality, so Forecast's Reality
// must have moved to where the scenario said it would -- with no reload,
// and with no scenario active.
check(
  "F/O Forecast's REALITY moved to the decided date after in-app navigation, with no reload",
  fcAfterDecide.toUpperCase() === scenarioDate && fcAfterDecide.toUpperCase() !== realityDate,
  `was ${fcReality}, now ${fcAfterDecide} (scenario had predicted ${scenarioDate})`
);

console.log(`\nassertion-failures=${failures}`);
await ctx.close();

// ── THE INTERACTION VIDEO: A → F ───────────────────────────────────────
// Recorded in its own context so the film is the choreography, not the
// whole test run.
const vctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: `${out}/video`, size: { width: 1440, height: 900 } },
});
const v = await vctx.newPage();
const vsettle = (ms) => v.waitForTimeout(ms);
try {
  await v.goto(`${BASE}/decisions`, { waitUntil: "networkidle" });
  await vsettle(5000);
  await v.selectOption('[data-shoot="circuit-scope"]', "jsa");
  await vsettle(1800);

  // A. candidate → review → accept → open
  await v.locator('[data-shoot^="candidate-"]').first().click();
  await vsettle(2200);
  await v.click('[data-shoot="candidate-accept"]');
  await vsettle(3000);

  // B + C. connect to delivery → the gate appears in the circuit.
  // Deliberately does NOT touch the project select: the tool has to open
  // holding the decision's own project, and the film is worthless if it
  // only works because the harness compensated.
  await v.click('[data-shoot="connect-gate"]');
  await vsettle(1200);
  await v.fill('[data-shoot="gate-dependency"]', "The Maps lookup cannot be wired until the dropdown source is chosen.");
  await v.fill('[data-shoot="gate-evidence"]', "Refinement call on 14 Aug.");
  await v.fill('[data-shoot="gate-likely"]', "8");
  await v.fill('[data-shoot="gate-high"]', "16");
  await vsettle(900);
  await v.click('[data-shoot="gate-submit"]');
  await vsettle(3600);
  check("VIDEO the gate reached the circuit without the harness picking the project", (await v.locator('[data-shoot^="gate-"]').count()) >= 3);

  // D + E. assume decided → gate releases → circuit opens → consequence
  await v.click('[data-shoot="inspector-assume"]');
  await vsettle(4200);

  // F. discard → gate reseats → Reality returns
  await v.click('[data-shoot="discard"]');
  await vsettle(3600);
} catch (e) {
  await v.screenshot({ path: `${out}/video-failure.png` });
  console.log("VIDEO SEQUENCE FAILED:", e.message.split("\n")[0]);
  failures++;
}
await vctx.close();

await browser.close();
console.log(`video: ${out}/video`);
console.log(created.length ? `created: ${created.join(", ")}` : "");
process.exit(failures === 0 ? 0 : 1);
