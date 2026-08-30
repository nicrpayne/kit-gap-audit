// SIGNAL SEARCH — LEVEL 1, IN A BROWSER.
//
// The half of the search tranche that only exists once there is a real DOM,
// a pointer and a running camera. The model, the ranking and the query matrix
// are proved headlessly in scripts/audit-search-proof.ts; this proves the
// things that file cannot reach:
//
//    1  the field is findable by the words drawn ON IT
//    2  an evidence quote, copied off the screen, finds its own passage
//    3  a result says what it is before it says which one it is
//    4  THE LENS: repeated searches do not accumulate opened nodes
//    5  clearing the search puts the field back exactly as it was
//    6  taking a result opens the minimum and focuses the canonical node
//    7  Escape, and the order it does things in
//    8  arrow keys and Enter
//    9  the no-results state says how the query was read
//   10  search never writes: no request leaves the browser on a keystroke
//
//   node scripts/audit-search-shoot.mjs /tmp/search-shots
//
// Needs a running instance and a seeded database. See the proof's header for
// what runs without either.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { createHash } from "crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.APP_PASSWORD ?? "proof";
const SCOPE = process.env.SCOPE_ID ?? "jsa";
const out = process.argv[2] ?? "/tmp/search-shots";
mkdirSync(out, { recursive: true });

// The same derivation lib/auth.ts uses, so the shoot signs in the way the
// product does rather than through a back door.
const COOKIE = createHash("sha256").update(`kit-gap-audit::${PASSWORD}`).digest("hex");

let failures = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  — ${d}` : ""}`);
  if (!ok) failures++;
};
const measured = {};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "kit_session", value: COOKIE, domain: "localhost", path: "/" }]);
const p = await ctx.newPage();

const errs = [];
p.on("pageerror", (e) => errs.push(e.message));

// EVERY REQUEST, RECORDED. Law 15 is that search is read-only; the strongest
// browser-side form of that is "typing sends nothing".
const requests = [];
p.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));

const settle = (ms = 350) => p.waitForTimeout(ms);

/** The centre of an element, or null when it is not actually on screen.
    A mark seated below the fold has a bounding box and no pointer target;
    clicking its coordinates hits the page, not the node. */
const onScreenCentre = async (locator) => {
  const box = await locator.boundingBox();
  if (!box) return null;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (cx < 4 || cy < 4 || cx > 1436 || cy > 896) return null;
  return { x: cx, y: cy };
};
const shot = async (name) => p.screenshot({ path: `${out}/${name}.png` });

const search = async (q, { clear = true } = {}) => {
  const box = p.locator('[data-shoot="graph-search"]');
  await box.click();
  if (clear) await box.fill("");
  await box.type(q, { delay: 12 });
  await settle();
};

/** Which nodes are currently showing their identity. The renderer marks an
    opened node in the DOM; this is the number the 435-of-438 defect was
    measured in. */
const openedCount = () =>
  p.evaluate(() => document.querySelectorAll('[data-opened="true"]').length);
const nodeCount = () => p.evaluate(() => document.querySelectorAll("[data-opened]").length);

const results = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('[data-shoot="search-result"]')].map((el) => ({
      kind: el.getAttribute("data-result-kind"),
      family: el.getAttribute("data-result-family"),
      text: el.innerText.replace(/\s+/g, " ").trim(),
    }))
  );

await p.goto(`${BASE}/audit?scope=${SCOPE}`, { waitUntil: "networkidle" });
await settle(1400);
await shot("00-rest");

const total = await nodeCount();
const restOpened = await openedCount();
console.log(`\nField: ${total} nodes drawn, ${restOpened} opened at rest.\n`);
measured.nodes = total;
measured.openedAtRest = restOpened;

// ── 1. THE FIELD IS FINDABLE BY WHAT IS DRAWN ON IT ────────────────────
//
// The verified production failure. Read a source's label straight off the
// rendered field, then type exactly that.
{
  // HOW A READER ACTUALLY LEARNS A THING'S NAME.
  //
  // At the resting camera the field is deliberately mostly marks — identity
  // resolves with distance and with attention, which is the zoom law — so
  // "read a label off the screen" means putting the pointer on something.
  // Hovering forces the name, exactly as it does for a person hunting for a
  // transcript they half remember.
  //
  // The trailing ellipsis of a truncated label is dropped, because a reader
  // typing what they can see does not type the ellipsis either.
  // The evidence sector is collapsed at rest — that is the disclosure law
  // working, and it is also why a transcript has no name on screen until you
  // open it. Open it the way the instrument offers, then read.
  const evidenceToggle = p.locator('[data-shoot="cluster-toggle-evidence"]');
  if ((await evidenceToggle.count()) > 0) {
    await evidenceToggle.first().click();
    await settle(900);
  }
  await shot("01a-evidence-open");

  const drawn = [];
  const marks = p.locator('[data-kind="transcript"], [data-kind="source"], [data-kind="notion_page"]');
  const n = await marks.count();
  for (let i = 0; i < n; i++) {
    const c = await onScreenCentre(marks.nth(i));
    if (!c) continue;
    await p.mouse.move(c.x, c.y);
    await p.waitForTimeout(200);
    // THIS node's own label, not every label on screen — a previously
    // hovered node's name lingers, and reading it here would test nothing.
    const own = marks.nth(i).locator('[data-shoot="node-label"]');
    if ((await own.count()) === 0) continue;
    const t = ((await own.first().textContent()) ?? "").replace(/\u2026\s*$/, "").trim();
    if (t.length > 6) drawn.push(t);
  }
  await p.mouse.move(1420, 880);
  await settle(200);
  console.log(`    labels read off the field by hovering: ${drawn.length}`);
  await shot("01b-label-on-field");

  const label = drawn.find((s) => / · /.test(s)) ?? drawn[0];
  if (!label) {
    check("1 a label is drawn on the field to search for", false, "no labelled node found");
  } else {
    // The words a reader would actually type: drop the date prefix, since
    // nobody types the date when they mean the meeting.
    const words = label.replace(/^\d{4}-\d{2}-\d{2}\s*·\s*/, "").trim();
    await search(words);
    const r = await results();
    check(
      "1 typing the words drawn on the field finds the thing they name",
      r.length > 0,
      `"${words}" → ${r.length} results`
    );
    check(
      "1b and the words are in the first result",
      (r[0]?.text ?? "").toLowerCase().includes(words.split(" ")[0].toLowerCase()),
      r[0]?.text.slice(0, 70) ?? "none"
    );
    measured.fieldLabelQuery = { words, results: r.length };
    await shot("01-label-query");
  }
  // Back to the resting camera, so everything below measures the field the
  // instrument opens on rather than wherever taking a result flew it.
  await p.keyboard.press("Escape");
  await p.locator('[data-shoot="camera-fit"]').click();
  await settle(700);
}

// ── 2. AN EVIDENCE QUOTE, COPIED OFF THE SCREEN ────────────────────────
{
  // Open the evidence sector so a passage is on screen, read its quote, and
  // search it. This is the exact production failure: visible text, no result.
  // Same route as the label above: put the pointer on a passage and read the
  // quote the field paints. This is the second verified production failure —
  // text plainly visible on screen that search returned nothing for.
  //   "I am looking at this Evidence Passage. I can see the sentence. Why
  //    does searching it return nothing?"
  //
  // The field only names a passage at close zoom — identity resolves with
  // distance, which is the zoom law and not a search concern — so the surface
  // where a reader actually READS a quote is the inspector. Select a passage,
  // read the quote out of the inspector, then type it. That is the exact
  // sequence the reported failure came in through.
  let quote = null;
  await search("passage");
  const passageRow = p.locator('[data-shoot="search-result"][data-result-kind="passage"]').first();
  if ((await passageRow.count()) > 0) {
    await passageRow.click();
    await settle(900);
    const inspector = await p.locator('[data-shoot="graph-inspector"]').innerText();
    // The longest quoted run the inspector shows — that is the passage's own
    // words rather than a heading or a relationship row.
    const quoted = [...inspector.matchAll(/[\u201c"]([^\u201d"]{24,})[\u201d"]/g)].map((m) => m[1]);
    quote = quoted.sort((a, b) => b.length - a.length)[0] ?? null;
    if (!quote) {
      // No quote marks: fall back to the longest sentence-shaped line.
      quote =
        inspector
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 30 && / /.test(l) && !/^[A-Z ]+$/.test(l))
          .sort((a, b) => b.length - a.length)[0] ?? null;
    }
  }
  await shot("02a-passage-selected");

  if (!quote) {
    console.log("SKIP  2 no passage quote painted on the field to read");
  } else {
    const selectedId = await p.evaluate(
      () => document.querySelector('[data-selected="true"]')?.getAttribute("data-shoot")?.replace(/^node-/, "") ?? null
    );
    const words = quote.split(" ").slice(0, 8).join(" ");
    await search(words);
    const r = await results();
    check("2 a quote read off the screen finds its own passage", r.length > 0, `"${words.slice(0, 52)}…" → ${r.length}`);
    check("2b and the top result IS that passage", r[0]?.kind === "passage", r[0]?.kind ?? "none");
    // The strongest form: the same canonical node, not merely the same kind.
    await p.locator('[data-shoot="search-result"]').first().click();
    await settle(700);
    const landedOn = await p.evaluate(
      () => document.querySelector('[data-selected="true"]')?.getAttribute("data-shoot")?.replace(/^node-/, "") ?? null
    );
    check(
      "2c and taking it lands on the same canonical node the quote was read from",
      selectedId != null && landedOn === selectedId,
      `${selectedId} → ${landedOn}`
    );
    measured.quoteQuery = { words, results: r.length, topKind: r[0]?.kind };
    await shot("02-quote-query");
  }
}

// ── 3. A RESULT SAYS WHAT IT IS ────────────────────────────────────────
{
  await search("offline");
  const r = await results();
  check("3 every result declares a family", r.length > 0 && r.every((x) => x.family), `${r.length} results`);
  check("3b every result declares a kind", r.every((x) => x.kind));
  check(
    "3c a result does not lead with a raw id",
    r.every((x) => !/^(passage|source|intel|work):/.test(x.text)),
    r[0]?.text.slice(0, 60) ?? ""
  );
  measured.families = [...new Set(r.map((x) => x.family))];
  await shot("03-result-types");
}

// ── 4. THE LENS — REPEATED SEARCHES DO NOT ACCUMULATE ──────────────────
//
// THE 435-OF-438 DEFECT, REPRODUCED AS A TEST. Twelve queries, then clear.
{
  await p.keyboard.press("Escape");
  await settle();
  const before = await openedCount();

  const QUERIES = [
    "notification", "decision", "risk", "offline", "evidence", "capacity",
    "requirement", "source", "linear", "work", "finding", "transcript",
  ];
  const peaks = [];
  for (const q of QUERIES) {
    await search(q);
    peaks.push(await openedCount());
  }
  const peak = Math.max(...peaks);
  await shot("04-after-twelve-queries");

  // CLEAR. The field must be exactly what it was.
  await p.keyboard.press("Escape");
  await settle(500);
  const after = await openedCount();
  await shot("05-after-clearing");

  console.log(`\n    opened at rest ${before} · peak during 12 queries ${peak} · after clearing ${after} · field ${total}\n`);
  measured.lens = { before, peak, after, total };

  check(
    "4 twelve consecutive searches leave the reader's own disclosure EXACTLY as they found it",
    after === before,
    `${before} → ${after} opened (the evidence sector the shoot opened above is still open, and only that)`
  );
  check(
    "4b and no query ever opened the whole field",
    peak < total,
    `peak ${peak} of ${total} — the defect reached 435 of 438`
  );
  check(
    "5 clearing the search restores disclosure rather than leaving it expanded",
    after === before,
    `${after} opened, was ${before}`
  );
}

// ── 6. TAKING A RESULT ─────────────────────────────────────────────────
{
  await p.keyboard.press("Escape");
  await settle();
  const before = await openedCount();

  await search("offline");
  const r = await results();
  await p.locator('[data-shoot="search-result"]').first().click();
  await settle(700);
  const after = await openedCount();
  await shot("06-result-taken");

  check("6 taking a result selects a canonical graph node", await p.evaluate(() => !!document.querySelector('[data-selected="true"]')));
  check(
    "6b and it opens the minimum, not the field",
    after - before <= Math.max(24, Math.round(total * 0.2)),
    `${before} → ${after} of ${total}`
  );
  check(
    "6c the result list folds away so it stops covering what it just found",
    (await p.locator('[data-shoot="search-results"]').count()) === 0
  );
  check("6d the query survives, so search navigation is not lost", (await p.inputValue('[data-shoot="graph-search"]')) === "offline");
  measured.take = { before, after, results: r.length };
}

// ── 7. ESCAPE ──────────────────────────────────────────────────────────
{
  await p.keyboard.press("Escape");
  await settle(400);
  check("7 Escape clears the query first", (await p.inputValue('[data-shoot="graph-search"]')) === "");
  const stillSelected = await p.evaluate(() => !!document.querySelector('[data-selected="true"]'));
  check("7b and leaves the selection, which is a second Escape's job", stillSelected);
  await p.keyboard.press("Escape");
  await settle(400);
  check("7c a second Escape clears the selection", !(await p.evaluate(() => !!document.querySelector('[data-selected="true"]'))));
  await shot("07-escape");
}

// ── 8. ARROW KEYS AND ENTER ────────────────────────────────────────────
{
  await search("offline");
  const n = (await results()).length;
  check("8 the list has more than one result to arrow through", n > 1, `${n} results`);
  const first = await p.evaluate(() =>
    document.querySelector('[data-shoot="search-result"][aria-selected="true"]')?.getAttribute("data-result-index")
  );
  await p.keyboard.press("ArrowDown");
  await settle(120);
  const second = await p.evaluate(() =>
    document.querySelector('[data-shoot="search-result"][aria-selected="true"]')?.getAttribute("data-result-index")
  );
  check("8a the cursor starts on the top hit", first === "0", String(first));
  check("8b ArrowDown moves it", second === "1", String(second));

  await p.keyboard.press("ArrowUp");
  await p.keyboard.press("ArrowUp");
  const clamped = await p.evaluate(() =>
    document.querySelector('[data-shoot="search-result"][aria-selected="true"]')?.getAttribute("data-result-index")
  );
  check("8c and it clamps at the top rather than wrapping to the worst result", clamped === "0", String(clamped));
  await shot("08-keyboard");

  await p.keyboard.press("Enter");
  await settle(600);
  check("8d Enter takes the cursor's result", await p.evaluate(() => !!document.querySelector('[data-selected="true"]')));
}

// ── 9. NO RESULTS SAYS HOW THE QUERY WAS READ ──────────────────────────
{
  await p.keyboard.press("Escape");
  await settle();
  await search("Qqzzxyw-Vbbnmk_Plkjhg");
  const empty = await p.locator('[data-shoot="search-empty"]').innerText();
  check("9 an absent query shows the empty state", empty.length > 0);
  check(
    "9b and prints how the query was normalised, so the separator law is visible",
    /qqzzxyw vbbnmk plkjhg/.test(empty),
    empty.replace(/\s+/g, " ").slice(0, 110)
  );
  check("9c and states what Level 1 does not do", /does not understand/i.test(empty));
  // A LITERAL ESCAPE SEQUENCE IN RENDERED TEXT IS A TYPO THE TYPE CHECKER
  // CANNOT SEE. `\u201c` inside a JSX text node is six characters, not a
  // quotation mark, and it shipped once — so the panel's whole rendered text
  // is checked for the shape rather than the one place it happened.
  const panelText = await p
    .locator('[data-shoot="graph-search"]')
    .locator("xpath=ancestor::div[1]")
    .innerText();
  check(
    "9d no unrendered escape sequence is showing anywhere in the search panel",
    !/\\u[0-9a-fA-F]{4}/.test(panelText),
    (panelText.match(/\\u[0-9a-fA-F]{4}/g) ?? []).join(" ")
  );
  measured.empty = empty.replace(/\s+/g, " ");
  await shot("09-no-results");
}

// ── 10. SEARCH NEVER WRITES ────────────────────────────────────────────
{
  const before = requests.length;
  await search("");
  for (const q of ["notification", "risk", "offline", "capacity", "SOF"]) await search(q);
  const during = requests.slice(before);
  const writes = during.filter((r) => r.method !== "GET" && r.method !== "HEAD");
  const dataCalls = during.filter((r) => /\/api\//.test(r.url));
  check("10 no write request leaves the browser while searching", writes.length === 0, `${writes.length} writes`);
  check(
    "10b and no API call at all — search is entirely local, no round trip per keystroke",
    dataCalls.length === 0,
    `${dataCalls.length} api calls across 5 queries`
  );
  measured.requestsWhileSearching = { total: during.length, writes: writes.length, api: dataCalls.length };
}

check("errors: the page raised none", errs.length === 0, errs.slice(0, 2).join(" | "));

writeFileSync(`${out}/measured.json`, JSON.stringify(measured, null, 2));
console.log(`\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} FAILURE${failures === 1 ? "" : "S"}`}. Shots in ${out}\n`);
await b.close();
process.exit(failures === 0 ? 0 : 1);
