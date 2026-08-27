// SIGNAL AUDIT — INTERACTION PROOFS.
//
// The laws the model proof cannot reach, because they are about what is on
// screen and what a person can do to it:
//
//   A  calm at rest — nothing is shouting before you touch anything
//   B  hover is a preview, not an investigation
//   C  selection focuses: the finding dominates, unrelated signal dims
//   D  Evidence Solo lights ONLY the lanes the provenance runs through
//   E  B · Candidate is visibly unsaved, and writes nothing
//   F  the sweep's trail follows the scan edge
//   G  every finding is keyboard reachable and has an accessible name
//   H  Escape leaves a selection, and drops solo and candidate with it
//   I  the trust boundary is present at rest, not only beside a button
//   J  no page scroll at the target viewport
//   K  a scope with nothing supplying it renders honestly
//
//   node scripts/audit-proof.mjs
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// The session cookie is SHA-256("kit-gap-audit::" + APP_PASSWORD). The
// default below is that hash for the local dev password "dev" — not a
// secret, and overridable with KIT_SESSION for any other environment.
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const VIEWPORT = { width: 1600, height: 1000 };
const db = new PrismaClient();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: VIEWPORT });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
const pageErrors = [];
p.on("pageerror", (e) => pageErrors.push(e.message));

const settle = (ms = 600) => p.waitForTimeout(ms);
const park = async () => {
  await p.mouse.move(VIEWPORT.width - 8, VIEWPORT.height - 8);
  await settle(300);
};

await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="truth-map"]', { timeout: 30000 });
await settle(1200);
await park();

// ── A. CALM AT REST ──────────────────────────────────────────────────
const restOpacities = await p.evaluate(() =>
  [...document.querySelectorAll("[data-lane]")].map((g) =>
    parseFloat(g.querySelector("path")?.getAttribute("opacity") ?? "1")
  )
);
check(
  "A1 every lane is quiet at rest",
  restOpacities.length > 0 && restOpacities.every((o) => o <= 0.6),
  `max ${Math.max(...restOpacities).toFixed(2)} — Tier 2 is 30–55%`
);
const structure = await p.evaluate(() => {
  const g = [...document.querySelectorAll('[data-shoot="truth-map"] > g')].find(
    (el) => parseFloat(el.getAttribute("opacity") ?? "1") < 0.25
  );
  return g ? parseFloat(g.getAttribute("opacity")) : null;
});
check("A2 structure sits under 25%", structure !== null && structure <= 0.25, `${structure}`);
check(
  "A3 the review console is slim at rest",
  (await p.locator('[data-shoot="review-console-rest"]').count()) === 1
);
check(
  "A4 the inspector shows the overview, not a finding",
  (await p.locator('[data-shoot="inspector-overview"]').count()) === 1
);

// ── I. THE TRUST BOUNDARY IS PRESENT AT REST ─────────────────────────
const restText = await p.locator('[data-shoot="review-console-rest"]').innerText();
check(
  "I1 Reality protected is stated with nothing selected",
  /reality protected/i.test(restText) && /without human confirmation/i.test(restText),
  "a promise that only appears beside a button is not a property of the instrument"
);

// ── J. NO PAGE SCROLL ────────────────────────────────────────────────
const scroll = await p.evaluate(() => ({
  x: document.documentElement.scrollWidth - window.innerWidth,
  y: document.documentElement.scrollHeight - window.innerHeight,
}));
check("J1 no page scroll at 1600x1000", scroll.x <= 1 && scroll.y <= 1, JSON.stringify(scroll));

// ── G. KEYBOARD REACH AND ACCESSIBLE NAMES ───────────────────────────
const callouts = await p.evaluate(() =>
  [...document.querySelectorAll(".audit-callout")].map((el) => ({
    tabindex: el.getAttribute("tabindex"),
    label: el.getAttribute("aria-label") ?? "",
    role: el.getAttribute("role"),
  }))
);
check("G1 findings are on screen", callouts.length > 0, `${callouts.length} callouts`);
check(
  "G2 every finding is keyboard reachable",
  callouts.every((c) => c.tabindex === "0" && c.role === "button")
);
check(
  "G3 every finding has an accessible name carrying kind and severity",
  callouts.every((c) => c.label.length > 20 && /critical|high|medium|low/i.test(c.label)),
  "meaning may never be carried by colour alone"
);
// The severity word must survive on screen too, not only in the aria-label.
const visibleSeverities = await p.evaluate(() =>
  [...document.querySelectorAll(".audit-callout")].map((el) => el.innerText.toLowerCase())
);
check(
  "G4 the severity word is visible on every card",
  visibleSeverities.every((t) => /critical|high|medium|low/.test(t))
);

// ── B. HOVER IS A PREVIEW ────────────────────────────────────────────
const firstCallout = p.locator(".audit-callout").first();
await firstCallout.hover();
await settle(450);
check(
  "B1 hover does not open the review console",
  (await p.locator('[data-shoot="review-console-open"]').count()) === 0,
  "hover previews; click investigates"
);
check(
  "B2 hover does not change the inspector",
  (await p.locator('[data-shoot="inspector-overview"]').count()) === 1
);
await park();

// ── C. SELECTION FOCUSES ─────────────────────────────────────────────
const critical = p.locator('[data-shoot^="finding-"][data-tier="critical"]').first();
await critical.locator(".audit-callout").click();
await settle(700);

check(
  "C1 the review console expands",
  (await p.locator('[data-shoot="review-console-open"]').count()) === 1
);
check(
  "C2 the inspector becomes specific to the finding",
  (await p.locator('[data-shoot="inspector-finding"]').count()) === 1
);
const selectedOpacity = await p.evaluate(() => {
  const sel = document.querySelector('[data-shoot^="finding-"][data-selected="true"]');
  return sel ? parseFloat(sel.getAttribute("opacity") ?? "1") : null;
});
const otherOpacities = await p.evaluate(() =>
  [...document.querySelectorAll('[data-shoot^="finding-"]:not([data-selected="true"])')].map((g) =>
    parseFloat(g.getAttribute("opacity") ?? "1")
  )
);
check("C3 the selected finding is fully lit", selectedOpacity === 1, `${selectedOpacity}`);
check(
  "C4 unrelated findings dim",
  otherOpacities.length > 0 && otherOpacities.every((o) => o < 0.4),
  `max ${Math.max(...otherOpacities).toFixed(2)}`
);

// ── D. EVIDENCE SOLO LIGHTS ONLY THE PROVENANCE ──────────────────────
const findingId = await p.evaluate(
  () => document.querySelector('[data-shoot^="finding-"][data-selected="true"]')?.getAttribute("data-shoot")?.replace("finding-", "") ?? null
);
const truth = await (await fetch(`${BASE}/api/audit/truth?scope=jsa`, { headers: { Cookie: `kit_session=${COOKIE}` } })).json();
const selectedModel = truth.model.findings.find((f) => f.id === findingId);
const expectedLanes = new Set([selectedModel.laneId, ...selectedModel.relatedLaneIds]);

await p.locator('[data-shoot="evidence-solo-toggle"]').click();
await settle(650);
const routeLanes = await p.evaluate(
  () => document.querySelectorAll("[data-solo-lane]").length
);
check("D1 a provenance route is drawn", routeLanes > 0, `${routeLanes} lane(s)`);
check(
  "D2 the route covers exactly the finding's own lane plus its provenance lanes",
  routeLanes === expectedLanes.size,
  `${routeLanes} drawn, ${expectedLanes.size} expected (${[...expectedLanes].join(", ")})`
);
const dimmedLanes = await p.evaluate(() =>
  [...document.querySelectorAll("[data-lane]")].map((g) => ({
    id: g.getAttribute("data-lane"),
    o: parseFloat(g.querySelector("path")?.getAttribute("opacity") ?? "1"),
  }))
);
const unrelated = dimmedLanes.filter((l) => !expectedLanes.has(l.id));
check(
  "D3 every lane the provenance does NOT run through fades hard",
  unrelated.every((l) => l.o <= 0.1),
  `max ${Math.max(...unrelated.map((l) => l.o)).toFixed(3)}`
);
check(
  "D4 the route is drawn through the network, not as a detached branch",
  await p.evaluate(() => {
    const route = document.querySelector('[data-shoot="evidence-solo-route"]');
    const lanePaths = new Set(
      [...document.querySelectorAll("[data-lane] path")].map((el) => el.getAttribute("d"))
    );
    const routePaths = [...(route?.querySelectorAll("path") ?? [])];
    return routePaths.length > 0 && routePaths.every((el) => lanePaths.has(el.getAttribute("d")));
  }),
  "the highlighted path must be geometry the lane already occupies"
);

// ── E. CANDIDATE REALITY IS VISIBLY UNSAVED AND WRITES NOTHING ───────
const before = {
  findings: await db.finding.count(),
  decisions: await db.decision.count(),
  sources: await db.source.count(),
};
await p.locator('[data-shoot="mode-B"]').click();
await settle(650);
const coreText = await p.evaluate(
  () => document.querySelector('[data-shoot="reality-core"]')?.textContent ?? ""
);
check("E1 the Reality core enters candidate mode", /candidate/i.test(coreText), coreText.replace(/\n/g, " "));
check("E2 and says it is not saved", /not saved/i.test(coreText));
const consoleText = await p.locator('[data-shoot="review-console-open"]').innerText();
check("E3 the B panel is badged unsaved", /not saved/i.test(consoleText));
await settle(400);
const after = {
  findings: await db.finding.count(),
  decisions: await db.decision.count(),
  sources: await db.source.count(),
};
check(
  "E4 previewing candidate Reality writes NOTHING",
  JSON.stringify(before) === JSON.stringify(after),
  `${JSON.stringify(before)} vs ${JSON.stringify(after)}`
);
await p.locator('[data-shoot="mode-A"]').click();
await settle(400);

// ── H. ESCAPE LEAVES A SELECTION ─────────────────────────────────────
await p.keyboard.press("Escape");
await settle(650);
check("H1 Escape clears the selection", (await p.locator('[data-shoot="inspector-overview"]').count()) === 1);
check("H2 and collapses the console", (await p.locator('[data-shoot="review-console-rest"]').count()) === 1);
check(
  "H3 and drops Evidence Solo with it",
  (await p.locator('[data-shoot="evidence-solo-route"]').count()) === 0,
  "a hypothetical must not outlive the thing it was about"
);

// ── F. THE SWEEP TRAIL FOLLOWS THE SCAN ──────────────────────────────
await p.locator('[data-shoot="run-audit"]').click();
await settle(700);
const sweep = await p.evaluate(() => {
  const g = document.querySelector('[data-shoot="audit-sweep"]');
  if (!g) return null;
  const heading = parseFloat((g.getAttribute("transform") ?? "").match(/rotate\(([-\d.]+)/)?.[1] ?? "0");
  // Local wedge angles, read back off the drawn geometry rather than assumed.
  const cx = 560, cy = 440;
  const wedges = [...g.querySelectorAll("path")].map((path) => {
    const m = (path.getAttribute("d") ?? "").match(/L ([-\d.]+) ([-\d.]+)/);
    if (!m) return null;
    return (Math.atan2(parseFloat(m[2]) - cy, parseFloat(m[1]) - cx) * 180) / Math.PI;
  }).filter((v) => v !== null);
  return { heading, wedges, opacities: [...g.querySelectorAll("path")].map((el) => parseFloat(el.getAttribute("opacity") ?? "1")) };
});
check("F1 the sweep is running", sweep !== null && sweep.wedges.length > 0);
if (sweep) {
  // Every wedge is drawn at a NEGATIVE local angle, i.e. at headings the
  // scan has already passed. The group rotation then carries them behind
  // the leading edge, whatever the heading is.
  check(
    "F2 every trail wedge is behind the scan edge, not ahead of it",
    sweep.wedges.every((a) => a <= 0.01),
    `local angles ${sweep.wedges.map((a) => a.toFixed(1)).join(", ")}`
  );
  check(
    "F3 the trail fades away from the edge",
    sweep.opacities.every((o, i, arr) => i === 0 || o <= arr[i - 1] + 0.001),
    sweep.opacities.map((o) => o.toFixed(3)).join(" > ")
  );
}
await settle(2400);
await park();

// ── K. AN UNSUPPLIED SCOPE RENDERS HONESTLY ──────────────────────────
await p.goto(`${BASE}/audit?scope=design`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="truth-map"]', { timeout: 30000 });
await settle(1000);
const sparseText = await p.locator('[data-shoot="inspector-overview"]').innerText();
check(
  "K1 an unsupplied Scope names what is not supplying it",
  /not supplying this scope/i.test(sparseText),
  "an unconnected source is project truth, not an empty state to hide"
);
const unsuppliedRows = await p.evaluate(() =>
  [...document.querySelectorAll('[data-shoot^="lane-row-"]')].filter((el) =>
    /not supplied/i.test(el.innerText)
  ).length
);
check("K2 unsupplied lanes say so in the project field", unsuppliedRows > 0, `${unsuppliedRows} rows`);
check(
  "K3 the map still renders with nothing to show",
  (await p.locator('[data-shoot="truth-map"]').count()) === 1
);

check("Z1 no page errors during the whole run", pageErrors.length === 0, pageErrors.join(" | "));

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
await db.$disconnect();
process.exit(failures === 0 ? 0 : 1);
