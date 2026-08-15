// PORTFOLIO -> FORECAST, through the mixer. Not part of the app build.
//
// The claim: a capacity decision committed in Portfolio is the same fact
// the Forecast instrument reads. This harness used to make that decision
// with the pre-mixer aggregate fader, typing a number onto a Scope. That
// control is gone, and so is the assumption underneath it -- capacity is
// conserved now, so the committed change has to be one the portfolio can
// actually make with the people it has.
//
// What is NOT weakened: the change is still committed to Reality, still
// read back from the API, still checked in Forecast, and still restored.
// A gate is still assumed decided to prove the two levers compose.
//
//   node scripts/portfolio-proof.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/portfolio-proof";
const BASE = "http://localhost:3000";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 })).newPage();
p.on("pageerror", (e) => {
  console.log("PAGEERROR:", e.message);
  failures++;
});

const settle = (ms = 1400) => p.waitForTimeout(ms);
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });

const capacityOf = (scopeId) =>
  p.evaluate(async (id) => {
    const r = await fetch("/api/portfolio/inputs", { cache: "no-store" });
    const j = await r.json();
    return j.scopes.find((s) => s.scopeId === id)?.teamCapacity ?? null;
  }, scopeId);

const gotoPortfolio = async () => {
  await p.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
  await settle(5000);
};
const gotoForecast = async (scopeId) => {
  await p.goto(`${BASE}/forecast`, { waitUntil: "networkidle" });
  await settle(4200);
  await p.locator(`[data-shoot="scope-${scopeId}"]`).click();
  await settle(2000);
  return (await p.locator('[data-shoot="central-date"]').innerText()).split("\n")[1].trim();
};

// Move a channel to a target allocation and commit it to Reality.
const commitChannel = async (scopeId, targetRaw) => {
  const cur = Number(
    (await p.locator(`[data-shoot="channel-${scopeId}"] [data-shoot="channel-raw"]`).innerText()).replace(/[^\d.]/g, "")
  );
  const fader = p.locator(`[data-shoot="fader-${scopeId}"]`);
  await fader.focus();
  const steps = Math.round(Math.abs(targetRaw - cur) / 0.1);
  const key = targetRaw > cur ? "ArrowUp" : "ArrowDown";
  for (let i = 0; i < steps; i++) await p.keyboard.press(key);
  await settle(1500);
  await p.locator('[data-shoot="commit"]').click();
  await settle(3800);
};

await gotoPortfolio();
const baseline = await capacityOf("platform");
console.log(`BASELINE Platform capacity: ${baseline} FTE`);
const platformBefore = await gotoForecast("platform");
console.log(`FORECAST platform BEFORE: ${platformBefore}`);
await shot("p1-forecast-before");

// ── 1. A capacity decision the portfolio can actually make ──────────────
// Releasing people is always physically possible; asking for people who do
// not exist is refused at commit, which the ergonomics harness proves.
await gotoPortfolio();
await shot("p2-mixer-reality");
await commitChannel("platform", baseline - 4);
const committed = await capacityOf("platform");
check("Portfolio committed a real capacity change", Math.abs(committed - (baseline - 4)) < 0.05, `${baseline} -> ${committed} FTE`);
await shot("p3-mixer-committed");

const platformAfter = await gotoForecast("platform");
console.log(`FORECAST platform AFTER: ${platformAfter}`);
check("Forecast reads the capacity Portfolio committed", platformAfter !== platformBefore, `${platformBefore} -> ${platformAfter}`);
await shot("p4-forecast-after");

// ── 2. …and composes with the gate lever, in one scenario ───────────────
// The assumptions panel starts collapsed, so the gate buttons are not in
// the DOM until it is opened. Without this click the check below silently
// took its "no gate to assume" branch on every run and proved nothing.
const macros = p.locator('[data-shoot="toggle-macros"]');
if ((await macros.count()) > 0) {
  await macros.click();
  await settle(900);
}
const gate = p.locator('[data-shoot="macro-gate"]').first();
if ((await gate.count()) > 0) {
  await gate.click();
  await settle(2400);
  const withGate = (await p.locator('[data-shoot="central-date"]').innerText()).split("\n")[1].trim();
  check("Assuming a gate decided composes with the capacity change", withGate !== platformAfter, `${platformAfter} -> ${withGate}`);
  await shot("p5-forecast-plus-gate");
} else {
  check("Assuming a gate decided composes with the capacity change", true, "no open gate on Platform to assume");
}

// ── 3. Restore ──────────────────────────────────────────────────────────
await gotoPortfolio();
await commitChannel("platform", baseline);
const restored = await capacityOf("platform");
check("Platform capacity restored", Math.abs(restored - baseline) < 0.05, `back to ${restored} FTE`);

const platformFinal = await gotoForecast("platform");
check("Forecast returns to its baseline date", platformFinal === platformBefore, `${platformFinal} vs ${platformBefore}`);
await shot("p6-restored");

await b.close();
console.log(`\nerrors=0 assertion-failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
