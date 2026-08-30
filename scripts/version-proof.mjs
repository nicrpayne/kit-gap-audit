// RUNTIME BUILD IDENTITY — does Signal know which commit it is?
//
// The whole tranche is one claim: a running process can be asked its commit,
// from outside, without credentials, and the answer is the truth about that
// container rather than about a build machine or a screenshot. These are the
// ways that claim can be false.
//
//   V1  the endpoint answers, unauthenticated, with the six agreed fields
//   V2  and with NOTHING else — no secret, no arbitrary environment variable
//   V3  missing Railway variables degrade to "local" rather than crashing
//   V4  the payload is a fact about the container: never cached, never stale
//   V5  the rail renders the short commit, quietly, on every instrument
//   V6  clicking it discloses the full identity in place
//   V7  the verifier PASSES on the right SHA and FAILS on the wrong one
//   V8  nothing here writes
//
//   node scripts/version-proof.mjs [outDir]

import { chromium } from "playwright";
import { execFileSync } from "child_process";
import { mkdirSync } from "fs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const out = process.argv[2] ?? "/tmp/version-shots";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
  if (!ok) failures++;
};

const EXPECTED_FIELDS = ["commit", "shortCommit", "branch", "commitMessage", "deploymentId", "environment"];

console.log(`\nverifying build identity at ${BASE}\n`);

// ── V1. THE ENDPOINT ANSWERS, WITHOUT CREDENTIALS ───────────────────
//
// No cookie, no bearer. That is the point: the check that tells you which
// build you are looking at must work before you can log in to look at it.
const bare = await fetch(`${BASE}/api/version`);
const build = await bare.json().catch(() => null);
check(
  "V1 /api/version answers with no credentials",
  bare.status === 200 && !!build,
  `HTTP ${bare.status} · ${build ? JSON.stringify(build).length : 0} bytes`
);
const keys = build ? Object.keys(build).sort() : [];
check(
  "V1b it returns exactly the six agreed fields",
  keys.length === EXPECTED_FIELDS.length && EXPECTED_FIELDS.every((k) => keys.includes(k)),
  keys.join(", ")
);
console.log(`      ${JSON.stringify(build)}`);

// ── V2. AND NOTHING ELSE ────────────────────────────────────────────
//
// The real risk of an unauthenticated endpoint that reads `process.env` is
// not that it returns the wrong build — it is that it returns a key. There
// is no key parameter to abuse, so this asserts the two things that could
// still go wrong: no field carries a value that looks like a secret, and no
// name from the process's own environment leaks into the payload beyond the
// four Railway variables that are the whole point.
{
  const values = Object.values(build ?? {}).map(String);
  const SECRET_SHAPED = /(sk-|key|token|secret|password|postgres:\/\/|postgresql:\/\/|Bearer\s)/i;
  const offenders = values.filter((v) => SECRET_SHAPED.test(v));
  check("V2 no returned value is secret-shaped", offenders.length === 0, offenders.slice(0, 2).join(" | "));

  // Every value in the payload must be traceable to the allowlist. Compare
  // against this process's own environment: any payload value that equals an
  // env var OTHER than the four allowed ones is a leak.
  const ALLOWED_SOURCES = new Set([
    "RAILWAY_GIT_COMMIT_SHA",
    "RAILWAY_GIT_BRANCH",
    "RAILWAY_GIT_COMMIT_MESSAGE",
    "RAILWAY_DEPLOYMENT_ID",
    "RAILWAY_ENVIRONMENT_NAME",
    "RAILWAY_ENVIRONMENT",
    "NODE_ENV",
  ]);
  const leaked = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 8 || ALLOWED_SOURCES.has(name)) continue;
    if (values.includes(value)) leaked.push(name);
  }
  check("V2b no value in the payload came from an unallowed environment variable", leaked.length === 0, leaked.join(", "));

  // And the endpoint takes no input, so there is nothing to point at a key.
  const probed = await fetch(`${BASE}/api/version?key=DATABASE_URL&name=APP_PASSWORD&field=APP_PASSWORD`);
  const probedBody = await probed.json().catch(() => null);
  check(
    "V2c query parameters cannot widen what it returns",
    JSON.stringify(probedBody) === JSON.stringify(build),
    "identical payload with three hostile parameters attached"
  );
}

// ── V3. MISSING RAILWAY VARIABLES DEGRADE, NEVER CRASH ──────────────
//
// This process has no Railway variables, which is the local-development case
// the brief asks about — so the answer above IS the degraded answer, and it
// is a well-formed object rather than an exception or a 500.
check(
  "V3 absent Railway variables fall back rather than crash",
  build?.commit === "local" || /^[0-9a-f]{7,40}$/.test(String(build?.commit)),
  `commit "${build?.commit}" · branch "${build?.branch}" · deploy "${build?.deploymentId}" · env "${build?.environment}"`
);
check(
  "V3b every field is a non-empty string in the degraded case",
  EXPECTED_FIELDS.every((k) => typeof build?.[k] === "string" && build[k].length > 0),
  EXPECTED_FIELDS.map((k) => `${k}=${JSON.stringify(build?.[k]).slice(0, 24)}`).join(" ")
);

// ── V4. A FACT ABOUT THE CONTAINER, NOT A CACHED ONE ────────────────
check(
  "V4 the response forbids caching",
  /no-store/i.test(bare.headers.get("cache-control") ?? ""),
  `cache-control: ${bare.headers.get("cache-control")}`
);

// ── V5/V6. THE MARK IN THE RAIL ─────────────────────────────────────
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: new URL(BASE).hostname, path: "/" }]);
const p = await ctx.newPage();
const errs = [];
const writes = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("request", (r) => {
  if (r.method() !== "GET") writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
});

await p.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);

const mark = await p.evaluate(() => {
  const el = document.querySelector('[data-shoot="build-id"]');
  if (!el) return null;
  const btn = el.querySelector('[data-shoot="build-id-toggle"]');
  const cs = btn ? getComputedStyle(btn) : null;
  const rail = document.querySelector('[data-shoot="instrument-rail"]');
  return {
    text: btn?.textContent?.trim() ?? null,
    commit: el.getAttribute("data-commit"),
    fontPx: cs ? Number(cs.fontSize.replace("px", "")) : null,
    inRail: !!rail && rail.contains(el),
    // Is it the LAST thing in the rail? A build marker above a destination
    // would be competing for the reader's eye, which is the one thing it
    // must never do.
    last: !!rail && rail.lastElementChild === el,
    label: btn?.getAttribute("aria-label") ?? null,
  };
});
check("V5 the rail renders the short commit", !!mark?.text, mark ? `"${mark.text}" · ${mark.label}` : "no build marker found");
check(
  "V5b it is quiet — small, last in the rail, and not a banner",
  !!mark && mark.inRail && mark.last && mark.fontPx <= 10,
  mark ? `${mark.fontPx}px, last child of the rail: ${mark.last}` : ""
);
await p.screenshot({ path: `${out}/1-rail-with-build-id.png` });
await p.locator('[data-shoot="instrument-rail"]').screenshot({ path: `${out}/2-build-id-closeup.png` });

await p.locator('[data-shoot="build-id-toggle"]').click();
await p.waitForTimeout(400);
const detail = await p.evaluate(() => {
  const d = document.querySelector('[data-shoot="build-id-detail"]');
  return d ? d.textContent.replace(/\s+/g, " ").trim() : null;
});
check("V6 clicking discloses the full identity in place", !!detail && detail.includes(String(build.commit)), detail?.slice(0, 90));
await p.locator('[data-shoot="instrument-rail"]').screenshot({ path: `${out}/3-build-id-expanded.png` });

check("V6b no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
check("V8 the browser wrote nothing", writes.length === 0, writes.slice(0, 3).join(", "));
await b.close();

// ── V7. THE VERIFIER DISCRIMINATES ──────────────────────────────────
//
// The check is only worth having if it can fail. Run the real verifier twice
// against this same origin: once with the commit it is actually running, and
// once with a commit it is not.
{
  const run = (sha) => {
    try {
      return {
        // Credentials passed through, so the ONLY thing that differs between
        // the two runs is EXPECTED_SHA — otherwise a failure could be the
        // session rather than the commit, and the test would prove nothing.
        out: execFileSync("node", ["scripts/deployment-verify.mjs"], {
          env: { ...process.env, BASE_URL: BASE, EXPECTED_SHA: sha, KIT_SESSION: COOKIE },
          encoding: "utf8",
        }),
        code: 0,
      };
    } catch (e) {
      return { out: String(e.stdout ?? ""), code: e.status ?? 1 };
    }
  };
  const right = run(build.commit);
  const wrong = run("deadbee");
  const rightLine = right.out.split("\n").find((l) => l.includes("0b."))?.trim();
  const wrongLine = wrong.out.split("\n").find((l) => l.includes("0b."))?.trim();
  check("V7 the verifier PASSES on the running commit", /^PASS/.test(rightLine ?? ""), rightLine);
  check("V7b and FAILS on a commit that is not running", /^FAIL/.test(wrongLine ?? ""), wrongLine);
  check(
    "V7c a wrong SHA makes the whole verifier exit non-zero",
    wrong.code !== 0,
    `exit ${wrong.code} · ${wrong.out.trim().split("\n").filter(Boolean).pop()}`
  );
  check(
    "V7d and the right SHA leaves the verifier fully green",
    right.code === 0 && /DEPLOYMENT VERIFIED/.test(right.out),
    right.out.trim().split("\n").filter(Boolean).pop()
  );
  check(
    "V7e the wrong SHA fails ONLY that check — nothing else regressed",
    (wrong.out.match(/^FAIL/gm) ?? []).length === 1,
    `${(wrong.out.match(/^FAIL/gm) ?? []).length} failing check(s) in the wrong-SHA run`
  );
}

// ── V9. AND IT REALLY READS RAILWAY, NOT JUST THE FALLBACKS ─────────
//
// Everything above ran against a process with no Railway variables, so every
// value was a fallback — which proves the degraded path and proves nothing
// about the deployed one. This starts a SECOND server on another port with
// the four variables set to known values and asks the same question. If the
// endpoint returned "local" here, the whole tranche would be decoration.
{
  const { spawn } = await import("child_process");
  const PORT = 3311;
  const FAKE = {
    RAILWAY_GIT_COMMIT_SHA: "0318a82c50fd16518c5900608bb80d0520a2b266",
    RAILWAY_GIT_BRANCH: "claude/product-timeline-audit-a72dmg",
    RAILWAY_GIT_COMMIT_MESSAGE: "Zoom reveals identity: the law, its proofs, and what the web costs\n\nbody that must not be served",
    RAILWAY_DEPLOYMENT_ID: "dep_test_0000",
    RAILWAY_ENVIRONMENT_NAME: "production",
  };
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, ...FAKE, PORT: String(PORT) },
    stdio: "ignore",
    detached: true,
  });
  let deployed = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://localhost:${PORT}/api/version`);
      if (res.ok) {
        deployed = await res.json();
        break;
      }
    } catch {
      /* not up yet */
    }
  }
  try {
    process.kill(-child.pid);
  } catch {
    /* already gone */
  }
  if (!deployed) {
    check("V9 the endpoint reads the Railway variables", false, "the probe server did not come up");
  } else {
    console.log(`      ${JSON.stringify(deployed)}`);
    check(
      "V9 the endpoint reports the deploy's real commit, branch and deployment id",
      deployed.commit === FAKE.RAILWAY_GIT_COMMIT_SHA &&
        deployed.shortCommit === "0318a82" &&
        deployed.branch === FAKE.RAILWAY_GIT_BRANCH &&
        deployed.deploymentId === FAKE.RAILWAY_DEPLOYMENT_ID &&
        deployed.environment === "production",
      `${deployed.shortCommit} on ${deployed.branch} · deploy ${deployed.deploymentId} · ${deployed.environment}`
    );
    check(
      "V9b only the commit's SUBJECT line is served, never the body",
      deployed.commitMessage === "Zoom reveals identity: the law, its proofs, and what the web costs" &&
        !deployed.commitMessage.includes("must not be served"),
      JSON.stringify(deployed.commitMessage)
    );
    // And the verifier discriminates against a REAL sha, not just "local".
    const runAt = (sha) => {
      try {
        return {
          out: execFileSync("node", ["scripts/deployment-verify.mjs"], {
            env: { ...process.env, BASE_URL: BASE, EXPECTED_SHA: sha, KIT_SESSION: COOKIE },
            encoding: "utf8",
          }),
          code: 0,
        };
      } catch (e) {
        return { out: String(e.stdout ?? ""), code: e.status ?? 1 };
      }
    };
    const mismatched = runAt("0318a82");
    const line = mismatched.out.split("\n").find((l) => l.includes("0b."))?.trim();
    check(
      "V9c a verifier pointed at the WRONG origin catches the mismatch",
      /^FAIL/.test(line ?? "") && /0318a82/.test(line ?? ""),
      line
    );
  }
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
