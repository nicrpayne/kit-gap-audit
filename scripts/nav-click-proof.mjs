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

const rows = await p.$$eval('[data-shoot="instrument-rail"] a', (as) =>
  as.map((a) => ({ label: a.innerText.trim().replace(/\n/g, " "), href: a.getAttribute("href") }))
);
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
  await p.goto(`${BASE}/control-room`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(1000);
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
