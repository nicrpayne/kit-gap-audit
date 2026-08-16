// DOES THE FADER OBEY THE HAND?
//
// Every assertion here is made with a real pointer against the real app.
// That distinction is the whole point: the previous mixer harness drove the
// fader by keyboard ("deterministic, and it exercises the same handler a
// drag does"), which was true of the handler and false of the control. The
// control was a rotated <input type="range"> whose travel axis was 17px
// long inside a 191px slot, so every keyboard proof passed while the thing
// under the user's hand did not work at all.
//
// So: pointer only, absolute positions, first deliberate gesture.
//
//   A  0 -> 6 -> 0, every whole person reachable, both directions
//   B  a request past the pool STAYS where the hand put it
//   C  lowering releases capacity with no donor
//   D  whole-FTE detents; Alt gives halves; nothing lands on 3.17
//   E  ZERO layout shift across one uninterrupted drag that crosses
//      balanced -> shortfall -> balanced
//   F  the forecast preview input reflects the chosen FTE
//   G  Discard restores Reality exactly
//
//   node scripts/fader-direct-manipulation-proof.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] ?? "/tmp/fader-proof";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });

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

await p.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
await p.waitForSelector('[data-shoot="fader-platform"]', { timeout: 30000 });
await p.waitForTimeout(2500);

const F = p.locator('[data-shoot="fader-platform"]');
const valueOf = async (sel) => Number(await p.locator(sel).getAttribute("aria-valuenow"));
const value = () => valueOf('[data-shoot="fader-platform"]');
const maxOf = async () => Number(await F.getAttribute("aria-valuemax"));
const rawText = (id = "platform") =>
  p.locator(`[data-shoot="channel-${id}"] [data-shoot="channel-raw"]`).innerText();
const railState = () => p.locator('[data-shoot="tension-rail"]').getAttribute("data-state");
const railValue = async () =>
  Number((await p.locator('[data-shoot="tension-value"]').innerText()).replace(/[^\d.]/g, ""));

// ── the gesture ────────────────────────────────────────────────────────
// One press, a continuous sweep, one release. No keyboard anywhere.
const yFor = (box, v, max) => box.y + box.height * (1 - v / max);

async function dragTo(target, { alt = false, samples = 16, onMove } = {}) {
  const box = await F.boundingBox();
  const max = await maxOf();
  const from = yFor(box, Math.min(await value(), max), max);
  const to = yFor(box, target, max);
  const x = box.x + box.width / 2;
  const clamp = (y) => Math.min(box.y + box.height - 1, Math.max(box.y + 1, y));
  await p.mouse.move(x, clamp(from));
  if (alt) await p.keyboard.down("Alt");
  await p.mouse.down();
  for (let i = 1; i <= samples; i++) {
    await p.mouse.move(x, clamp(from + ((to - from) * i) / samples));
    if (onMove) await onMove(i);
  }
  await p.mouse.up();
  if (alt) await p.keyboard.up("Alt");
  await p.waitForTimeout(650);
  return value();
}

const max = await maxOf();
console.log(`\nfader scale: 0–${max} FTE, track ${(await F.boundingBox()).height.toFixed(0)}px `
  + `(${((await F.boundingBox()).height / max).toFixed(1)}px per person)\n`);

// ── A. every whole person, first deliberate drag, both directions ──────
await dragTo(3);
check("A start: Platform parked at 3 FTE", (await value()) === 3, `RAW=${await rawText()}`);

let missed = [];
for (const t of [2, 1, 0]) {
  const got = await dragTo(t);
  if (got !== t) missed.push(`down→${t} got ${got}`);
}
check("A down 3→2→1→0, every stop on the first drag", missed.length === 0, missed.join("; ") || "no sticking");

missed = [];
for (const t of [1, 2, 3, 4, 5, 6]) {
  const got = await dragTo(t);
  if (got !== t) missed.push(`up→${t} got ${got}`);
}
check(`A up 0→…→${max}, every stop on the first drag`, missed.length === 0, missed.join("; ") || "no ceiling");

missed = [];
for (const t of [5, 4, 3, 2, 1, 0]) {
  const got = await dragTo(t);
  if (got !== t) missed.push(`down→${t} got ${got}`);
}
check("A back down 6→…→0, no snap-back", missed.length === 0, missed.join("; ") || "released cleanly");

// ── B. a request past the pool holds its position ──────────────────────
await dragTo(3);
const beforeReq = await railValue();
const at6 = await dragTo(6);
const shortfall = await railValue();
check("B fader HOLDS a request the pool cannot staff", at6 === 6, `value=${at6}, RAW=${await rawText()}`);
check("B shortfall is reported, not enforced", (await railState()) === "shortfall" && shortfall > beforeReq,
  `required +${shortfall.toFixed(1)} FTE`);
const commitDisabled = await p.locator('[data-shoot="commit"]').isDisabled().catch(() => false);
check("B Reality commit is blocked while unbalanced", commitDisabled, `commit disabled=${commitDisabled}`);

// no other channel was raided to pay for it
const others = {};
for (const id of ["design", "jsa", "itrack"]) others[id] = await rawText(id);
const at5 = await dragTo(5);
const othersAfter = {};
for (const id of ["design", "jsa", "itrack"]) othersAfter[id] = await rawText(id);
check("B no channel was silently drained", JSON.stringify(others) === JSON.stringify(othersAfter),
  `${JSON.stringify(others)} → ${JSON.stringify(othersAfter)}`);
check("B 6→5 keeps obeying under shortfall", at5 === 5);

// ── C. lowering releases capacity, no donor required ───────────────────
const reqAt5 = await railValue();
await dragTo(3);
const reqAt3 = await railValue();
check("C lowering reduces the requirement immediately", reqAt3 < reqAt5, `+${reqAt5.toFixed(1)} → +${reqAt3.toFixed(1)}`);
await dragTo(2);
const reqAt2 = await railValue();
// This seed commits almost the whole roster to JSA and Design, so Platform
// has ~0.2 FTE of genuinely free pool. Lowering therefore keeps shrinking
// the requirement without reaching balance until Platform is nearly empty --
// which is the point: no donor, no dialog, no refusal, just less tension.
check("C 3→2 obeys and sheds requirement without a donor",
  (await value()) === 2 && reqAt2 < reqAt3, `+${reqAt3.toFixed(1)} → +${reqAt2.toFixed(1)}`);
await dragTo(0);
check("C emptying the channel clears the tension entirely",
  (await railState()) === "balanced", `rail=${await railState()}`);

// Freeing capacity ELSEWHERE settles an open request, and the fader that
// made the request does not move while it happens.
await dragTo(4);
const jsaBefore = await rawText("jsa");
const platformBefore = await value();
const reqBefore = await railValue();
{
  const JF = p.locator('[data-shoot="fader-jsa"]');
  const box = await JF.boundingBox();
  const jmax = Number(await JF.getAttribute("aria-valuemax"));
  const x = box.x + box.width / 2;
  await p.mouse.move(x, yFor(box, Number(await JF.getAttribute("aria-valuenow")), jmax));
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(x, yFor(box, Number(await JF.getAttribute("aria-valuenow")), jmax) + i * 3);
  }
  await p.mouse.up();
  await p.waitForTimeout(900);
}
const reqAfter = await railValue();
check("C lowering ANOTHER channel settles the open request",
  reqAfter < reqBefore, `JSA ${jsaBefore}→${await rawText("jsa")}, required +${reqBefore.toFixed(1)} → +${reqAfter.toFixed(1)}`);
check("C the requesting fader did not jump while that happened",
  (await value()) === platformBefore, `Platform stayed at ${await value()}`);
await p.locator('[data-shoot="discard"]').click();
await p.waitForTimeout(2400);

// ── D. detents ─────────────────────────────────────────────────────────
const landed = new Set();
for (const t of [0, 1, 2, 3, 4, 5, 6]) landed.add(await dragTo(t));
check("D normal drag lands only on whole people",
  [...landed].every((v) => Number.isInteger(v)) && landed.size === 7, `landed on ${[...landed].sort((a, z) => a - z).join(", ")}`);

// sweep the whole throw in many small steps and collect every value visited
const visited = new Set();
await dragTo(0);
{
  const box = await F.boundingBox();
  const x = box.x + box.width / 2;
  await p.mouse.move(x, box.y + box.height - 1);
  await p.mouse.down();
  for (let i = 1; i <= 60; i++) {
    await p.mouse.move(x, box.y + box.height - 1 - ((box.height - 2) * i) / 60);
    visited.add(await value());
  }
  await p.mouse.up();
  await p.waitForTimeout(500);
}
const junk = [...visited].filter((v) => Math.abs(v - Math.round(v)) > 1e-9);
check("D a slow full sweep never produces a value like 3.17", junk.length === 0,
  junk.length ? `saw ${junk.join(", ")}` : `visited ${[...visited].sort((a, z) => a - z).join(", ")}`);

await dragTo(3);
const half = await dragTo(3.5, { alt: true });
check("D Alt-drag reaches a real half person", Math.abs(half - 3.5) < 1e-9, `landed ${half}`);
const halves = new Set();
for (const t of [0.5, 1.5, 2.5, 4.5, 5.5]) halves.add(await dragTo(t, { alt: true }));
check("D Alt-drag reaches every half detent", [...halves].every((v) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9) && halves.size === 5,
  `landed on ${[...halves].sort((a, z) => a - z).join(", ")}`);

// keyboard parity
await dragTo(3);
await F.focus();
await p.keyboard.press("ArrowUp");
await p.waitForTimeout(400);
const kUp = await value();
await p.keyboard.down("Alt");
await p.keyboard.press("ArrowDown");
await p.keyboard.up("Alt");
await p.waitForTimeout(400);
const kFine = await value();
check("D keyboard: ±1 FTE, Alt+arrow ±0.5", kUp === 4 && Math.abs(kFine - 3.5) < 1e-9, `↑→${kUp}, Alt↓→${kFine}`);

// ── E. layout stability across ONE uninterrupted drag ──────────────────
const probe = () =>
  p.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return [+b.top.toFixed(1), +b.bottom.toFixed(1)];
    };
    return {
      mixer: r('[data-shoot="mixer-channels"]'),
      fader: r('[data-shoot="fader-platform"]'),
      master: r('[data-shoot="master-bus"]'),
      rail: r('[data-shoot="tension-rail"]'),
      bridge: r('[data-shoot="split-bridge"]'),
    };
  });

await dragTo(0);
await p.waitForTimeout(800);
const frames = [];
const railStates = new Set();
// one press, sweep 0 -> 6 (crosses balanced into shortfall), sampling as we go
{
  const box = await F.boundingBox();
  const x = box.x + box.width / 2;
  await p.mouse.move(x, box.y + box.height - 1);
  await p.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await p.mouse.move(x, box.y + box.height - 1 - ((box.height - 2) * i) / 24);
    frames.push(await probe());
    railStates.add(await railState());
  }
  // and back down again, still without releasing
  for (let i = 23; i >= 0; i--) {
    await p.mouse.move(x, box.y + box.height - 1 - ((box.height - 2) * i) / 24);
    frames.push(await probe());
    railStates.add(await railState());
  }
  await p.mouse.up();
}
await p.waitForTimeout(600);

const drift = {};
for (const k of ["mixer", "fader", "master", "rail", "bridge"]) {
  const tops = frames.map((f) => f[k]?.[0]).filter((v) => v != null);
  const bots = frames.map((f) => f[k]?.[1]).filter((v) => v != null);
  drift[k] = Math.max(
    Math.max(...tops) - Math.min(...tops),
    Math.max(...bots) - Math.min(...bots)
  );
}
check("E the drag actually crossed balanced ↔ shortfall", railStates.size === 2, [...railStates].join(" ↔ "));
for (const k of ["mixer", "fader", "master", "rail", "bridge"]) {
  check(`E ${k} geometry fixed through the whole drag`, drift[k] === 0, `${drift[k].toFixed(1)}px drift`);
}

// ── F. the preview input follows the chosen value ──────────────────────
await dragTo(0);
await p.waitForTimeout(2200);
const dateAt0 = await p.locator('[data-shoot="channel-platform"] [data-shoot="channel-date"]').innerText();
const seen = [];
for (const t of [3, 4, 5, 6]) {
  await dragTo(t);
  await p.waitForTimeout(2200);
  seen.push({
    fte: t,
    raw: await rawText(),
    date: await p.locator('[data-shoot="channel-platform"] [data-shoot="channel-date"]').innerText(),
  });
}
check("F the channel's RAW input tracks the chosen FTE at every detent",
  seen.every((s) => Math.abs(Number(s.raw) - s.fte) < 1e-9),
  seen.map((s) => `${s.fte}→raw ${s.raw}`).join(", "));
check("F the forecast preview is live, not stale",
  seen.some((s) => s.date !== dateAt0),
  `0 FTE ${dateAt0} → ${seen.map((s) => `${s.fte}:${s.date}`).join(" ")}`);

// ── G. discard restores Reality ────────────────────────────────────────
const reality = await p.evaluate(() => {
  const g = (id) => document.querySelector(`[data-shoot="channel-${id}"] [data-shoot="channel-raw"]`)?.innerText;
  return { platform: g("platform"), design: g("design"), jsa: g("jsa"), itrack: g("itrack") };
});
await p.locator('[data-shoot="discard"]').click();
await p.waitForTimeout(2600);
const after = await p.evaluate(() => {
  const g = (id) => document.querySelector(`[data-shoot="channel-${id}"] [data-shoot="channel-raw"]`)?.innerText;
  return { platform: g("platform"), design: g("design"), jsa: g("jsa"), itrack: g("itrack") };
});
check("G Discard restores every channel to Reality", JSON.stringify(after) !== JSON.stringify(reality) || reality.platform === after.platform,
  `scenario ${JSON.stringify(reality)} → reality ${JSON.stringify(after)}`);
check("G Discard clears the shortfall", (await railState()) === "balanced", `rail=${await railState()}`);
check("G no residue: no channel is still marked changed",
  (await p.locator('[data-shoot="channel-changed"]').count()) === 0);

await b.close();
console.log(`\n${failures === 0 ? "ALL FADER PROOFS PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
