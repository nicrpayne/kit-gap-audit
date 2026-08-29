// SOURCE ARTIFACTS — THE BROWSER PASS.
//
// The chain a person actually wants to walk is four distinct nodes:
//
//   Finding / Requirement → Passage → Transcript | Notion page | Figma frame
//
// This checks that each link in it is navigable, that the three artifact
// kinds are tellable apart on the field, and that opening one exposes its own
// passages and nobody else's.
//
//   node scripts/audit-sources-shoot.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.KIT_SESSION ?? "92f4fb441fbc9fa64f985de1a2d83fce26c903a5f595835fb2782c0e6a9cc742";
const out = process.argv[2] ?? "/tmp/src-shots";
mkdirSync(out, { recursive: true });

let failures = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));

const settle = (ms = 450) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1560, 960); await settle(250); };
const fit = async () => { await p.locator('[data-shoot="camera-fit"]').click(); await settle(700); };
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log(`      shot ${n}`); };
const tier = () => p.getAttribute('[data-shoot="signal-graph"]', "data-zoom");
const cam = () => p.evaluate(() => {
  const s = document.querySelector('[data-shoot="signal-graph"]');
  const v = s.viewBox.baseVal;
  return { x: +(v.x + v.width / 2).toFixed(2), y: +(v.y + v.height / 2).toFixed(2), k: +(s.getBoundingClientRect().width / v.width).toFixed(4) };
});
const ART = '[data-kind="transcript"], [data-kind="notion_page"], [data-kind="figma_artifact"], [data-kind="source"]';
const count = (sel) => p.locator(sel).count();
const zoomTo = async (want) => {
  await p.mouse.move(700, 500);
  for (let i = 0; i < 40 && (await tier()) !== want; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(28); }
  await settle(450);
};
const selectKind = (kind) => p.evaluate((k) => {
  document.querySelector(`[data-kind="${k}"] g[role="button"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}, kind);
const inspector = () => p.locator('[data-shoot="graph-inspector"]').innerText();

await p.goto(`${BASE}/audit?scope=jsa`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
await settle(1800);
await park();

// ── 1. FAR — source population as latent mass ────────────────────────
{
  const n = await count(ART);
  const latent = await count(`[data-identity="latent"]${""}`.length ? '[data-kind="transcript"][data-identity="latent"], [data-kind="notion_page"][data-identity="latent"], [data-kind="figma_artifact"][data-identity="latent"], [data-kind="source"][data-identity="latent"]' : ART);
  await shot("01-far");
  check("1. six source artifacts are on the field at far zoom", n === 6, `${n} artifacts`);
  check("1b. all latent — population before identity", latent === 6, `${latent} latent of ${n}`);
}

// ── 2. MEDIUM — distinguishable by TYPE ──────────────────────────────
{
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(900);
  await zoomTo("medium");
  await park();
  await shot("02-medium");
  const kinds = await p.evaluate(() => {
    const out = {};
    for (const k of ["transcript", "notion_page", "figma_artifact", "source"]) {
      out[k] = [...document.querySelectorAll(`[data-kind="${k}"]:not([data-identity="latent"])`)].length;
    }
    return out;
  });
  check(
    "2. each artifact kind is formed and distinguishable at medium",
    kinds.transcript === 1 && kinds.notion_page === 2 && kinds.figma_artifact === 1 && kinds.source === 2,
    `transcript ${kinds.transcript} · notion ${kinds.notion_page} · figma ${kinds.figma_artifact} · generic ${kinds.source}`
  );
}

// ── 3. CLOSE — titles resolve ────────────────────────────────────────
{
  // NAMES ARRIVE AT THE CONSTELLATION TIER, NOT AT THE EVIDENCE TIER. A
  // source artifact IS the hub of its constellation, so its name is part of
  // the shape you are looking at rather than detail inside it — and by
  // `close` the camera is at 260%+, where the whole field no longer fits and
  // "do all four resolve" has become a question about the viewport.
  await zoomTo("medium");
  await park();
  await shot("03-close-names");
  const labels = await p.evaluate(() =>
    [...document.querySelectorAll('[data-kind="transcript"], [data-kind="notion_page"], [data-kind="figma_artifact"]')]
      .map((e) => e.querySelector("text")?.textContent ?? null).filter(Boolean)
  );
  check("3. source titles resolve at the constellation tier", labels.length === 4, labels.join(" · "));
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}

// ── 4. SEARCH ────────────────────────────────────────────────────────
{
  await p.locator('[data-shoot="graph-search"]').fill("Delivery sync");
  await settle(700);
  const rows = await p.evaluate(() => [...document.querySelectorAll('[data-shoot="search-results"] button')].map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()));
  await park();
  await shot("04-search-delivery-sync");
  check("4. searching finds the transcript, labelled Transcript", rows.some((r) => r.includes("Transcript")), rows.join(" | "));

  await p.locator('[data-shoot="graph-search"]').fill("JSA delivery");
  await settle(600);
  const notionRows = await p.evaluate(() => [...document.querySelectorAll('[data-shoot="search-results"] button')].map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()));
  check("4b. and the Notion page, labelled Notion page", notionRows.some((r) => r.includes("Notion page")), notionRows.join(" | "));
  await p.locator('[data-shoot="graph-search"]').fill("");
  await p.keyboard.press("Escape");
  await settle(400);
  await fit();
}

// ── 5 & 6. TRANSCRIPT: select, then expand its passages ──────────────
{
  // Search auto-expands whatever it reveals, so evidence may already be open
  // from step 4 — toggling blind would CLOSE it and leave the transcript a
  // latent mark with nothing to click.
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(500);
  await p.locator('[data-shoot="cluster-toggle-evidence"]').click({ force: true });
  await settle(1100);
  const before = await cam();
  await selectKind("transcript");
  await settle(700);
  const after = await cam();
  // Focus may now claim screen territory when the local world is too small
  // to read — bounded at double, and at 1.8 absolute. What is proved here is
  // that bound, not stillness.
  check(
    "5. selecting a transcript frames it within the comprehension caps",
    after.k <= before.k * 2.01 && after.k <= 1.81,
    `k ${before.k} → ${after.k}`
  );
  const t = await inspector();
  check("5b. and the inspector calls it a Transcript", /^TRANSCRIPT/im.test(t), t.split("\n")[0]);
  check("5c. with its role, status and read date", /raw_evidence/i.test(t) && /candidate/i.test(t) && /2026-08-21/.test(t));
  // A PASSAGE IS STILL AN ANCHOR, NOT A PARAGRAPH — the artifact reports how
  // many it has and never prints its own body. What changed is how each
  // passage NAMES itself in the connections list: a one-line quote rather
  // than `hermes-ev:2026-…-seg018`, because 156 accession numbers is not a
  // reading path. The row is one line, clipped, and its exact id is one
  // disclosure away on the passage itself.
  check(
    "5d. a passage count, and passages that name themselves by their words",
    /Passages\s*2/i.test(t.replace(/\n/g, " ")) && !/hermes-ev:/i.test(t),
    "a passage is a navigable anchor, not a paragraph"
  );
  await park();
  await shot("05-transcript-selected");

  const openedBefore = await count('[data-kind="passage"]:not([data-identity="latent"])');
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(600);
  // NO RE-SELECTION HERE, DELIBERATELY.
  //
  // The transcript is still selected from step 5, and a selected node now
  // survives a collapse — that is the fix for invisible selections. It is
  // therefore the only artifact still carrying a role, so "click the first
  // transcript" would land on the one already selected and toggle it OFF,
  // leaving no inspector and no expand control. Collapsing around a live
  // selection and finding its own control still there IS the thing being
  // tested.
  await settle(400);
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(600);
  // WHAT THE CONTROL IS NOW ACTUALLY FOR: PERSISTENCE.
  //
  // Selecting an artifact already promotes its own passages — that is the
  // one-hop reveal, and it lasts exactly as long as the selection. Expanding
  // makes them STAY, which is what lets a reader open one transcript's
  // evidence and then go and look at something else.
  //
  // So the measurement is taken across the CLEAR, not across the click: with
  // the cluster collapsed, an unexpanded artifact's passages fall back to
  // marks the moment it is deselected, and an expanded one's do not. There is
  // no second selection in here because there cannot be — a collapsed
  // artifact is reachable only while it is the live selection, which is the
  // whole reason its control has to be on its own panel.
  const promoted = await count('[data-kind="passage"]:not([data-identity="latent"])');
  await p.locator('[data-shoot="source-expand"]').click();
  await settle(700);
  await p.keyboard.press("Escape");
  await settle(700);
  const durable = await count('[data-kind="passage"]:not([data-identity="latent"])');
  await park();
  await shot("06-transcript-expanded");
  check(
    "6. expanding the transcript keeps exactly its own two passages open",
    promoted === 2 && durable === 2,
    `${promoted} promoted while selected → ${durable} still open after clearing (the evidence sector holds 5)`
  );
  // And the durable set really is the artifact's own doing: clearing every
  // expansion returns them to marks.
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(700);
  const cleared = await count('[data-kind="passage"]:not([data-identity="latent"])');
  check("6b. and collapsing everything returns them to marks", cleared === 0, `${durable} → ${cleared} formed passages`);
  // Step 6b left the field closed; the next block needs a passage to click.
  await p.locator('[data-shoot="cluster-toggle-evidence"]').click({ force: true });
  await settle(900);
  void openedBefore;
}

// ── 7. AN EVIDENCE PASSAGE ───────────────────────────────────────────
{
  await p.evaluate(() => document.querySelector('[data-kind="passage"]:not([data-identity="latent"]) g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await settle(700);
  const t = await inspector();
  await park();
  await shot("07-passage-selected");
  check("7. a passage opens as an Evidence passage with its quote", /^EVIDENCE PASSAGE/im.test(t) && /extracted from/i.test(t), t.split("\n")[0]);
}

// ── 8 & 9. NOTION PAGE AND FIGMA ARTIFACT ────────────────────────────
{
  await p.locator('[data-shoot="expand-all"]').click();
  await settle(900);
  // The DOM holds two Notion pages and the declared-but-unread one comes
  // first. Pick the one that actually supplied evidence.
  await p.evaluate(() => {
    const el = [...document.querySelectorAll('[data-kind="notion_page"]')].find((e) => (e.getAttribute("data-shoot") ?? "").includes("source:pkg:"));
    el?.querySelector('g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle(700);
  const t = await inspector();
  await park();
  await shot("08-notion-selected");
  check("8. a Notion page opens as one, with its role", /^NOTION PAGE/im.test(t) && /requirements_of_record/i.test(t), t.split("\n")[0]);
  check(
    "8b. and says its passages are already on the graph, the cluster being open",
    /passages are already on the graph/i.test(t) && /Passages\s*2/i.test(t.replace(/\n/g, " ")),
    "no dead control: the toggle appears only when it would change something"
  );

  await selectKind("figma_artifact");
  await settle(700);
  const f = await inspector();
  await park();
  await shot("09-figma-selected");
  check("9. a Figma artifact opens as one", /^FIGMA ARTIFACT/im.test(f), f.split("\n")[0]);
  check("9b. and never claims to implement anything", !/implements/i.test(f), "design intent, not execution");
  await p.keyboard.press("Escape");
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}

// ── 10. FINDING → EVIDENCE SOLO → SOURCE ─────────────────────────────
{
  await p.evaluate(() => document.querySelector('[data-shoot^="node-finding:"] g[role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await settle(900);
  const solo = p.locator('[data-shoot="evidence-solo-toggle"]');
  if (await solo.count()) {
    await solo.click();
    await settle(1000);
    const lit = await p.evaluate(() =>
      [...document.querySelectorAll('[data-shoot^="node-"]')]
        .filter((e) => parseFloat(e.getAttribute("opacity") || "1") > 0.5)
        .map((e) => e.getAttribute("data-kind"))
    );
    await park();
    await shot("10-evidence-solo-to-source");
    const artifacts = lit.filter((k) => ["transcript", "notion_page", "figma_artifact", "source"].includes(k));
    check("10. Evidence Solo runs the finding all the way to its source artifact", artifacts.length > 0, `lit: ${[...new Set(lit)].join(", ")}`);
    check("10b. and still never reaches Reality", !lit.includes("reality"));
    await solo.click();
    await settle(400);
  } else {
    check("10. Evidence Solo available", false, "no toggle");
  }
  await p.keyboard.press("Escape");
  await fit();
}

// ── 11. COLLAPSE AGAIN ───────────────────────────────────────────────
{
  // Solo and search both auto-expand; with the evidence cluster open the
  // per-source toggle is deliberately not offered, so reset first.
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(500);
  await p.locator('[data-shoot="cluster-toggle-evidence"]').click({ force: true });
  await settle(1000);
  await selectKind("transcript");
  await settle(500);
  await p.locator('[data-shoot="collapse-all"]').click();
  await settle(600);
  const wasThere = await p.locator('[data-shoot="source-expand"]').count();
  if (wasThere) {
    // Same reading as step 6, across the clear rather than across the click.
    await p.locator('[data-shoot="source-expand"]').click();
    await settle(500);
    await p.keyboard.press("Escape");
    await settle(700);
    const openState = await count('[data-kind="passage"]:not([data-identity="latent"])');
    await p.locator('[data-shoot="collapse-all"]').click();
    await settle(700);
    const closedState = await count('[data-kind="passage"]:not([data-identity="latent"])');
    check("11. collapsing the source returns its passages to marks", openState - closedState === 2, `${openState} → ${closedState} formed passages`);
  } else {
    check("11. the expand control is present on a selected transcript", false);
  }
  await p.keyboard.press("Escape");
  await fit();
}

// ── 12. INTERRUPT AN EXPANSION FLY-TO ────────────────────────────────
{
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
  await p.locator('[data-shoot="cluster-toggle-evidence"]').click({ force: true });
  await p.waitForTimeout(80);
  await p.mouse.move(700, 500);
  await p.mouse.wheel(0, 200);
  const grabbed = await cam();
  await p.waitForTimeout(600);
  const later = await cam();
  check("12. a zoom takes the camera off the expansion fly-to", Math.abs(later.k - grabbed.k) < 0.005, `held at k=${later.k}`);
  await p.locator('[data-shoot="collapse-all"]').click();
  await fit();
}

// ── 13. A SPARSE SCOPE STAYS HONEST ──────────────────────────────────
{
  await p.goto(`${BASE}/audit?scope=itrack`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="signal-graph"]', { timeout: 30000 });
  await settle(1400);
  const n = await count(ART);
  await park();
  await shot("11-sparse-scope");
  check("13. a Scope with no sources shows no source artifacts", n === 0, `${n} artifacts on iTrack`);
}

check("14. no page errors during the whole run", errs.length === 0, errs.join(" | "));
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
await b.close();
process.exit(failures === 0 ? 0 : 1);
