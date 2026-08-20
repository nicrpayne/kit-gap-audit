// THE TRUST FIXTURES, PROVEN.
//
// Every case here was found by the trust audit to either kill the Control
// Room outright or to state something the model does not know. The rule the
// whole suite enforces is one sentence:
//
//   WHERE THE TRUTH IS UNKNOWN, THE SURFACE MUST SAY SO — never a spinner,
//   never a plausible number, never a word that claims more than the data.
//
// Each fixture is created through the PUBLIC API wherever the API allows it,
// because "can a person do this in normal use" is the question that decides
// severity. Where the API correctly refuses (self-dependency, orphaned
// reference), the refusal is itself the assertion, and the bad state is
// created directly in the database to prove the UI survives it anyway.
//
//   node scripts/trust-fixtures-proof.mjs
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = new PrismaClient();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const api = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty body is fine */
  }
  return { status: res.status, body };
};

const mkScope = async (name, extra = {}) => {
  const { body } = await api("/api/scopes", {
    method: "POST",
    body: JSON.stringify({ name, teamKey: "TRUST", ...extra }),
  });
  return body.scope.id;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();

/** Loads the Control Room and reports which of the three terminal states it
    reached. A surface that reaches NONE of them within the timeout is the
    failure this suite exists to catch. */
const openControlRoom = async () => {
  await p.goto(`${BASE}/control-room`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const outcome = await Promise.race([
    p.waitForSelector('[data-shoot="cr-reading"]', { timeout: 30000 }).then(() => "reading"),
    p.waitForSelector('[data-shoot="cr-blocked"]', { timeout: 30000 }).then(() => "blocked"),
  ]).catch(() => "stuck");
  const text = (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  return { outcome, text };
};

const created = [];
const track = (id) => {
  created.push(id);
  return id;
};

// ── A. THE GRAPH CANNOT KILL THE PAGE ──────────────────────────────────
{
  const a = track(await mkScope("TRUST Cycle A"));
  const c = track(await mkScope("TRUST Cycle C"));

  // A cycle used to be reachable with two ordinary PATCHes, each returning
  // 200. The second one must now be refused, and must name the loop.
  const first = await api(`/api/scopes/${a}`, {
    method: "PATCH",
    body: JSON.stringify({ dependsOnScopeIds: [c] }),
  });
  check("A1. A plain dependency is still accepted", first.status === 200, `${first.status}`);

  const closing = await api(`/api/scopes/${c}`, {
    method: "PATCH",
    body: JSON.stringify({ dependsOnScopeIds: [a] }),
  });
  check("A2. Closing a cycle is refused at the write boundary", closing.status === 400, `${closing.status}`);
  check("A3. …and the refusal names the loop it would create",
    /circular dependency/i.test(closing.body?.error ?? "") && /TRUST Cycle/.test(closing.body?.error ?? ""),
    (closing.body?.error ?? "").slice(0, 90));

  const self = await api(`/api/scopes/${a}`, {
    method: "PATCH",
    body: JSON.stringify({ dependsOnScopeIds: [a] }),
  });
  check("A4. A self-dependency is refused", self.status === 400, `${self.status}`);

  const ghost = await api(`/api/scopes/${a}`, {
    method: "PATCH",
    body: JSON.stringify({ dependsOnScopeIds: ["no-such-scope"] }),
  });
  check("A5. A dependency on something that does not exist is refused", ghost.status === 400, `${ghost.status}`);

  // THE ENGINE STILL HAS TO BE SURVIVABLE. The API refuses all three, but a
  // migration, a direct write or a future bug can still produce them — and
  // when that happens the page must explain itself rather than hang.
  await db.scope.update({ where: { id: c }, data: { dependsOnScopeIds: [a] } });
  const cycled = await openControlRoom();
  check("A6. A cycle in the DATA shows an error, never an endless spinner",
    cycled.outcome === "blocked", cycled.outcome);
  check("A7. …and the error names the projects, not their ids",
    /TRUST Cycle A/.test(cycled.text) && /circular/i.test(cycled.text),
    cycled.outcome === "blocked" ? "named" : "n/a");
  check("A8. …and never claims to still be loading", !/Reading the project/i.test(cycled.text));
  await db.scope.update({ where: { id: c }, data: { dependsOnScopeIds: [] } });

  await db.scope.update({ where: { id: a }, data: { dependsOnScopeIds: ["deleted-long-ago"] } });
  const orphaned = await openControlRoom();
  check("A9. An orphaned reference shows an error, never an endless spinner",
    orphaned.outcome === "blocked", orphaned.outcome);
  await db.scope.update({ where: { id: a }, data: { dependsOnScopeIds: [] } });

  await db.scope.update({ where: { id: a }, data: { dependsOnScopeIds: [a] } });
  const selfLoop = await openControlRoom();
  check("A10. A self-dependency in the DATA shows an error too",
    selfLoop.outcome === "blocked", selfLoop.outcome);
  await db.scope.update({ where: { id: a }, data: { dependsOnScopeIds: [] } });
}

// ── B. DELETING A PROJECT LEAVES NO LANDMINE ───────────────────────────
{
  const up = track(await mkScope("TRUST Upstream"));
  const other = track(await mkScope("TRUST Other Upstream"));
  const down = track(await mkScope("TRUST Downstream"));
  await api(`/api/scopes/${down}`, {
    method: "PATCH",
    body: JSON.stringify({ dependsOnScopeIds: [up, other] }),
  });

  const del = await api(`/api/scopes/${up}`, { method: "DELETE" });
  check("B1. A project other projects depend on can be deleted", del.status === 200, `${del.status}`);

  const after = await db.scope.findUnique({ where: { id: down }, select: { dependsOnScopeIds: true } });
  check("B2. …its reference is cleared from every dependent",
    !after.dependsOnScopeIds.includes(up), after.dependsOnScopeIds.join(", ") || "none");
  check("B3. …and every OTHER dependency is preserved exactly",
    after.dependsOnScopeIds.includes(other), `${after.dependsOnScopeIds.length} kept`);

  const still = await openControlRoom();
  check("B4. …and the Control Room still reads", still.outcome === "reading", still.outcome);
}

// ── C. AN UNCONFIGURED PROJECT INVENTS NOTHING ─────────────────────────
{
  // A scope with no project filter and an unrecognised team used to be
  // handed another team's entire backlog by the dev fixture, and an
  // inferred capacity to match. Both were then spent as if measured.
  const bare = track(await mkScope("TRUST Unconfigured"));
  const zero = track(await mkScope("TRUST Zero Capacity", { teamCapacity: 0 }));

  const { body: proj } = await api("/api/instrument/project");
  const rows = proj.scopes.filter((s) => s.name.startsWith("TRUST "));
  check("C1. An unconfigured project borrows no work items",
    rows.every((s) => (s.items ?? []).length === 0),
    rows.map((s) => `${s.name}:${(s.items ?? []).length}`).join(" "));

  const reading = await openControlRoom();
  check("C2. The Control Room still reads with unconfigured projects present",
    reading.outcome === "reading", reading.outcome);

  // The capacity floor the simulation needs (1.0, to avoid dividing by
  // nobody) must never be printed as though someone measured it.
  const unknowns = await p.locator('[data-shoot="cr-capacity-unknown"]').count();
  check("C3. Capacity with nobody on it reads as unknown, not as a number",
    unknowns > 0, `${unknowns} row(s) marked unknown`);

  const capPanel = await p.locator('[data-shoot="cr-surf-capacity"]').innerText();
  check("C4. Inferred capacity is never labelled 'counted'", !/\bct\b|counted/i.test(capPanel));
  check("C5. …and the panel states how many projects it is summarising",
    /\d+\s+projects/i.test(capPanel), capPanel.split("\n")[0]);
  void bare;
  void zero;
}

// ── D. DATES CANNOT MASQUERADE ─────────────────────────────────────────
{
  const stale = track(await mkScope("TRUST Stale Target"));
  await db.scope.update({ where: { id: stale }, data: { targetDate: new Date("1999-01-01") } });

  await openControlRoom();
  const constraints = await p.locator('[data-shoot="cr-constraints"]').innerText();
  check("D1. A target in the past is not reported as a delivery overrun",
    !/\b\d{4,}d over\b/.test(constraints), constraints.replace(/\s+/g, " ").slice(0, 80));
  check("D2. …and a stale target never outranks a real constraint",
    !/^\s*\d{4,}d/.test(constraints));

  // Any date the page prints that is not this year must carry its year.
  const body = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  const thisYear = new Date().getFullYear();
  const bareOldDate = new RegExp(`target (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d+\\.`).test(body);
  check("D3. A target date outside this year is never printed without its year",
    !bareOldDate || body.includes(String(thisYear)), `${thisYear}`);
}

// ── E. PROVENANCE LANGUAGE MATCHES WHAT IS KNOWN ───────────────────────
{
  await openControlRoom();
  const dep = await p.locator('[data-shoot="cr-dependency-watch"]').innerText();
  check("E1. A declared edge says 'declared', not 'accepted'",
    !/\baccepted\b/i.test(dep), dep.replace(/\s+/g, " ").slice(0, 70));

  // Read the HEADLINE, not the panel: the chart's own axis is labelled
  // 100/75/50/25% and would match any naive percentage test.
  const headline = (await p.locator('[data-shoot="cr-confidence-now"]').innerText().catch(() => "")).trim();
  const forecast = await p.locator('[data-shoot="cr-surf-forecast"]').innerText();
  check("E2. A simulated confidence is named as simulated",
    !/^\d+%$/.test(headline) || /simulated/i.test(forecast),
    headline || "no headline");

  const body = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  check("E3. The Timeline's display span is never called a forecast horizon",
    !/forecast horizon/i.test(body));

  // A 25-character database id is not a project name.
  check("E4. No raw database id is shown as a project's name",
    !/\b[a-z0-9]{24,}\b/i.test(body), "none");
}

// ── F. CLEAN UP, AND PROVE THE PAGE IS WELL AFTERWARDS ─────────────────
{
  for (const id of created) {
    await db.scope.updateMany({ where: { id }, data: { dependsOnScopeIds: [] } });
  }
  await db.scope.deleteMany({ where: { teamKey: "TRUST" } });
  const final = await openControlRoom();
  check("F1. With the fixtures removed the Control Room reads normally",
    final.outcome === "reading", final.outcome);
}

await db.$disconnect();
await b.close();
console.log(failures === 0 ? "\nALL TRUST FIXTURE PROOFS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
