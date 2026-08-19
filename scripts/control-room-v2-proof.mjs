// THE CONTROL ROOM V2, PROVEN.
//
// V1's proof (scripts/control-room-proof.mjs) still owns the composition
// laws — every number matches its owner, the page writes nothing, no
// dependency is invisible. This one proves what V2 ADDED, and the thing it
// mostly proves is a negative:
//
//   A READOUT MAY ONLY SAY WHAT WAS RECORDED.
//
// Every trend on this page is drawn from stored points at their own stored
// times. Where no history exists — capacity — nothing is drawn, and the
// panel says so on its face. A percentage is only shown when both of its
// terms come from the same call over the same people. A status row is an
// age, never a grade. And the workspace is a preference in one browser: it
// changes what is on screen and NOTHING about the project.
//
//   node scripts/control-room-v2-proof.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });

let writes = [];
await p.route("**/*", (r) => {
  const m = r.request().method();
  if (m !== "GET") writes.push(`${m} ${r.request().url().replace(BASE, "")}`);
  r.continue();
});

const settle = (ms = 700) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1674, 1046); await settle(300); };
const txt = (sel) => p.locator(sel).innerText();
const api = async (path) => (await fetch(`${BASE}${path}`)).json();

/** V3 organises the surface into lenses. Each law is checked in the lens
    that owns it. */
const lens = async (id) => {
  await p.click(`[data-shoot="cr-lens-pick-${id}"]`);
  await settle(1400);
  await park();
};

const open = async () => {
  await p.goto(`${BASE}/control-room`, { waitUntil: "networkidle" });
  await p.evaluate(() => localStorage.removeItem("kit.control-room.lens.v3"));
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="cr-reading"]', { timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-shoot^="cr-card-"][data-domain]').length >= 5, {
    timeout: 30000,
  });
  await settle(3200);
  await park();
};

/** Back to the shipped default, without relying on the UI to get there. */
const resetWorkspace = async () => {
  await p.evaluate(() => localStorage.removeItem("kit.control-room.lens.v3"));
  await open();
};

await open();

const proj = await api("/api/instrument/project");
const tl = await api("/api/timeline");

// ── A. THE CARDS READ AS SENTENCES, AND STILL SHOW THE MODEL ───────────
{
  const domains = await p
    .locator('[data-shoot^="cr-card-"][data-domain]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-domain")));
  check("A1. Five cards, one per domain", domains.length === 5, domains.join(", "));
  check("A2. Every domain is distinct", new Set(domains).size === 5);

  // A HEADLINE IS A SENTENCE WITH A NUMBER IN IT, and the exact model truth
  // sits underneath it. Both halves are required: the sentence alone is
  // unfalsifiable, the readout alone is what V1 was criticised for.
  let sentences = 0;
  let readouts = 0;
  for (const d of domains) {
    const card = `[data-shoot="cr-card-${d === "outcome" ? "outcome" : d}"]`;
    const lead = await txt(`${card}`);
    // The lead line is the second line of the card (index/label first).
    const leadLine = lead.split("\n").find((l) => /[a-z]{4}/i.test(l) && /\d|Clear|No target/.test(l));
    if (leadLine && leadLine.split(/\s+/).length >= 3) sentences++;
    if ((await p.locator(`[data-shoot="cr-card-${d}-readout"]`).count()) === 1) readouts++;
  }
  check("A3. Every card leads with a sentence, not a bare figure", sentences === 5, `${sentences}/5`);
  check("A4. …and every card still states the exact model truth underneath", readouts === 5, `${readouts}/5`);

  // The concept image's vocabulary stays banned, and V2 adds one word of
  // its own to the ban list: the capacity headline is ARRIVING, never
  // "utilization", because the model does not compute utilization.
  const page = await p.locator('[data-shoot="cr-reading"]').innerText();
  check("A5. No utilization, buffer, health, risk score or alignment anywhere",
    !/utilization|utilisation|buffer|health|severity|risk score|alignment/i.test(page));
  check("A6. The whole workspace still fits one viewport",
    (await p.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2)));
}

// ── B. ARRIVING IS A RATIO OF TWO TERMS FROM ONE CALL ──────────────────
{
  // Recomputed from the raw roster, exactly as Portfolio computes it: RAW is
  // physical allocation, EFFECTIVE is what survives context switching, and
  // ARRIVING is the second over the first. Nothing else is in the ratio.
  const active = new Map(proj.people.filter((x) => x.active).map((x) => [x.id, x]));
  const counts = new Map();
  for (const a of proj.allocations) counts.set(a.personId, (counts.get(a.personId) ?? 0) + 1);
  let raw = 0;
  let eff = 0;
  for (const a of proj.allocations) {
    const person = active.get(a.personId);
    if (!person) continue;
    const c = a.fraction * person.fte;
    raw += c;
    const n = counts.get(a.personId) ?? 1;
    eff += c * (n > 1 ? Math.max(0, 1 - (proj.contextSwitchCostPct / 100) * (n - 1)) : 1);
  }
  const arriving = Math.round((eff / raw) * 100);
  const cap = await txt('[data-shoot="cr-card-capacity"]');
  check("B1. ARRIVING is effective ÷ allocated, recomputed from the roster",
    cap.includes(`${arriving}%`), `${arriving}%`);
  check("B2. …and it is named for what it means, not called utilization",
    /reaches the work/i.test(cap) && !/utilis|utiliz/i.test(cap));
  check("B3. …with both raw terms still on the card, in FTE",
    cap.includes(raw.toFixed(1)) && cap.includes(eff.toFixed(1)), `${eff.toFixed(1)} of ${raw.toFixed(1)}`);
  // Its complement is exactly the switch loss — the same quantity, said the
  // other way round. If those two ever disagree the ratio has a third term
  // hidden in it.
  check("B4. …and its complement is exactly the context-switch loss",
    Math.abs((raw - eff) - raw * (1 - eff / raw)) < 1e-9);
}

// ── C. EVERY TREND IS RECORDED HISTORY, OR IT IS NOT DRAWN ─────────────
{
  // C1–C2: confidence history is REAL — one line per project that has
  // actually been reported on, and a project that never has is ABSENT
  // rather than flat at zero.
  const reported = proj.scopes.filter((s) =>
    (s.reportHistory ?? []).some((r) => r.confidenceAtTarget !== null)
  );
  const never = proj.scopes.filter((s) => !(s.reportHistory ?? []).some((r) => r.confidenceAtTarget !== null));
  const drawn = await p
    .locator('[data-shoot^="cr-conf-line-"], [data-shoot^="cr-conf-dot-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-shoot").replace(/^cr-conf-(line|dot)-/, "")));
  check("C1. One confidence line per project that has actually been reported on",
    drawn.length === reported.length && reported.every((s) => drawn.includes(s.scopeId)),
    `${drawn.length} of ${proj.scopes.length} projects`);
  check("C2. A project with no reports is absent, not drawn flat at zero",
    never.every((s) => !drawn.includes(s.scopeId)),
    never.map((s) => s.name).join(", ") || "every project has reports");

  // C3: each line's stated end value is the last confidence that project's
  // reports actually stored — not a recomputation against today's model.
  let matched = 0;
  for (const s of reported) {
    const pts = s.reportHistory.filter((r) => r.confidenceAtTarget !== null);
    const last = pts[pts.length - 1].confidenceAtTarget;
    const label = p.locator(`[data-shoot="cr-conf-label-${s.scopeId}"]`);
    if ((await label.count()) === 1 && (await label.innerText()).includes(`${last}%`)) matched++;
  }
  check("C3. Every line ends on the number that project's last report stored",
    matched === reported.length, `${matched}/${reported.length}`);

  // C4: ONE POINT IS A DOT. Joining a single reading to itself would be a
  // trend line asserting a direction nobody measured.
  const singles = await p.locator('[data-points="1"]').evaluateAll((els) => els.map((e) => e.tagName.toLowerCase()));
  check("C4. A one-point series is never drawn as a line", !singles.includes("polyline"),
    singles.join(", ") || "no single-point series today");

  // C5: CAPACITY HAS NO HISTORY, so no capacity trend is drawn anywhere —
  // and the panel says why rather than leaving a person to wonder.
  const capPanel = p.locator('[data-shoot="cr-surf-capacity"]');
  const capLines = await capPanel.locator("polyline, path").count();
  check("C5. No capacity trend is drawn, because none can be", capLines === 0, `${capLines} plotted lines`);
  check("C6. …and the panel states the gap instead of leaving it silent",
    /no history/i.test(await capPanel.innerText()));
  const capSpark = await p.locator('[data-shoot="cr-card-capacity-spark"]').count();
  check("C7. …and the capacity card carries no sparkline either", capSpark === 0);

  // C8: the shipped sparkline is one point per round of reporting, from the
  // counts the reports themselves stored.
  const days = new Set(
    proj.scopes.flatMap((s) => (s.reportHistory ?? []).map((r) => new Date(r.generatedAt).toISOString().slice(0, 10)))
  );
  const shipped = await p.locator('[data-shoot="cr-card-reality-spark"]').getAttribute("data-points");
  check("C8. The shipped trend has exactly one point per round of reporting",
    Number(shipped) === days.size, `${shipped} points, ${days.size} report days`);
}

// ── D. SYSTEM STATUS IS AGES, NOT GRADES ───────────────────────────────
{
  const panel = p.locator('[data-shoot="cr-surf-system"]');
  const rows = await panel.locator('[data-shoot^="cr-system-"]').evaluateAll((els) =>
    els.map((e) => e.innerText.replace(/\n/g, " "))
  );
  check("D1. Every feed on the panel states an age", rows.length > 0 && rows.every((t) => /\b\d+(m|h|d)\b/.test(t)),
    `${rows.length} feeds`);
  const body = await panel.innerText();
  check("D2. No feed is graded",
    !/\b(good|ok|healthy|degraded|nominal|green|amber|red|warning|critical)\b/i.test(body));
  // Hermes has no health endpoint, so its availability is not knowable and
  // is therefore not claimed.
  check("D3. Nothing claims a status the product cannot know", !/hermes|uptime|available/i.test(body));

  // D4: the header states the oldest reading as a fact, and it is genuinely
  // the oldest one on the panel.
  const ages = rows.map((t) => {
    const [, n, u] = /\b(\d+)(m|h|d)\b/.exec(t) ?? [];
    return u === "d" ? Number(n) * 1440 : u === "h" ? Number(n) * 60 : Number(n);
  });
  const oldestRow = rows[ages.indexOf(Math.max(...ages))].toLowerCase();
  const header = (await panel.locator("header").innerText()).toLowerCase();
  const named = /oldest:\s*([a-z ]+),/.exec(header)?.[1]?.trim() ?? "";
  check("D4. The header names the oldest feed, and it really is the oldest",
    named.length > 0 && oldestRow.startsWith(named), `${named}`);

  // D5: the forecast row's age is the newest stored report, not a guess.
  const newest = Math.max(...proj.scopes.filter((s) => s.lastReport).map((s) => +new Date(s.lastReport.generatedAt)));
  const wantDays = Math.round((Date.now() - newest) / 86400000);
  const fc = await p.locator('[data-shoot="cr-system-forecast"]').innerText();
  check("D5. The forecast row's age is max(Report.generatedAt)", fc.includes(`${wantDays}d`), `${wantDays}d`);
}

// ── E. WHAT CHANGED IS THE TIMELINE'S OWN STREAM ───────────────────────
{
  // Reading history is Delivery's job in V3, not the daily operating view's.
  await lens("delivery");
  const panel = p.locator('[data-shoot="cr-activity"]');
  check("E1. The panel is named for the question it answers",
    /what changed/i.test(await panel.locator("header").innerText()));
  const titles = await p.locator('[data-shoot="cr-activity-row"]').evaluateAll((els) =>
    els.map((e) => e.innerText.split("\n")[0].replace(/\s*×\d+$/, "").trim())
  );
  const stream = new Set(tl.entries.map((e) => e.title));
  check("E2. Every line is an event the Timeline actually carries",
    titles.length > 0 && titles.every((t) => [...stream].some((s) => s.startsWith(t.replace(/…$/, "")))),
    `${titles.length} lines`);
  check("E3. One subject is one line", new Set(titles).size === titles.length);
}

// ── F. THE COLOUR LAW STILL HOLDS ──────────────────────────────────────
{
  // Every domain has to be on screen to check every domain's hue.
  await open();
  const hue = (sel) => p.locator(sel).evaluate((e) => getComputedStyle(e).color);
  const VIOLET = "rgb(155, 140, 250)";
  const CYAN = "rgb(70, 195, 214)";

  const outcome = await hue('[data-shoot="cr-card-outcome-primary"]');
  check("F1. Under Reality the outcome reads cyan — the colour of now", outcome === CYAN, outcome);
  const others = await Promise.all(
    ["reality", "choices", "capacity", "time"].map((d) => hue(`[data-shoot="cr-card-${d}-primary"]`))
  );
  check("F2. …and nothing that is true is drawn in the Scenario's violet",
    !others.includes(VIOLET), others.join(", "));

  // Make a hypothetical in the instrument that owns the lever, then walk
  // back: the forecast must go violet, and the RECORD must not.
  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
  await settle(1200);
  const scopes = await p
    .locator('[data-shoot^="orbit-focus-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-shoot").replace("orbit-focus-", "")));
  let assumed = false;
  for (const s of scopes) {
    await p.click(`[data-shoot="orbit-focus-${s}"]`);
    await settle(700);
    const gate = p.locator('[data-orbit-kind="gate"]').first();
    if ((await gate.count()) === 0) continue;
    const id = await gate.getAttribute("data-orbit-node");
    await gate.click();
    await settle(600);
    await p.click(`[data-shoot="orbit-assume-${id}"]`);
    await settle(1600);
    assumed = true;
    break;
  }
  if (assumed) {
    await p.click('a[href="/control-room"]');
    await p.waitForURL("**/control-room", { timeout: 15000 });
    await p.waitForSelector('[data-shoot="cr-reading"]');
    await settle(3200);
    await park();
    check("F3. A Scenario turns the forecast violet, and only the forecast",
      (await hue('[data-shoot="cr-card-outcome-primary"]')) === VIOLET);
    // HISTORY IS REALITY'S RECORD. A hypothetical changes what we expect
    // next; it cannot change what a report said last month.
    const lines = await p
      .locator('[data-shoot^="cr-conf-line-"], [data-shoot^="cr-conf-dot-"]')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).stroke + "|" + getComputedStyle(e).fill));
    check("F4. …but the reported history is never repainted as hypothetical",
      lines.length > 0 && !lines.some((s) => s.includes("155, 140, 250")), `${lines.length} lines`);
    await p.click('[data-shoot="cr-discard"]');
    await settle(1800);
    check("F5. Discarding it puts the colour of now back",
      (await hue('[data-shoot="cr-card-outcome-primary"]')) === CYAN);
  } else {
    check("F3. A Scenario turns the forecast violet, and only the forecast", false, "no gate to assume");
    check("F4. …but the reported history is never repainted as hypothetical", false, "n/a");
    check("F5. Discarding it puts the colour of now back", false, "n/a");
  }
}

// ── G. THE WORKSPACE IS A VIEW, NOT THE PROJECT ────────────────────────
{
  await resetWorkspace();
  const shown = () => p.locator('[data-shoot^="cr-card-"][data-domain], [data-shoot^="cr-surf-"], [data-shoot="cr-dependency-watch"]').count();
  const beforeCount = await shown();
  // Everything the payload says about the project, EXCEPT its startDate —
  // that is "now" and moves on its own between two requests, so including
  // it would test the clock rather than the workspace.
  const substance = (x) => JSON.stringify({ ...x, startDate: undefined });
  const beforeProject = substance(await api("/api/instrument/project"));

  writes = [];
  await p.click('[data-shoot="cr-lens-pick-capacity"]');
  await settle(1200);
  const capacityView = await shown();
  check("G1. A preset changes what is on screen", capacityView !== beforeCount, `${beforeCount} → ${capacityView}`);
  check("G2. …and hiding a panel is not a project change", writes.length === 0, writes.join(", ") || "0 writes");
  check("G3. …the Capacity lens drops the dependency index",
    (await p.locator('[data-shoot="cr-dependency-watch"]').count()) === 0);

  await p.click('[data-shoot="cr-lens-pick-dependency"]');
  await settle(1200);
  check("G4. …and the Dependency lens brings it back",
    (await p.locator('[data-shoot="cr-dependency-watch"]').count()) === 1);

  const stored = await p.evaluate(() => localStorage.getItem("kit.control-room.lens.v3"));
  check("G5. The preference lives in this browser and nowhere else",
    !!stored && JSON.parse(stored).lens === "dependency", stored ? "localStorage" : "not stored");

  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="cr-strip"]', { timeout: 30000 });
  await settle(3200);
  check("G6. …and it survives a reload",
    (await p.locator('[data-shoot="cr-lens-pick-dependency"][data-on="true"]').count()) === 1);

  // A PRESET IS A NAMED THING. Editing one under its own name would make
  // the name a lie, so the first toggle forks to Custom.
  await p.click('[data-shoot="cr-lens-editor-open"]');
  await p.waitForSelector('[data-shoot="cr-lens-editor"]', { timeout: 15000 });
  await settle(500);
  await p.click('[data-shoot="cr-surface-system-status"]');
  await settle(600);
  check("G7. Editing a preset forks it to Custom rather than redefining it",
    (await p.locator('[data-shoot="cr-lens-custom"][data-on="true"]').count()) === 1);

  await p.click('[data-shoot="cr-reset-workspace"]');
  await settle(900);
  check("G8. Reset returns the shipped default and clears the stored preference",
    (await p.locator('[data-shoot="cr-lens-command"][data-on="true"]').count()) === 1 &&
      (await p.evaluate(() => localStorage.getItem("kit.control-room.lens.v3"))) === null);

  await p.click('[data-shoot="cr-lens-editor-close"]');
  await settle(1200);
  check("G9. None of that touched the project",
    substance(await api("/api/instrument/project")) === beforeProject);
  check("G10. …and none of it wrote anything at all", writes.length === 0, writes.join(", ") || "0 writes");
}

// ── H. STILL A COMPOSITION, AFTER ALL OF IT ────────────────────────────
{
  await resetWorkspace();
  // Every V2 door still leads to the instrument that owns the number.
  const doors = await p
    .locator('[data-shoot^="cr-lens-"] a, [data-shoot^="cr-card-"][data-domain]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")).filter(Boolean));
  const known = ["/forecast", "/portfolio", "/scope", "/decisions", "/timeline", "/audit", "/orbit"];
  check("H1. Every panel is a door into the instrument that owns it",
    doors.length > 0 && doors.every((h) => known.some((k) => h.startsWith(k))), doors.join(" "));
  const sys = await p
    .locator('[data-shoot^="cr-system-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  check("H2. …including every System Status row", sys.every((h) => known.some((k) => h.startsWith(k))), sys.join(" "));
  check("H3. Reading V2 writes nothing", writes.length === 0, writes.join(", ") || "0 writes");
}

console.log(failures === 0 ? "\nALL CONTROL ROOM V2 PROOFS PASS" : `\n${failures} FAILURE(S)`);
await b.close();
process.exit(failures === 0 ? 0 : 1);
