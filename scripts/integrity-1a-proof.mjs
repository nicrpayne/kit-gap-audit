// SIGNAL INTEGRITY TRANCHE 1A — the four claims, proven.
//
//   A. Clicking "Draft ticket" performs ZERO Linear writes.
//   B. Only an explicit "Create issue in Linear" reaches the write path.
//   C. URL state survives refresh, back/forward and direct navigation.
//   D. A copied historical report carries its snapshot provenance.
//
// A and B are the ones that matter most, because the failure they guard
// against happens OUTSIDE Signal, in a workspace we do not own and cannot
// roll back. They are proven at the network layer rather than by reading
// the UI: every request the browser makes is recorded, and the assertion is
// about what was and was not sent.
//
//   node scripts/integrity-1a-proof.mjs
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EXEC = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const db = new PrismaClient();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();

// Every request the page makes, so "did anything reach the write path" is a
// recorded fact rather than an inference.
let calls = [];
p.on("request", (r) => calls.push({ method: r.method(), url: r.url() }));
const writes = () =>
  calls.filter((c) => c.method === "POST" && /\/api\/findings\/[^/]+\/ticket$/.test(c.url));
const previews = () => calls.filter((c) => /\/api\/findings\/[^/]+\/ticket\/preview$/.test(c.url));

// ── A + B. THE EXTERNAL WRITE CONTRACT ─────────────────────────────────
{
  const source = await db.source.findFirst({
    where: { findings: { some: { status: "open" } } },
    select: { id: true },
  });

  if (!source) {
    console.log("SKIP  no source with an open finding in this database");
  } else {
    await p.goto(`${BASE}/audit/${source.id}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.waitForSelector('[data-shoot="draft-ticket"]', { timeout: 60000 });
    await p.waitForTimeout(800);

    calls = [];
    await p.locator('[data-shoot="draft-ticket"]').first().click();
    await p.waitForSelector('[data-shoot="ticket-review"]', { timeout: 30000 });
    await p.waitForTimeout(600);

    check("A1. Clicking Draft performs zero writes to the ticket endpoint",
      writes().length === 0, `${writes().length} POST(s)`);
    check("A2. …it reads the preview instead", previews().length === 1, `${previews().length} preview call(s)`);
    check("A3. …and the review panel says nothing was created",
      /Nothing has been created yet/i.test(await p.locator('[data-shoot="ticket-review"]').innerText()));
    check("A4. …showing the title that would be filed",
      (await p.locator('[data-shoot="preview-title"]').innerText()).trim().length > 0);

    // The control that writes must NAME the system it writes to.
    const createLabel = (await p.locator('[data-shoot="create-in-linear"]').innerText()).trim();
    check("B1. The only writing control names Linear", /linear/i.test(createLabel), createLabel);

    // Cancelling must also write nothing.
    calls = [];
    await p.locator('[data-shoot="ticket-review"] button', { hasText: "Cancel" }).first().click();
    await p.waitForTimeout(600);
    check("B2. Cancelling the review performs zero writes", writes().length === 0, `${writes().length} POST(s)`);

    // THE API ITSELF REFUSES, not merely the UI. A legacy bare POST — the
    // exact call shape that used to file an issue — must not write.
    const bare = await p.evaluate(async ([base, id]) => {
      const res = await fetch(`${base}/api/findings/${id}/ticket`, { method: "POST" });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    }, [BASE, await db.finding.findFirst({ where: { status: "open" }, select: { id: true } }).then((f) => f?.id)]);
    check("B3. An unconfirmed POST is refused by the API", bare.status === 400, `${bare.status}`);
    check("B4. …and returns the preview rather than creating anything",
      Boolean(bare.body?.preview) && bare.body?.created === false);
  }
}

// ── C. URL STATE ───────────────────────────────────────────────────────
{
  const scopes = await db.scope.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const target = scopes[1]?.id ?? scopes[0]?.id;

  // Normalisation cannot happen until the surface knows which projects
  // exist, and Forecast and Reports each fetch that list first. Waiting on
  // the condition rather than a fixed sleep — a sleep long enough for the
  // slowest surface is a sleep that hides a regression in the fastest.
  const waitForParam = async (expected) => {
    await p
      .waitForFunction(
        (want) => {
          const v = new URL(location.href).searchParams.get("project");
          return want ? v === want : Boolean(v);
        },
        expected ?? null,
        { timeout: 30000 }
      )
      .catch(() => {});
  };

  for (const route of ["/forecast", "/scope", "/orbit", "/decisions", "/reports"]) {
    await p.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitForParam(null);
    const normalised = new URL(p.url()).searchParams.get("project");
    check(`C·${route} normalises to an explicit ?project=`, Boolean(normalised), normalised ?? "absent");

    // A direct link must reproduce the selection, and a refresh must keep it.
    await p.goto(`${BASE}${route}?project=${encodeURIComponent(target)}`, {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await waitForParam(target);
    const direct = new URL(p.url()).searchParams.get("project");
    await p.reload({ waitUntil: "domcontentloaded" });
    await waitForParam(target);
    const afterReload = new URL(p.url()).searchParams.get("project");
    check(`C·${route} direct link + refresh reproduce it`,
      direct === target && afterReload === target, `${direct} → ${afterReload}`);
  }

  // Back/forward walks the selections rather than skipping the page.
  const [a, bId] = [scopes[0]?.id, scopes[1]?.id];
  if (a && bId) {
    await p.goto(`${BASE}/reports?project=${a}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitForParam(a);
    await p.selectOption("select", bId).catch(() => {});
    await p.waitForTimeout(2000);
    const moved = new URL(p.url()).searchParams.get("project");
    await p.goBack({ waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2000);
    const back = new URL(p.url()).searchParams.get("project");
    check("C·back returns to the previous selection", moved === bId && back === a, `${moved} → back → ${back}`);
  }

  // An unrecognised project falls back deterministically instead of breaking.
  await p.goto(`${BASE}/reports?project=no-such-scope`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitForParam(scopes[0]?.id);
  const fellBack = new URL(p.url()).searchParams.get("project");
  check("C·an invalid project falls back deterministically",
    fellBack === scopes[0]?.id, `${fellBack}`);
}

// ── D. HISTORICAL REPORT PROVENANCE ────────────────────────────────────
{
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await p.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await p.waitForTimeout(3000);

  const banner = await p.locator('[data-shoot="report-snapshot-banner"]').count();
  if (banner === 0) {
    console.log("SKIP  no stored report in this database to label");
  } else {
    const text = await p.locator('[data-shoot="report-snapshot-banner"]').innerText();
    check("D1. A stored report is labelled a historical snapshot", /historical snapshot/i.test(text));
    check("D2. …and states when it was generated", /generated/i.test(text), text.split("\n").pop()?.slice(0, 70));

    await p.locator("button", { hasText: "Copy to clipboard" }).first().click();
    await p.waitForTimeout(600);
    const copied = await p.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    check("D3. The copied text carries the snapshot provenance",
      /HISTORICAL SNAPSHOT/i.test(copied), copied.split("\n")[0]?.slice(0, 80));
    check("D4. …including the generated date, before the report body",
      /generated/i.test(copied.split("\n")[0] ?? ""));
  }
}

await db.$disconnect();
await b.close();
console.log(failures === 0 ? "\nTRANCHE 1A PROOFS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
