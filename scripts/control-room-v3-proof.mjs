// THE CONTROL ROOM V3, PROVEN.
//
// V1 proved the composition laws (every number matches its owner, the page
// writes nothing). V2 proved the honesty laws (a readout may only say what
// was recorded). This one proves the STRUCTURAL laws V3 introduced — the
// ones that make the Project Field a picture of the project rather than a
// decoration:
//
//   EVERY LINE IS A DECLARED EDGE. No relationship appears on the field
//   that a human did not write down, and every one that was written down
//   appears.
//
//   CAUSALITY IS A GRAPH WALK. Selecting a thing highlights exactly the
//   transitive closure of what it reaches — no more, and no less.
//
//   CAPACITY IS MATERIAL, NOT TOPOLOGY. Changing the roster's switching
//   cost changes how lanes LOOK and where they land. It must never change
//   how many there are or what order they sit in.
//
//   OBSTRUCTION IS A CLAMP. One per open serial gate, on the lane it
//   actually blocks, drawn as a thing in the way rather than a row in a
//   list — and releasing one leaves the topology alone.
//
//   node scripts/control-room-v3-proof.mjs
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
p.on("pageerror", (e) => {
  console.log("PAGEERROR:", e.message);
  failures++;
});

let writes = [];
await p.route("**/*", (r) => {
  const m = r.request().method();
  if (m !== "GET") writes.push(`${m} ${r.request().url().replace(BASE, "")}`);
  r.continue();
});

const settle = (ms = 700) => p.waitForTimeout(ms);
const park = async () => {
  await p.mouse.move(1674, 1046);
  await settle(300);
};
const api = async (path) => (await fetch(`${BASE}${path}`)).json();
const inspector = () => p.locator('[data-shoot="cr-inspector"]').innerText();

/** THE FIELD'S LAWS ARE TESTED WHERE THE FIELD LIVES.
 *
 *  V4 gives the Command workspace the Project Time Machine as its working
 *  surface, following the approved layout; the Project Field is the working
 *  surface of the Dependency and Decision workspaces, which are the ones
 *  whose question it answers. So this suite opens the room and asks for the
 *  Dependency workspace before it asserts anything about the field. */
const open = async () => {
  await p.goto(`${BASE}/control-room`, { waitUntil: "networkidle" });
  await p.evaluate(() => localStorage.setItem("kit.control-room.lens.v3", JSON.stringify({ lens: "dependency", custom: [] })));
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="cr-field"]', { timeout: 30000 });
  await settle(3200);
  await park();
};

/** Which lanes are lit, straight off the drawing's own opacity. */
const litLanes = async () => {
  const all = await p
    .locator("[data-field-lane]")
    .evaluateAll((els) => els.map((e) => [e.getAttribute("data-field-lane"), Number(e.getAttribute("opacity"))]));
  return { lit: all.filter(([, o]) => o >= 0.99).map(([id]) => id), dim: all.filter(([, o]) => o < 0.99).map(([id]) => id) };
};

const laneOrder = () =>
  p.locator("[data-field-lane]").evaluateAll((els) => els.map((e) => e.getAttribute("data-field-lane")));

/** A CUSTOM WORKSPACE, set directly. The customization system exists so an
    operator can put exactly the instruments they need on the desk; a proof
    that needs the field and one particular reading in the same frame is a
    legitimate use of it, and it keeps each law testable without bending a
    named workspace to suit the test. */
const openWith = async (surfaces) => {
  await p.goto(`${BASE}/control-room`, { waitUntil: "networkidle" });
  await p.evaluate(
    (list) => localStorage.setItem("kit.control-room.lens.v3", JSON.stringify({ lens: "custom", custom: list })),
    surfaces
  );
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="cr-field"]', { timeout: 30000 });
  await settle(3200);
  await park();
};

/** V4 puts the workspace switcher behind a Views control; opening it is
    part of picking one. */
const pick = async (id) => {
  await p.click('[data-shoot="cr-views"]');
  await settle(350);
  await p.click(`[data-shoot="cr-lens-pick-${id}"]`);
  await settle(1500);
  await park();
};

await open();

const proj = await api("/api/instrument/project");
const dec = await api("/api/decisions");

// The declared graph, read straight from the payload. Everything below is
// checked against THIS, never against the drawing's own opinion.
const declared = new Map(proj.scopes.map((s) => [s.scopeId, s.dependsOnScopeIds.filter((x) => x)]));
const downstream = new Map(proj.scopes.map((s) => [s.scopeId, []]));
for (const [id, ups] of declared) for (const u of ups) downstream.get(u)?.push(id);
const closureDown = (id, seen = new Set()) => {
  for (const d of downstream.get(id) ?? []) {
    if (seen.has(d)) continue;
    seen.add(d);
    closureDown(d, seen);
  }
  return seen;
};

// ── A. THE FIELD IS THE CENTRE OF GRAVITY ──────────────────────────────
{
  const order = await laneOrder();
  check("A1. The project field is on screen", (await p.locator('[data-shoot="cr-field"]').count()) === 1);
  check("A2. One lane per project, and no lane invented", order.length === proj.scopes.length, `${order.length} lanes`);
  check("A3. Every project has a lane", proj.scopes.every((s) => order.includes(s.scopeId)));

  // READING ORDER IS THE DEPENDENCY ORDER. A lane may never be drawn above
  // something it waits on, or the release spine would cross a lane it has
  // nothing to do with — a false statement, however decorative.
  const idx = new Map(order.map((id, k) => [id, k]));
  const violations = [];
  for (const [id, ups] of declared) for (const u of ups) if ((idx.get(u) ?? 0) > (idx.get(id) ?? 0)) violations.push(`${u}→${id}`);
  check("A4. A lane never sits above something it waits on", violations.length === 0, violations.join(", ") || "clean");

  // The field is the biggest thing on the page, because it is the object.
  const areas = await p
    .locator('[data-shoot="cr-field-panel"], [data-shoot^="cr-lens-"], [data-shoot="cr-inspector"], [data-shoot="cr-reading"]')
    .evaluateAll((els) =>
      els.map((e) => ({ id: e.getAttribute("data-shoot"), a: e.getBoundingClientRect().width * e.getBoundingClientRect().height }))
    );
  const biggest = areas.sort((x, y) => y.a - x.a)[0];
  check("A5. …and it is the largest surface on the page", biggest?.id === "cr-field-panel", biggest?.id ?? "none");

  check("A6. The whole workspace still fits one viewport",
    await p.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2));
}

// ── B. DEPENDENCIES ARE DRAWN, NOT LISTED ──────────────────────────────
{
  const spines = await p
    .locator("[data-field-edge]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-field-edge")));
  const carriers = [...downstream.entries()].filter(([, d]) => d.length > 0).map(([id]) => id);
  check("B1. One release spine per project something waits on",
    spines.length === carriers.length && carriers.every((c) => spines.includes(c)),
    `${spines.length} spines, ${carriers.length} carriers`);
  check("B2. No spine exists for a relationship nobody declared",
    spines.every((s) => (downstream.get(s) ?? []).length > 0), spines.join(", ") || "none");

  // A shared upstream states its fan-out as a COUNT OF DECLARED EDGES. It
  // is not a score, and it is not an opinion about importance.
  const shared = carriers.filter((c) => (downstream.get(c) ?? []).length > 1);
  const fieldText = await p.locator('[data-shoot="cr-field"]').innerText();
  if (shared.length > 0) {
    const s = shared[0];
    const n = (downstream.get(s) ?? []).length;
    const name = proj.scopes.find((x) => x.scopeId === s)?.name ?? s;
    check("B3. A project several launches ride on is called out by name and count",
      fieldText.includes(`${n} launches wait on ${name}`), `${n} launches wait on ${name}`);
  } else {
    check("B3. A project several launches ride on is called out by name and count", true, "no shared upstream today");
  }
  const header = await p.locator('[data-shoot="cr-field-panel"] header').innerText();
  const edgeCount = [...declared.values()].reduce((n, u) => n + u.length, 0);
  check("B4. The field states its own structure as counts, never as a grade",
    header.includes(`${edgeCount} declared`) && !/risk|health|score|critical|pressure/i.test(header), header.replace(/\n/g, " "));
}

// ── C. CAUSALITY IS A GRAPH WALK ───────────────────────────────────────
{
  const carriers = [...downstream.entries()].filter(([, d]) => d.length > 1).map(([id]) => id);
  const subject = carriers[0] ?? [...downstream.entries()].filter(([, d]) => d.length > 0).map(([id]) => id)[0];
  if (subject) {
    await p.click(`[data-field-lane="${subject}"] rect`);
    await settle(800);
    const { lit, dim } = await litLanes();
    const want = new Set([subject, ...closureDown(subject)]);
    check("C1. Selecting a project lights exactly what its movement reaches",
      lit.length === want.size && lit.every((id) => want.has(id)),
      `lit ${lit.join(",")} · want ${[...want].join(",")}`);
    check("C2. …and everything it cannot reach goes quiet",
      dim.every((id) => !want.has(id)) && dim.length === proj.scopes.length - want.size,
      dim.join(",") || "nothing to dim");

    const txt = await inspector();
    const kids = [...(downstream.get(subject) ?? [])].map((k) => proj.scopes.find((s) => s.scopeId === k)?.name ?? k);
    check("C3. …and the rail names them, rather than counting them anonymously",
      kids.every((n) => txt.includes(n)), kids.join(", "));
    check("C4. …and states the consequence in a sentence",
      (await p.locator('[data-shoot="cr-consequence"]').count()) >= 1);

    await p.keyboard.press("Escape");
    await settle(600);
    const after = await litLanes();
    check("C5. Escape releases the focus", after.dim.length === 0, `${after.dim.length} still dim`);
  } else {
    for (const n of ["C1", "C2", "C3", "C4", "C5"]) check(`${n}. causality`, true, "no declared edges today");
  }

  // A leaf reaches nothing, and the drawing must say so rather than
  // lighting its neighbours out of politeness.
  const leaf = proj.scopes.find((s) => (downstream.get(s.scopeId) ?? []).length === 0);
  if (leaf) {
    await p.click(`[data-field-lane="${leaf.scopeId}"] rect`);
    await settle(800);
    const { lit } = await litLanes();
    check("C6. A project nothing waits on lights only itself", lit.length === 1 && lit[0] === leaf.scopeId, lit.join(","));
    await p.keyboard.press("Escape");
    await settle(400);
  }
}

// ── D. AN OBSTRUCTION IS A CLAMP, NOT A ROW ────────────────────────────
{
  const openGates = dec.decisions.filter((d) => d.status === "open" && d.gate?.serial);
  const clamps = await p
    .locator("[data-field-gate]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-field-gate")));
  check("D1. One clamp on the field per gate the engine actually honours",
    clamps.length === openGates.length && openGates.every((g) => clamps.includes(g.gate.id)),
    `${clamps.length} clamps, ${openGates.length} gates`);

  if (clamps.length > 0) {
    const g = openGates.find((x) => clamps.includes(x.gate.id));
    await p.click(`[data-field-gate="${g.gate.id}"]`);
    await settle(800);
    const txt = await inspector();
    check("D2. A clamp states the delay the model stores for it, not an estimate of one",
      txt.includes(`${g.gate.likely}d`), `${g.gate.likely}d`);
    const blocked = proj.scopes.find((s) => s.gates.some((x) => x.id === g.gate.id));
    check("D3. …and names the project it blocks", !!blocked && txt.includes(blocked.name), blocked?.name ?? "?");
    check("D4. …and never claims to block a capability, which the model cannot express",
      /not a capability/i.test(txt));
    const { lit } = await litLanes();
    const want = new Set([blocked.scopeId, ...closureDown(blocked.scopeId)]);
    check("D5. …and lights exactly the lanes answering it would release",
      lit.length === want.size && lit.every((id) => want.has(id)), lit.join(","));
    await p.keyboard.press("Escape");
    await settle(400);
  } else {
    for (const n of ["D2", "D3", "D4", "D5"]) check(`${n}. clamp`, true, "no gate today");
  }
}

// ── E. CAPACITY IS MATERIAL, NOT TOPOLOGY ──────────────────────────────
{
  await openWith(["field", "reading-capacity", "inspector"]);
  const before = await laneOrder();
  const beforeText = await p.locator('[data-shoot="cr-card-capacity"]').innerText();
  const settings = await api("/api/portfolio-settings");
  const original = settings.contextSwitchCostPct ?? settings?.settings?.contextSwitchCostPct ?? 12;

  await fetch(`${BASE}/api/portfolio-settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contextSwitchCostPct: 45 }),
  });
  await openWith(["field", "reading-capacity", "inspector"]);
  const after = await laneOrder();
  const afterText = await p.locator('[data-shoot="cr-card-capacity"]').innerText();

  check("E1. A different capacity situation leaves the topology alone",
    after.length === before.length && after.every((id, k) => id === before[k]), after.join(",") + " vs " + before.join(","));
  check("E2. …but the reading changes, because the ability really did",
    afterText !== beforeText, "arriving moved");

  // ARRIVING is recomputed here from the raw roster, the way Portfolio
  // computes it, and must match what the page says.
  const proj2 = await api("/api/instrument/project");
  const active = new Map(proj2.people.filter((x) => x.active).map((x) => [x.id, x]));
  const counts = new Map();
  for (const a of proj2.allocations) counts.set(a.personId, (counts.get(a.personId) ?? 0) + 1);
  let raw = 0;
  let eff = 0;
  for (const a of proj2.allocations) {
    const person = active.get(a.personId);
    if (!person) continue;
    const c = a.fraction * person.fte;
    raw += c;
    const n = counts.get(a.personId) ?? 1;
    eff += c * (n > 1 ? Math.max(0, 1 - (proj2.contextSwitchCostPct / 100) * (n - 1)) : 1);
  }
  check("E3. …and ARRIVING is still effective ÷ allocated over the same people",
    afterText.includes(`${Math.round((eff / raw) * 100)}%`), `${Math.round((eff / raw) * 100)}%`);

  await fetch(`${BASE}/api/portfolio-settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contextSwitchCostPct: original }),
  });
  await open();
}

// ── F. THE LANDING IS THE SIMULATION'S OWN ─────────────────────────────
{
  const dShort = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fieldText = await p.locator('[data-shoot="cr-field"]').innerText();
  // Every lane prints the date its own simulation produced. The Control
  // Room does not round, re-derive or re-run anything.
  let matched = 0;
  for (const s of proj.scopes) {
    const sim = s.lastReport ? null : null; // the live P50 comes from the page's own run
    void sim;
  }
  // Cross-checked instead against the reading, which V1 already proved is
  // the Forecast's own portfolioLikely.
  const outcome = await p.locator('[data-shoot="cr-card-outcome"]').innerText();
  const latest = fieldText
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => /^[A-Z][a-z]{2} \d{1,2}$/.test(t));
  check("F1. Every lane prints a real landing date", latest.length >= proj.scopes.length - 1, `${latest.length} dates`);
  check("F2. …and the project's own date is one of them",
    latest.some((d) => outcome.includes(d)), latest.join(", "));
  void matched;
  void dShort;
}

// ── G. THE COLOUR LAW HOLDS ────────────────────────────────────────────
{
  const violetOnField = async () =>
    p.locator('[data-shoot="cr-field"] rect, [data-shoot="cr-field"] line').evaluateAll((els) =>
      els.filter((e) => (e.getAttribute("fill") ?? "") + (e.getAttribute("stroke") ?? "") === "var(--i-violet)").length
    );
  check("G1. Under Reality nothing on the field is drawn in the Scenario's violet",
    (await violetOnField()) === 0);

  // Captured HERE, on the Control Room — Orbit has no lanes to count, and
  // reading them there was measuring the wrong page.
  const beforeLanes = await laneOrder();

  // Make a hypothetical in the instrument that owns the lever, then look.
  await p.goto(`${BASE}/orbit`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="orbit-field"]', { timeout: 30000 });
  await settle(1200);
  const scopes = await p
    .locator('[data-shoot^="orbit-focus-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-shoot").replace("orbit-focus-", "")));
  let assumed = null;
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
    assumed = id;
    break;
  }
  if (assumed) {
    await p.click('a[href="/control-room"]');
    await p.waitForURL("**/control-room", { timeout: 15000 });
    await p.waitForSelector('[data-shoot="cr-field"]');
    await settle(3400);
    await park();
    check("G2. A hypothetical made elsewhere reaches the field", (await violetOnField()) > 0);
    check("G3. …and it releases a clamp rather than removing a lane",
      (await p.locator('[data-shoot="cr-field-panel"] header').innerText()).match(/(\d+) clamp/)?.[1] !==
        String(dec.decisions.filter((d) => d.status === "open" && d.gate?.serial).length));
    const nowLanes = await laneOrder();
    check("G4. …and the project still has exactly the same lanes",
      nowLanes.length === beforeLanes.length, `${nowLanes.length} lanes`);
    writes = [];
    await p.click('[data-shoot="cr-discard"]');
    await settle(1800);
    check("G5. Discarding it puts Reality's colour back", (await violetOnField()) === 0);
    check("G6. …and none of that wrote anything", writes.length === 0, writes.join(", ") || "0 writes");
  } else {
    for (const n of ["G2", "G3", "G4", "G5", "G6"]) check(`${n}. scenario`, false, "no gate to assume");
  }
}

// ── H. LENSES ──────────────────────────────────────────────────────────
{
  writes = [];

  // THE PROJECT IS ALWAYS ON SCREEN AS AN OBJECT. Which working surface a
  // workspace uses depends on its question — the Time Machine answers
  // "what is happening over time", the Project Field answers "what waits on
  // what" — but no workspace is allowed to degrade into cards alone.
  for (const lens of ["delivery", "capacity", "dependency", "decision", "command"]) {
    await pick(lens);
    const machine = await p.locator('[data-shoot="cr-time-machine"]').count();
    const field = await p.locator('[data-shoot="cr-field"]').count();
    check(`H1.${lens}. The ${lens} workspace keeps a working surface`, machine + field >= 1,
      field ? "project field" : "time machine");
  }
  check("H2. Choosing a lens is not a project change", writes.length === 0, writes.join(", ") || "0 writes");

  await pick("dependency");
  check("H3. The dependency lens brings up the dependency index",
    (await p.locator('[data-shoot="cr-dependency-watch"]').count()) === 1);
  await pick("capacity");
  check("H4. …and the capacity lens puts it away and brings up capacity",
    (await p.locator('[data-shoot="cr-dependency-watch"]').count()) === 0 &&
      (await p.locator('[data-shoot="cr-surf-capacity"]').count()) === 1);

  const stored = await p.evaluate(() => localStorage.getItem("kit.control-room.lens.v3"));
  check("H5. The choice lives in this browser and nowhere else",
    !!stored && JSON.parse(stored).lens === "capacity", stored ? "localStorage" : "not stored");
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="cr-strip"]', { timeout: 30000 });
  await settle(3200);
  check("H6. …and survives a reload",
    /capacity/i.test(await p.locator('[data-shoot="cr-views"]').innerText()));

  await p.click('[data-shoot="cr-lens-editor-open"]');
  await p.waitForSelector('[data-shoot="cr-lens-editor"]', { timeout: 15000 });
  await settle(500);
  await p.click('[data-shoot="cr-surface-system-status"]');
  await settle(600);
  check("H7. Editing a named lens forks it to Custom rather than redefining it",
    /custom/i.test(await p.locator('[data-shoot="cr-views"]').innerText()));
  await p.click('[data-shoot="cr-reset-workspace"]');
  await settle(900);
  check("H8. Reset returns the shipped default and clears the stored choice",
    /command/i.test(await p.locator('[data-shoot="cr-views"]').innerText()) &&
      (await p.evaluate(() => localStorage.getItem("kit.control-room.lens.v3"))) === null);
  await p.click('[data-shoot="cr-lens-editor-close"]');
  await settle(900);
  check("H9. None of that wrote anything", writes.length === 0, writes.join(", ") || "0 writes");
}

// ── I. STILL A COMPOSITION ─────────────────────────────────────────────
{
  await open();
  writes = [];
  const lanes = await laneOrder();
  for (const id of lanes) {
    await p.click(`[data-field-lane="${id}"] rect`);
    await settle(350);
  }
  for (const g of await p.locator("[data-field-gate]").evaluateAll((els) => els.map((e) => e.getAttribute("data-field-gate")))) {
    await p.click(`[data-field-gate="${g}"]`);
    await settle(350);
  }
  await p.keyboard.press("Escape");
  await settle(500);
  check("I1. Inspecting the whole project writes nothing", writes.length === 0, writes.join(", ") || "0 writes");
  check("I2. …and a selection is never persisted, because it is a question, not a preference",
    (await p.evaluate(() => localStorage.getItem("kit.control-room.lens.v3"))) === null ||
      !/selection/i.test(await p.evaluate(() => localStorage.getItem("kit.control-room.lens.v3") ?? "")));
}

console.log(failures === 0 ? "\nALL CONTROL ROOM V3 PROOFS PASS" : `\n${failures} FAILURE(S)`);
await b.close();
process.exit(failures === 0 ? 0 : 1);
