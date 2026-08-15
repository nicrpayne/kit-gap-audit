// THE PORTFOLIO MIXER'S PHYSICS. Not part of the app build.
//
// One law, tested every way it can be broken: EVERY FTE IS CONSERVED. A
// project fader redistributes a finite pool of humans; only the Workforce
// control on the Master bus changes how many humans exist.
//
//   npx tsx scripts/mixer-model-proof.ts
import {
  readChannel,
  readMaster,
  setChannelRaw,
  transferBetweenChannels,
  setPersonSplit,
  splitPeople,
  suggestDonors,
  workforceFte,
  freeFte,
  hypotheticalHires,
  reductionRequirement,
  type WorkforceState,
} from "../lib/capacity/workforce";
import type { PersonLike, AllocationLike } from "../lib/capacity/resolve";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;
const f = (n: number) => n.toFixed(2);

const SCOPES = ["platform", "jsa", "itrack"];

// Ten whole humans. Platform 4, JSA 3, iTrack 2, one spare.
function tenPeople(): PersonLike[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `p${String(i + 1).padStart(2, "0")}`,
    name: `Person ${String(i + 1).padStart(2, "0")}`,
    fte: 1,
    active: true,
  }));
}
function baseState(): WorkforceState {
  const allocations: AllocationLike[] = [];
  const people = tenPeople();
  people.slice(0, 4).forEach((p) => allocations.push({ personId: p.id, scopeId: "platform", fraction: 1 }));
  people.slice(4, 7).forEach((p) => allocations.push({ personId: p.id, scopeId: "jsa", fraction: 1 }));
  people.slice(7, 9).forEach((p) => allocations.push({ personId: p.id, scopeId: "itrack", fraction: 1 }));
  return { people, allocations };
}
const raw = (s: WorkforceState, id: string, pct = 0) => readChannel(s, id, pct).raw;
const totalRaw = (s: WorkforceState, pct = 0) => SCOPES.reduce((t, id) => t + raw(s, id, pct), 0);

console.log("── A. FREE CAPACITY ──────────────────────────────────────────");
{
  const s = baseState();
  const m0 = readMaster(s, SCOPES, 0);
  check("Workforce is 10, allocated 9, free 1", near(m0.workforce, 10) && near(m0.allocated, 9) && near(m0.free, 1), `${f(m0.allocated)}/${f(m0.workforce)}, free ${f(m0.free)}`);

  const r = setChannelRaw(s, "platform", 5);
  const after: WorkforceState = { ...s, allocations: r.allocations };
  const m1 = readMaster(after, SCOPES, 0);
  check("Platform 4 -> 5 succeeds from free capacity", near(r.achievedRaw, 5) && near(r.required, 0), `${f(r.achievedRaw)} FTE`);
  check("Free falls 1 -> 0", near(m1.free, 0), `free ${f(m1.free)}`);
  check("The other channels did not move", near(raw(after, "jsa"), 3) && near(raw(after, "itrack"), 2), `JSA ${f(raw(after, "jsa"))}, iTrack ${f(raw(after, "itrack"))}`);
  check("Total is still 10", near(m1.workforce, 10) && near(m1.allocated, 10), `${f(m1.allocated)}/${f(m1.workforce)}`);
}

console.log("\n── B. DEFICIT ────────────────────────────────────────────────");
{
  const full = setChannelRaw(baseState(), "platform", 5);
  const s: WorkforceState = { ...baseState(), allocations: full.allocations };
  const r = setChannelRaw(s, "platform", 6);
  const after: WorkforceState = { ...s, allocations: r.allocations };
  check("With free at 0, Platform 5 -> 6 cannot be satisfied", near(r.required, 1), `required ${f(r.required)} FTE`);
  check("It did NOT silently take from another channel", near(raw(after, "jsa"), 3) && near(raw(after, "itrack"), 2), `JSA ${f(raw(after, "jsa"))}, iTrack ${f(raw(after, "itrack"))}`);
  check("It did NOT silently manufacture a human", near(workforceFte(after.people), 10), `workforce ${f(workforceFte(after.people))}`);

  const m = readMaster(after, SCOPES, 0, { platform: r.required });
  check("The Master reports +1.0 FTE REQUIRED", near(m.required, 1), `required ${f(m.required)}`);
  check("The scenario may still be auditioned at 6", near(readChannel(after, "platform", 0, r.required).raw, 6), `${f(readChannel(after, "platform", 0, r.required).raw)} FTE previewed`);

  const donors = suggestDonors(after, "platform", 1, SCOPES);
  check("Donors are real channels that actually hold capacity", donors.length === 2 && donors.every((d) => d.availableFte > 0), donors.map((d) => `${d.scopeId} ${f(d.availableFte)}`).join(", "));
  check("The smallest sufficient donor is offered first", donors[0].scopeId === "itrack", `${donors[0].scopeId} first`);
}

console.log("\n── C. DONOR TRANSFER ─────────────────────────────────────────");
{
  const full = setChannelRaw(baseState(), "platform", 5);
  const s: WorkforceState = { ...baseState(), allocations: full.allocations };
  const t = transferBetweenChannels(s, "jsa", "platform", 1);
  const after: WorkforceState = { ...s, allocations: t.allocations };
  check("Platform rises to 6", near(raw(after, "platform"), 6), `${f(raw(after, "platform"))} FTE`);
  check("JSA falls to 2, in the same action", near(raw(after, "jsa"), 2), `${f(raw(after, "jsa"))} FTE`);
  check("iTrack was untouched", near(raw(after, "itrack"), 2), `${f(raw(after, "itrack"))} FTE`);
  const m = readMaster(after, SCOPES, 0);
  check("Workforce is unchanged and the Master balances", near(m.workforce, 10) && near(m.allocated, 10) && near(m.overUnder, 0), `${f(m.allocated)}/${f(m.workforce)}`);
  check("Nothing is required any more", near(m.required, 0));
}

console.log("\n── D. HIRE ───────────────────────────────────────────────────");
{
  const full = setChannelRaw(baseState(), "platform", 5);
  const s: WorkforceState = { ...baseState(), allocations: full.allocations };
  const hired: WorkforceState = { people: [...s.people, ...hypotheticalHires(1, 11)], allocations: s.allocations };
  const r = setChannelRaw(hired, "platform", 6);
  const after: WorkforceState = { ...hired, allocations: r.allocations };
  check("Workforce 10 -> 11", near(workforceFte(after.people), 11), `${f(workforceFte(after.people))} FTE`);
  check("Platform reaches 6 with nothing required", near(r.achievedRaw, 6) && near(r.required, 0), `${f(r.achievedRaw)} FTE`);
  check("No donor project moved", near(raw(after, "jsa"), 3) && near(raw(after, "itrack"), 2), `JSA ${f(raw(after, "jsa"))}, iTrack ${f(raw(after, "itrack"))}`);
  check("The new hire is not split", splitPeople(after, 12).length === 0);
}

console.log("\n── E. RELEASE CAPACITY ───────────────────────────────────────");
{
  const s = baseState();
  const r = setChannelRaw(s, "jsa", 2);
  const after: WorkforceState = { ...s, allocations: r.allocations };
  const m = readMaster(after, SCOPES, 0);
  check("JSA 3 -> 2 releases a whole person", near(raw(after, "jsa"), 2), `${f(raw(after, "jsa"))} FTE`);
  check("Free rises 1 -> 2", near(m.free, 2), `free ${f(m.free)}`);
  check("Nobody was destroyed", near(m.workforce, 10), `workforce ${f(m.workforce)}`);
}

console.log("\n── F. SPLIT ──────────────────────────────────────────────────");
{
  const s = baseState();
  const { allocations, error } = setPersonSplit(s, "p10", [
    { scopeId: "platform", fraction: 0.5 },
    { scopeId: "jsa", fraction: 0.5 },
  ]);
  const after: WorkforceState = { ...s, allocations };
  check("A 50/50 split is accepted", error === null);
  const split = splitPeople(after, 12);
  check("The person is one human, used exactly once", split.length === 1 && near(split[0].rawFte, 1), `raw ${f(split[0].rawFte)} FTE`);
  check("…and delivers less than one FTE at 12% switch cost", split[0].effectiveFte < 1 && near(split[0].effectiveFte, 0.88), `effective ${split[0].effectiveFte.toFixed(3)} FTE`);
  check("Total physical allocation is still 10", near(totalRaw(after), 10), `${f(totalRaw(after))} FTE`);

  const over = setPersonSplit(s, "p10", [
    { scopeId: "platform", fraction: 0.8 },
    { scopeId: "jsa", fraction: 0.8 },
  ]);
  check("160% of one human is refused", over.error !== null, over.error ?? "");
}

console.log("\n── G. CONTEXT SWITCH MOVES EFFECTIVENESS, NOT PEOPLE ─────────");
{
  const s = baseState();
  const { allocations } = setPersonSplit(s, "p10", [
    { scopeId: "platform", fraction: 0.5 },
    { scopeId: "jsa", fraction: 0.5 },
  ]);
  const after: WorkforceState = { ...s, allocations };
  const at0 = readChannel(after, "platform", 0);
  const at12 = readChannel(after, "platform", 12);
  const at30 = readChannel(after, "platform", 30);
  check("Raw allocation is identical at 0%, 12% and 30%", near(at0.raw, at12.raw) && near(at12.raw, at30.raw), `${f(at0.raw)} FTE throughout`);
  check("Effective capacity falls as the knob rises", at0.effective > at12.effective && at12.effective > at30.effective, `${at0.effective.toFixed(3)} > ${at12.effective.toFixed(3)} > ${at30.effective.toFixed(3)}`);
  check("The channel reports how much of it is split", near(at12.splitRaw, 0.5) && at12.splitPeople === 1, `${f(at12.splitRaw)} FTE across ${at12.splitPeople} person`);
  const m0 = readMaster(after, SCOPES, 0);
  const m30 = readMaster(after, SCOPES, 30);
  check("The Master keeps every human while effectiveness drops", near(m0.workforce, m30.workforce) && near(m0.allocated, m30.allocated) && m30.effective < m0.effective, `${f(m0.effective)} -> ${f(m30.effective)} effective, ${f(m30.allocated)} allocated throughout`);
}

console.log("\n── H. NO SPLIT, NO PENALTY ───────────────────────────────────");
{
  const s = baseState(); // everybody dedicated to one channel
  check("Nobody is split", splitPeople(s, 12).length === 0);
  for (const pct of [0, 12, 50]) {
    const c = readChannel(s, "platform", pct);
    if (!near(c.effective, c.raw)) failures++;
  }
  const a = readChannel(s, "platform", 0);
  const b = readChannel(s, "platform", 50);
  check("Turning the knob changes no dedicated channel's capacity", near(a.effective, b.effective) && near(a.effective, a.raw), `${f(a.effective)} FTE at 0% and 50%`);
}

console.log("\n── I. A NAME IS A LABEL ──────────────────────────────────────");
{
  const s = baseState();
  const renamed: WorkforceState = {
    people: s.people.map((p) => (p.id === "p07" ? { ...p, name: "Alice" } : p)),
    allocations: s.allocations,
  };
  const before = SCOPES.map((id) => readChannel(s, id, 12));
  const after = SCOPES.map((id) => readChannel(renamed, id, 12));
  check(
    "Renaming Person 07 to Alice changes nothing numerically",
    before.every((c, i) => near(c.raw, after[i].raw) && near(c.effective, after[i].effective)),
    before.map((c, i) => `${c.scopeId} ${f(c.effective)}/${f(after[i].effective)}`).join(", ")
  );
}

console.log("\n── J. CONSERVATION ───────────────────────────────────────────");
{
  const s = baseState();
  // Hammer the faders and assert the pool never changes size.
  let state = s;
  const moves: [string, number][] = [["platform", 6], ["jsa", 1], ["itrack", 4], ["platform", 2], ["jsa", 5], ["itrack", 0]];
  let ok = true;
  for (const [scopeId, target] of moves) {
    const r = setChannelRaw(state, scopeId, target);
    state = { ...state, allocations: r.allocations };
    const m = readMaster(state, SCOPES, 12);
    if (!near(m.workforce, 10)) ok = false;
    if (m.allocated > m.workforce + 1e-6) ok = false;
    if (m.free < -1e-6) ok = false;
    // Nobody ever exceeds themselves.
    const per = new Map<string, number>();
    for (const a of state.allocations) per.set(a.personId, (per.get(a.personId) ?? 0) + a.fraction);
    if ([...per.values()].some((v) => v > 1 + 1e-6)) ok = false;
  }
  check("Through six fader moves: workforce fixed, allocation never exceeds it, nobody over 100%", ok);
  check("Free capacity is never negative", freeFte(state) >= -1e-6, `free ${f(freeFte(state))}`);

  const need = reductionRequirement(state, workforceFte(state.people) - 3);
  check(
    "Shrinking the workforce past free capacity reports what must be released first",
    need >= 0,
    `${f(need)} FTE of project allocation must come down`
  );
}

console.log(failures === 0 ? "\nALL PROOFS PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
