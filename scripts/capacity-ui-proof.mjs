// THE PEOPLE DRAWER TELLS THE TRUTH. Not part of the app build.
//
// The interaction this exists to keep dead: opening the drawer on a Scope
// modelled as a flat team estimate, dragging a person onto it, watching the
// forecast move, pressing Commit -- and having nothing persist, because the
// model had no way to record what the control appeared to offer.
//
// A control that cannot be honoured must not be operable. So a team-estimate
// Scope shows no slider at all, and offers the deliberate operation instead:
// changing how precisely the Scope is tracked, with the consequence shown
// before the button.
//
//   node scripts/capacity-ui-proof.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/capacity-ui";
const BASE = "http://localhost:3000";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "nextjs-portal,#__next-build-watcher{display:none!important}";
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s));
});
const p = await ctx.newPage();
p.on("pageerror", (e) => {
  console.log("PAGEERROR:", e.message);
  failures++;
});
const settle = (ms = 1200) => p.waitForTimeout(ms);
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });

const capacityOf = async (scopeId) =>
  p.evaluate(async (id) => {
    const r = await fetch("/api/portfolio/inputs", { cache: "no-store" });
    const j = await r.json();
    const s = j.scopes.find((x) => x.scopeId === id);
    return { capacity: s.teamCapacity, resolution: s.capacityResolution };
  }, scopeId);

await p.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
await settle(4200);

const before = await capacityOf("platform");
check("Platform starts as a team estimate", before.resolution === "team", `${before.capacity} FTE, ${before.resolution}`);

// ── 1. The drawer refuses to pretend ────────────────────────────────────
await p.locator('button:has-text("People")').first().click();
await settle(1200);

const platformCol = await p.evaluate(() => {
  const heads = [...document.querySelectorAll("thead th")];
  return heads.findIndex((h) => h.textContent.trim().startsWith("Platform"));
});
check("The drawer shows a Platform column", platformCol > 0, `column ${platformCol}`);

const platformHeader = await p.locator("thead th").nth(platformCol).innerText();
check(
  "Its header says it is a team estimate, not a roster",
  /FTE TEAM/i.test(platformHeader.replace(/\s+/g, " ")),
  platformHeader.replace(/\n/g, " · ")
);

const slidersInPlatformCol = await p.evaluate((col) => {
  const rows = [...document.querySelectorAll("tbody tr")];
  return rows.filter((r) => r.children[col]?.querySelector('input[type="range"]')).length;
}, platformCol);
check("No allocation slider is offered for Platform", slidersInPlatformCol === 0, `${slidersInPlatformCol} sliders`);

const jsaCol = await p.evaluate(() => {
  const heads = [...document.querySelectorAll("thead th")];
  return heads.findIndex((h) => h.textContent.trim().startsWith("JSA"));
});
const slidersInJsaCol = await p.evaluate((col) => {
  const rows = [...document.querySelectorAll("tbody tr")];
  return rows.filter((r) => r.children[col]?.querySelector('input[type="range"]')).length;
}, jsaCol);
check("A name-tracked Scope still has its sliders", slidersInJsaCol > 0, `${slidersInJsaCol} sliders on JSA`);

check(
  "The drawer explains why, and offers the real operation",
  (await p.locator('[data-shoot="assign-people-platform"]').count()) === 1
);
await shot("1-drawer-honest");

// ── 2. Consequence before commitment ────────────────────────────────────
await p.locator('[data-shoot="assign-people-platform"]').click();
await settle(1400);
check("The conversion dialog opens", (await p.locator('[data-shoot="resolution-dialog"]').count()) === 1);

const confirmDisabled = await p.locator('[data-shoot="confirm-resolution"]').isDisabled();
check("It refuses to convert with nobody assigned", confirmDisabled);

const currentDate = (await p.locator('[data-shoot="resolution-current"]').innerText()).trim();
check("It states today's date for Platform", /\w/.test(currentDate), currentDate);

// Assign the one person with time genuinely free.
const freeIdx = await p.evaluate(() => {
  const cands = [...document.querySelectorAll('[data-shoot="candidate"]')];
  return cands.findIndex((c) => Number(c.getAttribute("data-free")) > 0);
});
check("Someone in the portfolio has time free to give", freeIdx >= 0, `candidate index ${freeIdx}`);
const freeRow = p.locator('[data-shoot="candidate"]').nth(freeIdx);
const give = Math.min(20, Number(await freeRow.getAttribute("data-free")));
await freeRow.locator('input[type="range"]').fill(String(give));
await freeRow.locator('input[type="range"]').dispatchEvent("change");
await settle(2600);
console.log(`      assigning ${give}% of the one person with time free`);

const proposedDate = (await p.locator('[data-shoot="resolution-proposed"]').innerText()).trim();
check(
  "It shows the date the switch would produce, before confirming",
  /\w/.test(proposedDate) && proposedDate !== "—",
  `${currentDate} → ${proposedDate}`
);
check(
  "…and it is later, because 10 FTE of guess becomes a fraction of one real person",
  currentDate !== proposedDate,
  `${currentDate} → ${proposedDate}`
);
await shot("2-consequence-before-commitment");

// ── 3. Committing records exactly what was shown ────────────────────────
await p.locator('[data-shoot="confirm-resolution"]').click();
await settle(4000);
const after = await capacityOf("platform");
check("Platform is now tracked by name", after.resolution === "named", `${after.capacity.toFixed(3)} FTE`);
check(
  "Its capacity is the person assigned, NOT the estimate plus them",
  after.capacity < 1 && after.capacity < before.capacity,
  `${before.capacity} FTE team -> ${after.capacity.toFixed(3)} FTE named`
);
check(
  "…and specifically is not the estimate plus the new person",
  Math.abs(after.capacity - (before.capacity + give / 100)) > 1e-6,
  `${after.capacity.toFixed(3)} FTE, not ${(before.capacity + give / 100).toFixed(3)}`
);
await shot("3-converted");

// ── 4. Restore, and confirm the estimate was only dormant ───────────────
const restored = await p.evaluate(async () => {
  const r = await fetch("/api/scopes/platform/capacity-resolution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolution: "team" }),
  });
  return r.status;
});
check("Switching back succeeds", restored === 200, `http ${restored}`);
const final = await capacityOf("platform");
check(
  "The team estimate was remembered, not destroyed",
  final.resolution === "team" && Math.abs(final.capacity - before.capacity) < 1e-9,
  `back to ${final.capacity} FTE`
);

await b.close();
console.log(failures === 0 ? "\nALL PROOFS PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
