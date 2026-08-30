// IS THE SIGNAL GRAPH BUILD ACTUALLY DEPLOYED HERE?
//
// Point it at any origin and it answers, from the outside, whether that
// deployment is running the Signal Graph / external-intelligence build --
// without writing anything and without sending a package.
//
// It exists because the first production handshake succeeded at the
// transport and failed at the consumer: the POST was accepted, but the
// build that accepted it had no knowledge of intelligenceObjects and
// rebuilt the package without them. "The POST returned an id" is not
// evidence that the receiving build can hold what was sent.
//
//   BASE_URL=https://… APP_PASSWORD=… node scripts/deployment-verify.mjs
//
// AND WHICH COMMIT IS IT. Set EXPECTED_SHA and check 0 asserts that the
// running process reports that commit — which is the question every other
// check here silently assumed an answer to, and which cost two UX audits
// before /api/version existed to answer it:
//
//   EXPECTED_SHA=0318a82 BASE_URL=https://… node scripts/deployment-verify.mjs
//
// Auth: APP_PASSWORD is sent as `Authorization: Bearer` (the route the
// middleware already offers programmatic callers). KIT_SESSION works too,
// and check 6 REQUIRES it — `/audit` is a page route, and pages are
// cookie-only by design (see middleware.ts). Check 0 needs neither:
// /api/version is public.

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PW = process.env.APP_PASSWORD ?? "";
const COOKIE = process.env.KIT_SESSION ?? "";
const EXPECTED = (process.env.EXPECTED_SHA ?? "").trim().toLowerCase();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const headers = {
  "content-type": "application/json",
  ...(PW ? { authorization: `Bearer ${PW}` } : {}),
  ...(COOKIE ? { cookie: `kit_session=${COOKIE}` } : {}),
};
const get = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* html or empty */
  }
  return { status: res.status, body };
};

console.log(`\nverifying ${BASE}\n`);

// ── 0. WHICH BUILD IS ACTUALLY RUNNING ──────────────────────────────
//
// FIRST, because every other check below is a statement about "the
// deployment" and is worth exactly as much as your confidence about which
// commit that is. Unauthenticated on purpose, so this answers even when the
// session is wrong — a 404 here is itself the answer on any build older than
// the tranche that added the route.
//
// WRITE-FREE: one GET.
{
  const res = await fetch(`${BASE}/api/version`, { headers: { "cache-control": "no-cache" } });
  const build = await res.json().catch(() => null);
  if (res.status === 404) {
    check(
      "0. the running build identifies itself",
      false,
      "404 — this deployment predates /api/version, so its commit cannot be read from outside"
    );
  } else if (!res.ok || !build?.commit) {
    check("0. the running build identifies itself", false, `HTTP ${res.status}`);
  } else {
    check(
      "0. the running build identifies itself",
      true,
      `${build.shortCommit} on ${build.branch} (${build.environment})` +
        (build.deploymentId && build.deploymentId !== "local" ? ` · deploy ${build.deploymentId}` : "")
    );
    if (EXPECTED) {
      // Prefix match, so a short SHA from `git log --oneline` works as well
      // as the full forty. Compared case-insensitively and both directions
      // are reported, because "expected 0318a82, got 8de8028" is the whole
      // value of this check.
      const actual = String(build.commit).toLowerCase();
      const ok = actual.startsWith(EXPECTED) || String(build.shortCommit).toLowerCase().startsWith(EXPECTED);
      check(
        `0b. runtime build is ${EXPECTED}`,
        ok,
        ok
          ? `${build.commit}`
          : `expected ${EXPECTED}, production reports ${build.shortCommit} (${build.commit}) — "${build.commitMessage}"`
      );
    } else {
      console.log(`      (set EXPECTED_SHA to assert this is the commit you pushed)`);
    }
  }
}

// ── 1. THE READ SURFACE EXISTS ──────────────────────────────────────
//
// The route is /api/audit/graph. /api/graph, /api/audit-graph and
// /api/context/graph have never existed in any build, so a 404 on those
// says nothing either way — this is the one that discriminates.
const scopes = await get("/api/scopes");
const scopeId =
  scopes.body?.scopes?.[0]?.id ?? scopes.body?.[0]?.id ?? process.env.SCOPE_ID ?? "";
check(
  "1. authenticated and a Scope is readable",
  scopes.status === 200 && !!scopeId,
  scopes.status === 401 ? "401 — set APP_PASSWORD or KIT_SESSION" : `scope ${scopeId || "none"}`
);

const graph = await get(`/api/audit/graph?scope=${encodeURIComponent(scopeId)}`);
check(
  "2. GET /api/audit/graph exists (the Signal Graph read surface)",
  graph.status === 200 && typeof graph.body?.measurement?.nodes === "number",
  graph.status === 404
    ? "404 — this deployment is NOT running the Signal Graph build"
    : `${graph.body?.measurement?.nodes ?? "?"} nodes, ${graph.body?.measurement?.edges ?? "?"} edges`
);

// ── 3. THE VALIDATOR KNOWS THE INTELLIGENCE FIELDS ──────────────────
//
// Asked so that BOTH builds reject and NEITHER writes, and the two
// rejections say different things:
//
//   version 1.1 + a trust value the contract refuses
//     old build -> 400 "Unsupported ProjectContextPackage version 1.1"
//     new build -> 400 "trust must be external_intelligence"
//
// The new build reaching the trust check is the proof it reads
// intelligenceObjects at all; the old build ignores the whole array.
// A real Scope id is required because the route resolves the Scope
// BEFORE it validates — a probe naming a fake Scope never reaches the
// validator, which is what an earlier version of this file got wrong.
const probe = {
  scopeId,
  ingestOnly: true,
  contextPackage: {
    version: "1.1",
    packageId: `deployment-probe-${Date.now()}`,
    producer: "manual",
    generatedAt: new Date().toISOString(),
    scopeId,
    sources: [],
    evidence: [],
    completeness: { expectedSources: [], missingSources: [], excludedSources: [] },
    warnings: [],
    intelligenceObjects: [
      {
        id: "probe-1",
        intelligenceType: "observation",
        // The one value the contract refuses.
        trust: "signal_reality",
        statement: "deployment probe",
        isCurrent: true,
      },
    ],
  },
};
const res = await fetch(`${BASE}/api/refresh`, {
  method: "POST",
  headers,
  body: JSON.stringify(probe),
});
const body = await res.json().catch(() => ({}));
const err = String(body?.error ?? "");
const readsIntelligence = res.status === 400 && /external_intelligence/i.test(err);
const oldVersionGate = /unsupported projectcontextpackage version/i.test(err);
check(
  "3. the validator reads intelligenceObjects (refuses a wrong trust value)",
  readsIntelligence,
  readsIntelligence
    ? "400 naming external_intelligence — the intelligence contract is live"
    : oldVersionGate
      ? "400 refusing version 1.1 — the OLD single-version contract, without intelligence support"
      : `HTTP ${res.status} — ${err.slice(0, 120)}`
);
check(
  "3b. the probe wrote nothing",
  !body?.contextSnapshotId,
  `contextSnapshotId ${body?.contextSnapshotId ?? "none"}`
);
check(
  "3c. contract revision 1.1 is a supported version",
  !oldVersionGate,
  oldVersionGate ? "1.1 refused — the bridge cannot mint a new package identity yet" : "1.1 accepted as a revision"
);

// ── 4. THE RAISED PACKAGE LIMITS ────────────────────────────────────
//
// Asked the same way: a package with 60 sources is refused by the old
// cap of 50 and accepted past that point by the new cap of 250. The
// error message names the limit it hit, so the answer is the number
// itself rather than an inference.
const manySources = Array.from({ length: 60 }, (_, i) => ({
  sourceType: "notes",
  sourceRef: `probe-${i}`,
  registrationId: null,
  role: null,
  status: "candidate",
  observedAt: new Date().toISOString(),
  succeeded: true,
  detail: null,
}));
// The wrong trust value is KEPT, so this package can never be persisted
// whatever the source count does — the cap is read off which error comes
// back, not off an acceptance.
const res2 = await fetch(`${BASE}/api/refresh`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    ...probe,
    contextPackage: { ...probe.contextPackage, version: "1.0", packageId: `probe-limits-${Date.now()}`, sources: manySources },
  }),
});
const body2 = await res2.json().catch(() => ({}));
const hitOldCap = /sources has 60 entries, exceeding the maximum of 50/i.test(body2?.error ?? "");
check(
  "4. package limits are the raised ones (sources > 50 no longer rejected)",
  !hitOldCap,
  hitOldCap
    ? "MAX_SOURCES is still 50 — the old build"
    : `60 sources passed the cap (rejected further down: ${String(body2?.error ?? "none").slice(0, 70)})`
);
check("4b. and that probe wrote nothing either", !body2?.contextSnapshotId, `contextSnapshotId ${body2?.contextSnapshotId ?? "none"}`);

// ── 5. generateReport:false IS INGEST-ONLY ──────────────────────────
//
// Read off the response shape rather than by ingesting anything: the
// ingest path answers with mode "ingest" and says what it skipped. On
// the old build the request runs audit → estimate → forecast instead.
const res3 = await fetch(`${BASE}/api/refresh`, {
  method: "POST",
  headers,
  body: JSON.stringify({ scopeId, generateReport: false }),
});
const body3 = await res3.json().catch(() => ({}));
check(
  "5. generateReport:false is ingest-only (no audit / estimate / forecast)",
  res3.ok && body3?.mode === "ingest" && Array.isArray(body3?.skipped),
  res3.ok
    ? `mode=${body3?.mode ?? "—"} skipped=${JSON.stringify(body3?.skipped ?? [])}`
    : `HTTP ${res3.status} — ${String(body3?.error ?? "").slice(0, 100)}`
);

// ── 6. THE GRAPH UI ─────────────────────────────────────────────────
// The graph is a client component, so it is not in the server HTML — the
// page shell is what is assertable from outside, and check 2 already
// establishes the read surface it mounts against.
const page = await fetch(`${BASE}/audit`, { headers, redirect: "manual" });
const html = page.status < 400 ? await page.text() : "";
check(
  "6. the Audit page serves",
  page.status < 400 && html.includes("instrument-rail"),
  page.status >= 400 ? `HTTP ${page.status}` : "instrument shell present; the graph mounts client-side against the route proven in check 2"
);

console.log(`\n${failures === 0 ? "DEPLOYMENT VERIFIED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
