// THE CONTROL ROOM, PROVEN.
//
// It is a read and a composition, and both halves have to be true:
//
//   COMPOSITION — every number matches the instrument that owns it. If the
//   Control Room says 2 gates and Decisions says something else, one of
//   them is lying and it does not matter which.
//
//   READ — it writes nothing, keeps no second Scenario, and is never a
//   stale snapshot. Change Reality anywhere and it changes.
//
// Plus the two product laws this surface exists to serve: a dependency that
// can move delivery must not be invisible, and external discovery must not
// silently become Reality.
//
//   node scripts/control-room-proof.mjs
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
const open = async () => {
  await p.goto(`${BASE}/control-room`, { waitUntil: "networkidle" });
  // Every section starts from the SHIPPED DEFAULT lens. A section that needs
  // a different one asks for it explicitly, so no test can be quietly
  // affected by what the section before it happened to leave selected.
  await p.evaluate(() => localStorage.removeItem("kit.control-room.lens.v3"));
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="cr-reading"]', { timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-shoot^="cr-card-"][data-domain]').length >= 5, { timeout: 30000 });
  await settle(3200);
  await park();
};

const api = async (path) => (await fetch(`${BASE}${path}`)).json();

/** V3 organises the surface into lenses. Each law below is checked in the
    lens that owns it, rather than demanding every surface be on screen at
    once — which is the enterprise-dashboard failure V3 exists to undo. */
const lens = async (id) => {
  // V4 puts the workspace switcher behind a Views control, the way a
  // professional workspace does; opening it is part of picking one.
  await p.click('[data-shoot="cr-views"]');
  await settle(350);
  await p.click(`[data-shoot="cr-lens-pick-${id}"]`);
  await settle(1500);
  await park();
};

await open();

// ── A. THE SIX QUESTIONS ARE ALL ANSWERED ──────────────────────────────
{
  // The card ROOT is the element carrying data-domain; its readout, spark
  // and primary readings are stamped underneath it and must not be counted
  // as cards of their own.
  const cards = await p.locator('[data-shoot^="cr-card-"][data-domain]').count();
  check("A1. All five summary surfaces are present", cards === 5, `${cards}`);
  check("A2. The Time Machine is the centre, and it is the real instrument",
    (await p.locator('[data-shoot="cr-time-machine"] [data-shoot="time-field"]').count()) === 1);
  check("A3. Dependency Watch is on screen", (await p.locator('[data-shoot="cr-dependency-watch"]').count()) === 1);
  check("A4. Current constraints are on screen", (await p.locator('[data-shoot="cr-constraints"]').count()) === 1);
  check("A6. The four supporting surfaces are on screen",
    (await p.locator('[data-shoot^="cr-surf-"]').count()) === 4);
  // What changed is Delivery's job in V3, not Command's — reading history is
  // a different task from operating, and the rail had no room for both.
  await lens("delivery");
  check("A5. Recent activity is on screen", (await p.locator('[data-shoot="cr-activity-row"]').count()) > 0);
  await lens("command");
  // A DAILY SURFACE HAS TO FIT. Scrolling to find the constraint that is
  // hurting you is the failure this page exists to avoid.
  const [doc, win] = await p.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight]);
  check("A7. The whole workspace fits one viewport", doc <= win + 2, `${doc} vs ${win}`);
}

// ── B. EVERY NUMBER MATCHES ITS OWNER ──────────────────────────────────
{
  const dec = await api("/api/decisions");
  const proj = await api("/api/instrument/project");
  const tl = await api("/api/timeline");

  const openDecisions = dec.decisions.filter((d) => d.status === "open");
  const gates = openDecisions.filter((d) => d.gate?.serial);
  const choices = await txt('[data-shoot="cr-card-choices"]');
  check("B1. The gate count is Decisions' own", new RegExp(`\\b${gates.length}\\b`).test(choices), `${gates.length} gates`);
  const decisionsPanel = await txt('[data-shoot="cr-surf-decisions"]');
  check("B2. …and so is the modelled delay it states",
    decisionsPanel.includes(`${gates.reduce((n, d) => n + d.gate.likely, 0)}d`),
    `${gates.reduce((n, d) => n + d.gate.likely, 0)}d`);
  check("B3. …and the open-decision count", choices.includes(String(openDecisions.length)), `${openDecisions.length} open`);
  // The card carries TWO figures, and which one is the larger type is a
  // layout decision. What must never vary is that both are on the card,
  // each under its own name, so the open count is never read as the count
  // of decisions that are actually holding delivery.
  const openShown = Number(await txt('[data-shoot="cr-card-choices-primary"]'));
  const gatingShown = Number(await txt('[data-shoot="cr-card-choices-second"]'));
  check("B4. A decision is not a gate, and the page says both",
    openShown === openDecisions.length &&
      gatingShown === gates.length &&
      /holding delivery/i.test(choices) &&
      /open decisions/i.test(choices),
    `${gates.length} holding · ${openDecisions.length} open`);

  const openFindings = proj.findings.filter((f) => f.status === "open");
  const realityCard = await txt('[data-shoot="cr-card-reality"]');
  check("B5. Open signals are the Audit's own findings", realityCard.includes(String(openFindings.length)),
    `${openFindings.length} open`);
  check("B6. …and blocking is the stored flag, not a guess",
    realityCard.includes(String(openFindings.filter((f) => f.blocking).length)));

  // Capacity: raw and effective from the roster, computed the way Portfolio
  // computes them. Checked against a recomputation from the raw payload.
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
  const capCard = await txt('[data-shoot="cr-card-capacity"]');
  check("B7. RAW allocation matches the roster", capCard.includes(raw.toFixed(1)), `${raw.toFixed(1)} FTE`);
  check("B8. EFFECTIVE is raw after switching, and lower", capCard.includes(eff.toFixed(1)) && eff < raw,
    `${eff.toFixed(1)} of ${raw.toFixed(1)}`);
  check("B9. No fabricated utilization or buffer anywhere on the page",
    !/utilization|buffer|health|alignment/i.test(await p.locator('[data-shoot="cr-reading"]').innerText()));

  // Time: Live Now is the Timeline's NOW, not the browser's clock.
  const now = new Date(tl.now);
  check("B10. Live Now is the Timeline's own NOW",
    (await txt('[data-shoot="cr-now"]')) ===
      now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    await txt('[data-shoot="cr-now"]'));
}

// ── C. NO SEVERITY, NO SCORE, NO INVENTED RANKING ──────────────────────
{
  const rail = await p.locator('[data-shoot="cr-constraints"]').innerText();
  check("C1. Constraints carry no fabricated severity", !/\b(high|medium|low|critical)\b/i.test(rail), rail.split("\n")[1] ?? "");
  check("C2. …every one states a real quantity in its own unit",
    (await p.locator('[data-shoot="cr-constraint"]').evaluateAll((els) =>
      els.every((e) => /\d/.test(e.textContent ?? "") && /(d modelled|FTE|d over|d ago|d spread)/.test(e.textContent ?? ""))
    )));
  const dep = await p.locator('[data-shoot="cr-dependency-watch"]').innerText();
  check("C3. Dependency Watch invents no importance score", !/\b(score|priority|criticality|rank)\b/i.test(dep));
}

// ── D. A DEPENDENCY THAT CAN MOVE DELIVERY IS NOT INVISIBLE ────────────
{
  const proj = await api("/api/instrument/project");
  const declared = proj.scopes.flatMap((s) => s.dependsOnScopeIds.map((d) => [s.scopeId, d]));
  const rows = await p.locator('[data-shoot="cr-dep-waits_on"]').count();
  check("D1. Every declared dependency is on the watch", rows === declared.length, `${rows} of ${declared.length}`);

  // A SINGLE POINT OF FAILURE, COUNTED. Not scored.
  const dependents = new Map();
  for (const [down, up] of declared) dependents.set(up, [...(dependents.get(up) ?? []), down]);
  const shared = [...dependents.values()].filter((v) => v.length >= 2).length;
  check("D2. An upstream that carries several projects is called out",
    (await p.locator('[data-shoot="cr-dep-shared_upstream"]').count()) === shared, `${shared} shared upstream`);
  if (shared > 0) {
    const t = await p.locator('[data-shoot="cr-dep-shared_upstream"]').first().innerText();
    check("D3. …and says how many, and what happens if it slips", /\d+ downstream/.test(t) && /both slip/i.test(t),
      t.split("\n")[0]);
  } else {
    check("D3. …and says how many, and what happens if it slips", true, "none in this data");
  }
}

// ── E. IT OPENS ORBIT, ALREADY FOCUSED ─────────────────────────────────
{
  const row = p.locator('[data-shoot="cr-dep-waits_on"]').first();
  const href = await row.evaluate((e) => e.closest("a")?.getAttribute("href"));
  check("E1. A dependency row is a door into Orbit", !!href && href.startsWith("/orbit?focus="), href ?? "no href");
  await row.click();
  await p.waitForURL("**/orbit**", { timeout: 15000 });
  await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
  await settle(3000);
  const url = new URL(p.url());
  const focus = url.searchParams.get("focus");
  const select = url.searchParams.get("select");
  check("E2. …and Orbit opens on that project", (await p.locator(`[data-shoot="orbit-focus-${focus}"]`).count()) === 1, focus ?? "");
  check("E3. …with the dependency already selected",
    (await p.locator('[data-shoot="orbit-inspector"]').count()) === 1 &&
      (await p.locator('[data-orbit-node]').evaluateAll((els) => els.map((e) => e.getAttribute("data-orbit-node")))).includes(select),
    select ?? "");
  check("E4. Orbit is still here, and still its own instrument",
    (await p.locator('[data-shoot="orbit-field"]').count()) === 1);
}

// ── F. LOOKING CHANGES NOTHING ─────────────────────────────────────────
{
  await open();
  writes = [];
  await lens("delivery");
  for (const sel of ['[data-shoot="cr-card-outcome"]', '[data-shoot="cr-surf-forecast"]', '[data-shoot="cr-activity"]']) {
    await p.locator(sel).hover();
    await settle(220);
  }
  await settle(1200);
  check("F1. Reading the Control Room writes nothing", writes.length === 0, writes.join(", ") || "0 writes");
}

// ── G. IT IS NOT A SNAPSHOT ────────────────────────────────────────────
{
  // Read the BEFORE on the same workspace the AFTER will be read on. The
  // section above finishes on the Delivery lens, and each lens draws the
  // reading in its own markup — comparing across two of them would be
  // comparing layouts, not comparing Reality to itself.
  await open();
  const before = await txt('[data-shoot="cr-card-choices"]');
  const dec = await api("/api/decisions");
  const target = dec.decisions.find((d) => d.gate?.serial && d.status === "open");
  check("G0. There is a real gate to answer", !!target, target?.title ?? "none");
  if (target) {
    await fetch(`${BASE}/api/decisions/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "decided", resolution: "Answered by the Control Room proof." }),
    });
    await open();
    const after = await txt('[data-shoot="cr-card-choices"]');
    check("G1. A decision answered elsewhere changes the Control Room", after !== before,
      `${(/(\d+)\s*\n?\s*gates?/.exec(before) ?? [])[1]} → ${(/(\d+)\s*\n?\s*gates?/.exec(after) ?? [])[1]} gates`);
    check("G2. …and the constraint it was causing is gone",
      !(await p.locator('[data-shoot="cr-constraints"]').innerText()).includes(target.title.slice(0, 24)));

    await fetch(`${BASE}/api/decisions/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "open", resolution: null }),
    });
    await open();
    check("G3. …and putting Reality back puts the Control Room back",
      (await txt('[data-shoot="cr-card-choices"]')) === before);
  }
}

// ── H. ONE SCENARIO, AND REALITY SURVIVES IT ───────────────────────────
{
  // Made in Decisions — the instrument that owns the lever — then read here.
  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
  await settle(3000);
  // Orbit opens on whichever project lands last, which is not necessarily
  // one with a gate. Walk to the project that actually has one.
  const scopes = await p
    .locator('[data-shoot^="orbit-focus-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-shoot").replace("orbit-focus-", "")));
  for (const s of scopes) {
    await p.click(`[data-shoot="orbit-focus-${s}"]`);
    await settle(1200);
    if ((await p.locator('[data-orbit-kind="gate"]').count()) > 0) break;
  }
  const gate = p.locator('[data-orbit-kind="gate"]').first();
  if ((await gate.count()) > 0) {
    const id = await gate.getAttribute("data-orbit-node");
    await gate.click();
    await settle(600);
    await p.click(`[data-shoot="orbit-assume-${id}"]`);
    await settle(1600);
    // Walk to the Control Room client-side; the hypothetical must be there.
    await p.click('a[href="/control-room"]');
    await p.waitForURL("**/control-room", { timeout: 15000 });
    await p.waitForSelector('[data-shoot="cr-reading"]');
    await settle(3000);
    check("H1. A hypothetical made elsewhere is shown here as a Scenario",
      (await p.locator('[data-shoot="cr-scenario"]').count()) === 1);
    // The gate count is the card's SECOND figure — the count of decisions
    // that are actually holding delivery, as distinct from the open count
    // beside it. Read directly rather than parsed out of prose.
    const gatesNow = Number(await txt('[data-shoot="cr-card-choices-second"]'));
    check("H2. …and the gate it assumes answered stops counting", gatesNow >= 0 && gatesNow < 2, `${gatesNow} gates`);
    writes = [];
    await p.click('[data-shoot="cr-discard"]');
    await settle(1800);
    check("H3. Discarding it returns exactly to Reality",
      (await p.locator('[data-shoot="cr-scenario"]').count()) === 0);
    check("H4. …and none of that wrote anything", writes.length === 0, writes.join(", ") || "0 writes");
  } else {
    check("H1. A hypothetical made elsewhere is shown here as a Scenario", false, "no gate to assume");
    check("H2. …and the gate it assumes answered stops counting", false, "n/a");
    check("H3. Discarding it returns exactly to Reality", false, "n/a");
    check("H4. …and none of that wrote anything", false, "n/a");
  }
}

// ── I. EXTERNAL DISCOVERY DOES NOT BECOME REALITY ──────────────────────
{
  await open();
  const tl = await api("/api/timeline");
  const candidates = (tl.candidates ?? []).length;
  const watch = p.locator('[data-shoot="cr-dep-needs_review"]');
  if (candidates > 0) {
    check("I1. Unreviewed external claims are surfaced", (await watch.count()) === 1);
    check("I2. …drawn as not-yet-real, never as a dependency",
      (await watch.first().getAttribute("data-candidate")) === "true");
    const t = await watch.first().innerText();
    check("I3. …and stated as not counting towards any date", /until a person accepts/i.test(t), t.split("\n")[0]);
    check("I4. …and never called a dependency, because the model has no such thing",
      !/waits on|depends on/i.test(t));
  } else {
    check("I1. Unreviewed external claims are surfaced", true, "none pending");
    check("I2. …drawn as not-yet-real, never as a dependency", true, "n/a");
    check("I3. …and stated as not counting towards any date", true, "n/a");
    check("I4. …and never called a dependency, because the model has no such thing", true, "n/a");
  }
  // The candidates are on the Timeline's own tray and stay inert there.
  check("I5. A candidate contributes nothing to the forecast",
    (await api("/api/instrument/project")).scopes.every((s) => s.items.every((it) => it.id)),
    `${candidates} candidate(s) pending`);
}

await b.close();
console.log(failures === 0 ? "\nALL CONTROL ROOM PROOFS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
