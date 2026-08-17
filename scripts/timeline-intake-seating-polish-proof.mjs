// POSSIBILITY → REALITY, MADE UNMISTAKABLE.
//
// Event Intake already worked. This proof is about the seam between the two
// kinds of thing it deals in, and about not letting the interface blur it:
//
//   a pending candidate does not sit on the score;
//   asking where it would go is a thing you do, and it stops when you stop;
//   the instant it is placed it is ordinary Reality, in the same material as
//   a landmark someone typed — the difference lives in provenance, not paint;
//   provenance is told once, in one place, and reads like language;
//   and supplying a missing date answers WHEN without also answering WHICH
//   PROJECT, because those are two decisions and only one was made.
//
//   node scripts/timeline-intake-seating-polish-proof.mjs
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DAY = 86400000;
const db = new PrismaClient();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();
p.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); failures++; });

let writes = [];
await p.route("**/*", (r) => {
  // Body included: "one write" is only half the claim — WHAT was written is
  // the other half, and a placement that silently degrades to the source's
  // own suggestion would otherwise still count as one write.
  if (r.request().method() !== "GET") {
    writes.push(`${r.request().method()} ${r.request().url().replace(BASE, "")} ${r.request().postData() ?? ""}`.trim());
  }
  r.continue();
});

const proj = async () => (await fetch(`${BASE}/api/timeline`)).json();
const box = (sel) => p.locator(sel).boundingBox();
const settle = (ms = 800) => p.waitForTimeout(ms);
const park = async () => { await p.mouse.move(1674, 1044); await settle(320); };
const open = async () => {
  await p.goto(`${BASE}/timeline`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-shoot="time-field"]', { timeout: 30000 });
  await settle(2600);
  await park();
};
const openTray = async () => {
  if ((await p.locator('[data-shoot="event-intake"]').count()) === 0) {
    await p.locator('[data-shoot="event-intake-toggle"]').click();
    await settle(700);
  }
};
const laneMid = async (scopeId) => {
  const l = await box(`[data-shoot="lane-header-${scopeId}"]`);
  return l.y + l.height / 2;
};
/** Everything that decides how a plan object is PAINTED. Two objects with
    the same answer here are the same material. */
const material = (shoot) =>
  p.evaluate((sel) => {
    const g = document.querySelector(`[data-shoot="${sel}"]`);
    if (!g) return null;
    const rects = g.querySelectorAll("rect");
    const body = rects[1];
    const cs = getComputedStyle(body);
    return {
      role: g.getAttribute("data-plan-role"),
      fill: body.getAttribute("fill"),
      strokeDash: body.getAttribute("stroke-dasharray") ?? cs.strokeDasharray ?? "none",
      strokeWidth: body.getAttribute("stroke-width"),
      opacity: cs.opacity,
      // The lifted shadow rect a seated object casts, and the caps that carry
      // its state. A candidate has neither.
      shadow: rects[0]?.getAttribute("fill") ?? null,
      caps: [...rects].filter((r) => r.getAttribute("rx") === "1.2").length,
      groupDash: g.getAttribute("stroke-dasharray") ?? "none",
    };
  }, shoot);

// ── restock: put back anything an earlier run placed ────────────────
{
  const cur = await proj();
  for (const e of cur.entries.filter((x) => x.family === "landmark" && x.detail.source === "candidate")) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
  for (const c of await db.timelineEventCandidate.findMany({ where: { status: "accepted" } })) {
    const live = c.acceptedEventId
      ? await db.timelineEvent.findUnique({ where: { id: c.acceptedEventId }, select: { id: true } })
      : null;
    if (!live) {
      await db.timelineEventCandidate.update({ where: { id: c.id }, data: { status: "pending", acceptedEventId: null } });
    }
  }
}

await open();
const start = await proj();
const laneOf = (n) => start.lanes.find((l) => l.name === n) ?? start.lanes[0];
const jsa = laneOf("JSA");
const activity = start.candidates.find((c) => c.date && c.endDate);
const undated = start.candidates.find((c) => !c.date);

// ── A. A PENDING CANDIDATE DOES NOT SIT ON THE SCORE ───────────────
{
  const onScore = await p.locator('[data-shoot^="candidate-"]').count();
  check("A1. At rest, NO pending candidate occupies the score",
    onScore === 0, `${onScore} candidate mark(s) drawn`);
  check("A2. …yet they are all still in the projection",
    start.candidates.length >= 3, `${start.candidates.length} pending`);
  await openTray();
  const inRack = await p.locator('[data-shoot^="intake-"]').count();
  check("A3. …and all of them are on the rack",
    inRack === start.candidates.length, `${inRack} card(s)`);
  const rows = await db.timelineEventCandidate.count({ where: { status: "pending" } });
  check("A4. …and the stored rows are untouched by any of that",
    rows === start.candidates.length, `${rows} pending row(s)`);
}

// ── B. ASKING WHERE IT WOULD GO, AND ONLY WHILE ASKING ─────────────
{
  writes = [];
  await p.locator(`[data-shoot="intake-${activity.id}"]`).hover();
  await settle(600);
  const shown = await p.locator(`[data-shoot="candidate-${activity.id}"][data-suggested]`).count();
  check("B1. Pointing at a card reveals where the source suggests it goes",
    shown === 1);
  const named = await p.evaluate((id) =>
    (document.querySelector(`[data-shoot="candidate-${id}"]`)?.textContent ?? "").trim(), activity.id);
  check("B2. …and the ghost NAMES itself a suggestion, not a plan",
    /suggested/i.test(named), named);
  const atSuggested = await p.evaluate((id) => {
    const g = document.querySelector(`[data-shoot="candidate-${id}"]`);
    const lane = [...document.querySelectorAll("[data-shoot^='lane-header-']")]
      .find((l) => { const r = l.getBoundingClientRect(); const q = g.getBoundingClientRect();
        return q.top >= r.top && q.top <= r.bottom; });
    return lane?.getAttribute("data-shoot")?.replace("lane-header-", "") ?? null;
  }, activity.id);
  check("B3. …in the project the SOURCE proposed, not somewhere else",
    atSuggested === activity.scopeId, `${atSuggested}`);
  // ASKING AND DOING DESCRIBE ONE PLACE.
  //
  // The ghost is packed into the plan band by the same first-fit rule as a
  // real object, so it appears in the SEAT a release would give it — not up
  // on the story rail, a lane's height away from where the thing would
  // actually land. Proved against the drop itself rather than against a
  // neighbouring object, because a lane with nothing on it yet still has to
  // answer the question. The drag is then cancelled off the field, so this
  // stays a question and B5's "nothing was written by looking" still holds.
  const bodyMid = (sel) => p.evaluate((s) => {
    const r = document.querySelector(`${s} rect[stroke-dasharray]`)?.getBoundingClientRect();
    return r ? r.top + r.height / 2 : null;
  }, sel);
  const ghostY = await bodyMid(`[data-shoot="candidate-${activity.id}"]`);
  const ghostBox = await box(`[data-shoot="candidate-${activity.id}"]`);
  {
    const card = await box(`[data-shoot="intake-${activity.id}"]`);
    await p.mouse.move(card.x + 60, card.y + card.height / 2);
    await p.mouse.down();
    await p.mouse.move(card.x + 60, card.y - 30, { steps: 3 });
    await p.mouse.move(ghostBox.x + 6, ghostY, { steps: 8 });
    await settle(320);
    const previewY = await bodyMid('[data-shoot="intake-preview"]');
    check("B3b. …and in the SEAT it would take, not up on the story rail",
      ghostY !== null && previewY !== null && Math.abs(ghostY - previewY) < 1.5,
      `ghost ${ghostY?.toFixed(1)} vs drop preview ${previewY?.toFixed(1)}`);
    // off the field entirely, so the question goes unanswered
    await p.mouse.move(6, 6, { steps: 6 });
    await settle(220);
    await p.mouse.up();
    await settle(900);
  }
  await p.locator(`[data-shoot="intake-${activity.id}"]`).hover();
  await settle(600);

  await park();
  await settle(500);
  check("B4. It leaves again with your attention",
    (await p.locator('[data-shoot^="candidate-"]').count()) === 0);
  check("B5. Nothing was written by looking", writes.length === 0, writes.join(", ") || "none");

  // Selection is the SECOND way of asking, and it is the durable one: the
  // pointer walks away and the suggestion is still there, because holding
  // the piece is a state, not a gesture. Park first — otherwise this only
  // re-measures the hover from B1 and proves nothing new.
  await p.locator(`[data-shoot="intake-${activity.id}"]`).click();
  await park();
  await settle(900);
  check("B6. Selecting it holds the suggestion visible with the pointer away",
    (await p.locator(`[data-shoot="candidate-${activity.id}"]`).count()) === 1);
  await p.keyboard.press("Escape");
  await settle(700);
  check("B7. …and deselecting puts it away again",
    (await p.locator('[data-shoot^="candidate-"]').count()) === 0);
}

// ── C. SEATED IS SEATED: THE SAME MATERIAL AS ANY OTHER ────────────
let placedId = null;
{
  await openTray();
  const native = start.entries.find((e) => e.family === "landmark" && e.endDate && e.detail.source !== "candidate");
  const before = await material(`plan-${native.id}`);

  const field = await box('[data-shoot="time-field"]');
  const card = await box(`[data-shoot="intake-${activity.id}"]`);
  writes = [];
  await p.mouse.move(card.x + 60, card.y + card.height / 2);
  await p.mouse.down();
  await p.mouse.move(card.x + 60, card.y - 30, { steps: 3 });
  const ty = await laneMid(jsa.scopeId);
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(card.x + 60 + (field.x + field.width * 0.64 - card.x - 60) * (i / 10), card.y - 30 + (ty - card.y + 30) * (i / 10));
  }
  await settle(300);
  check("C0. The preview is candidate material while it is still a preview",
    (await p.locator('[data-shoot="intake-preview"]').count()) === 1);
  await p.mouse.up();
  await settle(2300);

  const after = await proj();
  const placed = after.entries.find((e) => e.title === activity.title && e.family === "landmark");
  placedId = placed?.id ?? null;
  check("C1. It became a Timeline-owned plan object", !!placedId,
    placed ? `${placed.scopeId} @ ${placed.date.slice(0, 10)}` : "nothing placed");
  // It landed where the POINTER said, not where the SOURCE said. The two
  // differ by construction here — the drop is on JSA, the suggestion is
  // iTrack — so a placement that silently fell back to the suggestion is
  // caught rather than counted as a success.
  check("C1b. …at the placement the drop stated, not the source's suggestion",
    !!placed && placed.scopeId === jsa.scopeId && placed.date !== activity.date,
    `${placed?.scopeId} vs suggested ${activity.scopeId}`);

  // COMPARE LIKE WITH LIKE. What you just placed is in your hand — placing
  // selects it — and a selected plan object is lit, by the same rule that
  // lights a native one. So the material comparison is made twice, in both
  // states: at rest against a native at rest, and lit against a native lit.
  // Measuring the fresh object's HELD state against a native's RESTING state
  // would only rediscover that selection changes paint.
  const seatedLit = placedId ? await material(`plan-${placedId}`) : null;
  await p.keyboard.press("Escape");
  await park();
  await settle(600);
  const seated = placedId ? await material(`plan-${placedId}`) : null;
  if (!seated || !seatedLit) {
    check("C2–C8. (skipped: nothing was seated to measure)", false);
    throw new Error("C could not measure a seated object — see C1 above");
  }
  await p.locator(`[data-shoot="plan-${native.id}"]`).dispatchEvent("click");
  await settle(700);
  const nativeLit = await material(`plan-${native.id}`);
  await p.keyboard.press("Escape");
  await park();
  await settle(600);

  check("C2. It is drawn by the SAME component as a native plan object",
    seated.role === before.role, `${seated.role} vs ${before.role}`);
  check("C3. …in the same body material, at rest and in the hand",
    seated.fill === before.fill && seatedLit.fill === nativeLit.fill,
    `rest ${seated.fill} vs ${before.fill} · held ${seatedLit.fill} vs ${nativeLit.fill}`);
  check("C4. …with the same edge — nothing dashed, nothing provisional",
    (seated.strokeDash === "none" || seated.strokeDash === before.strokeDash) &&
      seated.groupDash === "none" && seated.strokeWidth === before.strokeWidth,
    `dash=${seated.strokeDash}, width=${seated.strokeWidth} vs ${before.strokeWidth}`);
  check("C5. …the same seated depth and the same end caps",
    seated.shadow === before.shadow && seated.caps === before.caps,
    `shadow=${seated.shadow}, caps=${seated.caps}`);
  check("C6. …and at full presence, with no candidate tint left on it",
    Number(seated.opacity) === 1 && Number(before.opacity) === 1, `${seated.opacity}`);
  check("C7. No candidate presentation survives acceptance anywhere on the score",
    (await p.locator('[data-shoot^="candidate-"]').count()) === 0 &&
      (await p.locator('[data-shoot="intake-preview"]').count()) === 0);
  check("C8. Exactly one write for the whole placement",
    writes.length === 1 && /accept/.test(writes[0]), writes.join(", "));
}

// ── D. PROVENANCE: TOLD ONCE, IN HUMAN WORDS, STORED VERBATIM ──────
{
  await p.locator(`[data-shoot="plan-${placedId}"]`).dispatchEvent("click");
  await settle(1100);
  const panel = await p.evaluate(() => {
    const d = document.querySelector('[data-shoot="inspector-dock"]');
    const heads = [...d.querySelectorAll(".i-label")].map((e) => (e.textContent ?? "").trim());
    return { heads, text: (d.textContent ?? "").replace(/\s+/g, " ") };
  });
  check("D1. Provenance has ONE home, and it is not the WHEN group",
    panel.heads.includes("Origin") && !/WHEN[\s\S]*?Source/i.test(panel.text),
    panel.heads.join(" / "));
  const stored = await db.timelineEvent.findUnique({ where: { id: placedId } });
  const occurrences = panel.text.split(stored.sourceLabel.split(" · ")[1]).length - 1;
  check("D2. …and the source is printed exactly once",
    occurrences === 1, `${occurrences} occurrence(s) of the source reference`);
  check("D3. How it entered the Timeline is stated SEPARATELY from where it came from",
    panel.heads.includes("Placement") && /from Event Intake/.test(panel.text));
  check("D4. The producer reads as language",
    /Hermes/.test(panel.text) && !/hermes\b/.test(panel.text.replace(/Hermes/g, "")),
    panel.text.match(/Hermes[^·]*·[^,]{0,30}/)?.[0] ?? "");
  check("D5. …while the STORED value is untouched",
    stored.sourceLabel.startsWith("hermes · "), stored.sourceLabel);
  check("D6. Evidence is preserved and countable",
    stored.evidenceRefs.length === activity.evidenceRefs.length && /cited/.test(panel.text),
    `${stored.evidenceRefs.length} ref(s)`);
  await p.keyboard.press("Escape");
  await settle(500);
}

// ── I. THE SOURCE KEEPS ITS SUGGESTION ─────────────────────────────
{
  const row = await db.timelineEventCandidate.findUnique({ where: { id: activity.id } });
  const placed = (await proj()).entries.find((e) => e.id === placedId);
  check("I1. Timeline's placement may differ from the suggestion",
    placed.scopeId !== row.scopeId, `suggested ${row.scopeId}, placed ${placed.scopeId}`);
  check("I2. …and the suggestion is exactly what it always was",
    row.scopeId === activity.scopeId &&
      row.date.toISOString() === activity.date &&
      row.endDate.toISOString() === activity.endDate,
    `${row.scopeId} · ${row.date.toISOString().slice(0, 10)}`);
}

// ── F. UNDO / REDO ─────────────────────────────────────────────────
{
  await p.keyboard.press("Control+z");
  await settle(2400);
  const undone = await proj();
  const back = undone.candidates.find((c) => c.id === activity.id);
  check("F1. Undo removes the object and returns the candidate",
    !undone.entries.some((e) => e.id === placedId) && !!back);
  check("F2. …with the SOURCE's suggestion, not the placement",
    back.scopeId === activity.scopeId && back.date === activity.date && back.endDate === activity.endDate,
    `${back.scopeId} · ${back.date.slice(0, 10)}`);
  await openTray();
  check("F3. …and it is back on the rack, off the score",
    (await p.locator(`[data-shoot="intake-${activity.id}"]`).count()) === 1 &&
      (await p.locator('[data-shoot^="candidate-"]').count()) === 0);

  await p.keyboard.press("Control+Shift+z");
  await settle(2400);
  const redone = await proj();
  const again = redone.entries.filter((e) => e.title === activity.title && e.family === "landmark");
  check("F4. Redo seats exactly one object again",
    again.length === 1, `${again.length}`);
  check("F5. …still carrying its provenance",
    again[0].detail.source === "candidate" && again[0].detail.sourceLabel === activity.sourceLabel);
  placedId = again[0].id;
}

// ── E. A SUPPLIED DATE IS NOT A SUPPLIED PROJECT ───────────────────
{
  await open();
  await openTray();
  const beforeRows = await db.timelineEvent.count();
  check("E1. The dateless candidate is not draggable while it has no timing",
    (await p.locator(`[data-shoot="intake-${undated.id}"][data-placeable]`).count()) === 0);

  await p.locator(`[data-shoot="intake-${undated.id}"]`).click();
  await settle(900);
  const says = await p.evaluate(() =>
    (document.querySelector('[data-shoot="inspector-dock"]')?.textContent ?? "").replace(/\s+/g, " "));
  check("E2. …and says so in plain words, without inventing a date",
    /will not infer a date/i.test(says) && /needs timing/i.test(says));

  writes = [];
  const when = new Date(Date.now() + 24 * DAY);
  when.setUTCHours(0, 0, 0, 0);
  await p.locator('[data-shoot="candidate-date"]').fill(when.toISOString().slice(0, 10));
  await settle(400);
  await p.locator('[data-shoot="accept-candidate"]').click();
  await settle(1600);

  check("E3. Supplying the date writes NOTHING", writes.length === 0, writes.join(", ") || "none");
  check("E4. …creates no Timeline object",
    (await db.timelineEvent.count()) === beforeRows, `${beforeRows} before, ${await db.timelineEvent.count()} after`);
  check("E5. …and does NOT accept the source's suggested project",
    (await db.timelineEventCandidate.findUnique({ where: { id: undated.id } })).status === "pending");
  const row = await db.timelineEventCandidate.findUnique({ where: { id: undated.id } });
  check("E6. …nor does it write the date onto the candidate — the evidence still does not say",
    row.date === null, `${row.date}`);
  const panel = await p.evaluate(() =>
    (document.querySelector('[data-shoot="inspector-dock"]')?.textContent ?? "").replace(/\s+/g, " "));
  check("E7. …it says the timing is set and the project is still yours to choose",
    /not on the timeline yet/i.test(panel) && /drag it/i.test(panel));

  await p.keyboard.press("Escape");
  await settle(600);
  await openTray();
  check("E8. NOW it is draggable — one more human act away from Reality",
    (await p.locator(`[data-shoot="intake-${undated.id}"][data-placeable]`).count()) === 1);
  const label = await p.evaluate((id) =>
    (document.querySelector(`[data-shoot="intake-${id}"]`)?.textContent ?? "").replace(/\s+/g, " "), undated.id);
  check("E9. …and the card does not name a project it has not been given",
    /drag to a project/i.test(label) &&
      !new RegExp(start.lanes.find((l) => l.scopeId === undated.scopeId)?.name ?? " ").test(label),
    label.slice(0, 70));

  // And placing it explicitly still works, onto a project of the human's choosing.
  const field = await box('[data-shoot="time-field"]');
  const card = await box(`[data-shoot="intake-${undated.id}"]`);
  const target = start.lanes.find((l) => l.scopeId !== undated.scopeId);
  writes = [];
  await p.mouse.move(card.x + 60, card.y + card.height / 2);
  await p.mouse.down();
  await p.mouse.move(card.x + 60, card.y - 30, { steps: 3 });
  const ty = await laneMid(target.scopeId);
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(card.x + 60 + (field.x + field.width * 0.6 - card.x - 60) * (i / 10), card.y - 30 + (ty - card.y + 30) * (i / 10));
  }
  await settle(300);
  // WHAT YOU SEE IS WHERE IT LANDS. The typed date answered "does anything
  // say when?" — the refusal that gate exists for — and it is what makes the
  // piece liftable at all. The DROP is what states the placement, in both
  // axes, exactly as it does for a candidate the source dated: Timeline owns
  // Timeline timing. So the assertion is against the date the preview was
  // showing at the instant of release, not against the typed date, which the
  // pointer is free to have moved away from in plain sight.
  const shown = await p.locator('[data-shoot="intake-preview"]').getAttribute("data-date");
  await p.mouse.up();
  await settle(2300);
  const made = (await proj()).entries.find((e) => e.title === undated.title && e.family === "landmark");
  check("E10. Dragging it places it — on the human's project, never the suggested one",
    !!made && made.scopeId === target.scopeId && made.scopeId !== undated.scopeId,
    made ? `${made.scopeId} · suggested ${undated.scopeId}` : "not placed");
  check("E10b. …at exactly the date the preview was showing when it was released",
    !!made && !!shown && new Date(made.date).toISOString() === new Date(shown).toISOString(),
    `${made?.date} vs previewed ${shown}`);
  if (made) await fetch(`${BASE}/api/timeline-events/${made.id}`, { method: "DELETE" });
}

// ── G. DORMANT LANE STILL WAKES ────────────────────────────────────
{
  const extra = [];
  try {
    const name = "Seating target";
    const ex = await db.scope.findFirst({ where: { name } });
    const row = ex ?? (await db.scope.create({ data: { name, teamKey: "SEAT" } }));
    if (!ex) extra.push(row.id);
    await open();
    await openTray();
    const rail = `[data-shoot="lane-header-${row.id}"]`;
    check("G1. It starts as a rail", (await p.locator(`${rail}[data-dormant]`).count()) === 1);
    const cur = await proj();
    const piece = cur.candidates.find((c) => c.date);
    const railBox = await box(rail);
    const field = await box('[data-shoot="time-field"]');
    const card = await box(`[data-shoot="intake-${piece.id}"]`);
    await p.mouse.move(card.x + 60, card.y + card.height / 2);
    await p.mouse.down();
    await p.mouse.move(card.x + 60, card.y - 30, { steps: 3 });
    for (let i = 1; i <= 10; i++) {
      await p.mouse.move(card.x + 60 + (field.x + field.width * 0.55 - card.x - 60) * (i / 10),
        card.y - 30 + (railBox.y + railBox.height / 2 - card.y + 30) * (i / 10));
    }
    await settle(300);
    await p.mouse.up();
    await settle(2400);
    check("G2. …accepts a placement and wakes, exactly as before",
      (await p.locator(`${rail}[data-dormant]`).count()) === 0 &&
        (await box(rail)).height > railBox.height * 2,
      `${Math.round(railBox.height)}px → ${Math.round((await box(rail)).height)}px`);
  } finally {
    for (const id of extra) {
      const cur = await proj().catch(() => null);
      for (const e of (cur?.entries ?? []).filter((x) => x.scopeId === id && x.family === "landmark")) {
        await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
      }
      await db.scope.delete({ where: { id } }).catch(() => {});
    }
  }
}

// ── H. THE POINTER LAW, UNCHANGED ──────────────────────────────────
{
  await open();
  await openTray();
  const cur = await proj();
  const piece = cur.candidates.find((c) => c.date);
  const field = await box('[data-shoot="time-field"]');
  const card = await box(`[data-shoot="intake-${piece.id}"]`);
  writes = [];
  await p.mouse.move(card.x + 60, card.y + card.height / 2);
  await p.mouse.down();
  const y = await laneMid(jsa.scopeId);
  for (let i = 0; i < 30; i++) await p.mouse.move(field.x + 140 + i * 20, y);
  await settle(250);
  check("H1. Thirty moves across the score, zero requests", writes.length === 0, `${writes.length}`);
  // Release on the chrome above the field: nowhere to land.
  await p.mouse.move(field.x + field.width / 2, field.y - 46);
  await settle(250);
  await p.mouse.up();
  await settle(1400);
  check("H2. An invalid release writes nothing and returns the piece",
    writes.length === 0 && (await proj()).candidates.some((c) => c.id === piece.id),
    writes.join(", ") || "none");
}

// ── J. THE SUSPICIOUS MAPPING, EXPLAINED AND PROTECTED ─────────────
{
  // AUDIT RESULT: not a defect. A candidate's project comes STRUCTURALLY from
  // the ContextSnapshot it was harvested out of — a JSA weekly delivery sync
  // mentioned an iTrack milestone, so the claim is attributed to JSA, which
  // is whose context package carried it. Inferring the project from the words
  // in the title is precisely the fuzzy matching this system refuses to do.
  // The case is the reason cross-project drag exists: the source says where it
  // was heard, a human says where it belongs.
  const rows = await db.timelineEventCandidate.findMany({ where: { status: "pending" } });
  const snaps = new Map(
    (await db.contextSnapshot.findMany({ select: { id: true, scopeId: true } })).map((s) => [s.id, s.scopeId])
  );
  const structural = rows.every((r) => !r.contextSnapshotId || snaps.get(r.contextSnapshotId) === r.scopeId);
  check("J1. Every candidate's project is its SNAPSHOT's project — structural, never inferred",
    structural,
    rows.map((r) => `${r.title.slice(0, 18)}→${r.scopeId}`).join(", "));
  const crossed = rows.find((r) => /itrack/i.test(r.title) && r.scopeId !== "itrack");
  check("J2. …which is why a JSA transcript can carry an iTrack milestone",
    !!crossed, crossed ? `"${crossed.title}" suggested for ${crossed.scopeId}` : "no cross-project case in fixtures");
}

// ── K. PLAYBACK SEMANTICS, AUDITED NOT CHANGED ─────────────────────
{
  // The question: while the readout says AS REMEMBERED at a historical date,
  // can a plan object created today be read as having been known then?
  //
  // No, and the model is what prevents it rather than the styling. What
  // recedes during playback begins at NOW, not at the playhead — so the gap
  // between the playhead and NOW stays fully lit as un-played history, and
  // the plan is visibly on the far side of the NOW seam rather than adjacent
  // to the remembered date. And a planned entry is never in the crossed set,
  // so playback never wakes one as though the story had reached it.
  await open();
  await p.locator('[data-shoot="to-beginning"]').click();
  await settle(900);
  await p.locator('[data-shoot="play"]').click();
  await settle(1500);
  const during = await p.evaluate(() => {
    const scrim = document.querySelector('[data-shoot="future-recede"]');
    const seam = document.querySelector('[data-shoot="now-seam"] line');
    const head = document.querySelector('[data-shoot="playhead"]');
    return {
      receding: scrim.hasAttribute("data-receding"),
      scrimLeft: +scrim.getBoundingClientRect().left.toFixed(1),
      nowX: +seam.getBoundingClientRect().left.toFixed(1),
      headX: +head.getBoundingClientRect().left.toFixed(1),
      remembered: /as remembered/i.test(document.querySelector('[data-shoot="memory-banner"]')?.textContent ?? ""),
      litPlanned: [...document.querySelectorAll('[data-shoot^="plan-"][data-planned]')]
        .filter((e) => e.hasAttribute("data-crossed")).length,
    };
  });
  check("K1. Playback is showing a remembered date", during.remembered && during.receding);
  check("K2. What recedes begins at NOW, not at the playhead",
    Math.abs(during.scrimLeft - during.nowX) <= 2 && during.headX < during.nowX - 20,
    `scrim ${during.scrimLeft}, NOW ${during.nowX}, playhead ${during.headX}`);
  check("K3. …so today's plan is never lit as part of the remembered story",
    during.litPlanned === 0, `${during.litPlanned} planned object(s) crossed`);
  for (let i = 0; i < 240; i++) {
    await p.waitForTimeout(300);
    if ((await p.locator('[data-shoot="play"] rect').count()) === 0 && i > 6) break;
  }
  await settle(1400);
}

// ── restore ────────────────────────────────────────────────────────
{
  const cur = await proj();
  for (const e of cur.entries.filter((x) => x.family === "landmark" && x.detail.source === "candidate")) {
    await fetch(`${BASE}/api/timeline-events/${e.id}`, { method: "DELETE" }).catch(() => {});
  }
  const back = await proj();
  check("Z1. Every piece is back on the rack",
    back.candidates.length === start.candidates.length,
    `${start.candidates.length} → ${back.candidates.length}`);
}

await db.$disconnect();
await b.close();
console.log(`\n${failures === 0 ? "ALL INTAKE SEATING POLISH PROOFS PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
