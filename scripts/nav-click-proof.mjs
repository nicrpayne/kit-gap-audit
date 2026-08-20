// EVERY RAIL ENTRY MUST ACTUALLY GO SOMEWHERE.
//
// This exists because Portfolio once stopped navigating. A parent with
// children had been rendered as an inert heading — to avoid two <a> to the
// same href — and the result looked identical to every other rail entry
// while doing nothing when clicked. Nothing in the suite noticed, because
// every other check asked "is the destination list right?" rather than
// "does clicking it work?".
//
// So this asserts the crude thing: click each entry, and require the URL to
// actually become that route. Two links to one href is fine (Portfolio and
// Capacity are two names for the mixer); a labelled row that goes nowhere
// is not.
//
//   node scripts/nav-click-proof.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();

await p.goto(`${BASE}/control-room`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForSelector('[data-shoot="instrument-rail"]', { timeout: 90000 });
await p.waitForTimeout(2000);

const entries = () =>
  p.$$eval('[data-shoot="instrument-rail"] a', (as) =>
    as.map((a) => ({ label: a.dataset.railEntry ?? a.innerText.trim(), href: a.getAttribute("href") }))
  );

// ── THE RACK IS CLOSED AT REST ─────────────────────────────────────────
// Capacity, Scope and Dependencies are instruments inside Portfolio, not
// top-level destinations. Standing anywhere else, they must not be in the
// rail at all — hidden by CSS would still leave them tabbable and would
// still tell a screen reader they are peers of Control Room.
const NESTED = ["Capacity", "Scope", "Dependencies"];
const atRest = await entries();
check(
  "At rest the rail shows only top-level destinations",
  NESTED.every((n) => !atRest.some((e) => e.label === n)),
  atRest.map((e) => e.label).join(" · ")
);
check("Portfolio is one of them", atRest.some((e) => e.label === "Portfolio"));

// ── OPENING PORTFOLIO MOUNTS ITS INSTRUMENTS ───────────────────────────
await p.click('[data-shoot="instrument-rail"] a[data-rail-entry="Portfolio"]', { timeout: 25000 });
await p.waitForURL("**/portfolio", { timeout: 60000 }).catch(() => {});
await p.waitForTimeout(1400); // let the spring settle
const opened = await entries();
check(
  "Opening Portfolio reveals Capacity, Scope and Dependencies",
  NESTED.every((n) => opened.some((e) => e.label === n)),
  opened.map((e) => e.label).join(" · ")
);
check("…and the rack is actually rendered", (await p.locator('[data-shoot="rail-rack"]').count()) === 1);

// ── THE STATE FOLLOWS THE ROUTE, NOT A CLICK ───────────────────────────
// A pasted link and a refresh have to agree with a click about whether you
// are inside Portfolio. This is the check that a stored open/closed flag
// would fail.
for (const deep of ["/scope", "/orbit", "/portfolio"]) {
  await p.goto(`${BASE}${deep}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await p.waitForSelector('[data-shoot="instrument-rail"]', { timeout: 90000 });
  await p.waitForTimeout(1400);
  const e = await entries();
  check(`Landing directly on ${deep} opens the rack`, NESTED.every((n) => e.some((x) => x.label === n)));
}
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-shoot="instrument-rail"]', { timeout: 90000 });
await p.waitForTimeout(1600);
const refreshed = await entries();
check(
  "…and it survives a refresh",
  NESTED.every((n) => refreshed.some((x) => x.label === n)),
  refreshed.map((e) => e.label).join(" · ")
);

// ── LEAVING COLLAPSES IT ───────────────────────────────────────────────
await p.goto(`${BASE}/timeline`, { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForSelector('[data-shoot="instrument-rail"]', { timeout: 90000 });
await p.waitForTimeout(1400);
const left = await entries();
check(
  "Navigating to another destination collapses the rack",
  NESTED.every((n) => !left.some((e) => e.label === n)),
  left.map((e) => e.label).join(" · ")
);

// Every entry that can be reached, with Portfolio open so the nested ones
// are in scope for the click test below.
await p.goto(`${BASE}/portfolio`, { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForSelector('[data-shoot="instrument-rail"]', { timeout: 90000 });
await p.waitForTimeout(1400);
const rows = await entries();
check("The rail renders its destinations", rows.length >= 8, `${rows.length} entries`);

// A row carrying a visible label but no link is the exact defect this file
// was written for: it reads as a destination and behaves as decoration.
const inert = await p.$$eval('[data-shoot="instrument-rail"] > div', (ds) =>
  ds
    .filter((d) => {
      const labelled = [...d.children].find((c) => c.tagName !== "A" && c.innerText?.trim());
      return labelled && !labelled.querySelector("a");
    })
    .map((d) => d.innerText.trim().split("\n")[0])
);
check("No labelled rail row is inert", inert.length === 0, inert.join(", ") || "none");

// Warm every route first: a cold dev-server compile can outlast the click
// wait and look like a navigation failure when it is only a slow build.
for (const { href } of rows) {
  await p.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 180000 }).catch(() => {});
}

for (const { label, href } of rows) {
  // Where to start from matters. A nested instrument only exists in the DOM
  // while the Portfolio rack is open, so reaching it from /control-room is
  // not a navigation failure — it is the rack being correctly closed. Start
  // nested entries from inside Portfolio and everything else from outside
  // it, which is also how a person would arrive at each.
  const from = NESTED.includes(label) ? "/portfolio" : "/control-room";
  await p.goto(`${BASE}${from}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForSelector('[data-shoot="instrument-rail"]', { timeout: 90000 });
  await p.waitForTimeout(1400);
  const want = href === "/" ? "/control-room" : href;
  await p
    .locator(`[data-shoot="instrument-rail"] a[href="${href}"]`)
    .filter({ hasText: label.split(" ")[0] })
    .first()
    .click({ timeout: 25000 })
    .catch((e) => console.log(`   click error: ${e.message.slice(0, 70)}`));
  await p.waitForURL(`**${want}`, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(600);
  const got = new URL(p.url()).pathname;
  check(`Clicking "${label}" goes to ${want}`, got === want, got);
}

await b.close();
console.log(failures === 0 ? "\nEVERY RAIL ENTRY NAVIGATES" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
