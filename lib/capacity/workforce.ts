// THE FINITE WORKFORCE. Pure and isomorphic -- no Prisma, no network, no
// React. Runs server-side in the forecast path and client-side on every
// fader drag, so the number the mixer shows and the number the simulation
// receives can never be two different calculations.
//
// ── THE PRODUCT LAW ───────────────────────────────────────────────────
//
//   EVERY FTE IS CONSERVED.
//
// A project fader does not create capacity. It redistributes a finite
// pool of embodied humans. Only the Workforce control on the Master bus
// changes how much human capacity exists -- that is hiring, and it is a
// different act from planning.
//
// So every operation here is a TRANSFER, not an assignment. Raising a
// channel takes free capacity (or reports that there is none); lowering a
// channel returns capacity to free. The sum is invariant across both.
//
// ── EMBODIED UNITS ────────────────────────────────────────────────────
//
// Capacity is carried by Person rows. A Person is a unit of human
// capacity with an fte (1.0 = full-time) and an optional name. The name is
// METADATA: "Person 07" and "Alice" are the same unit, and relabelling one
// must not move a forecast by a single day. Anonymous units are first-class
// -- this is a planning instrument, not an employee directory.
//
//   raw contribution to a scope = person.fte x allocation.fraction
//   scope raw capacity          = SUM of those over the scope
//   workforce                   = SUM of active person.fte
//
// A person's fractions across all scopes total at most 1.0. They exist
// exactly once however many projects they are split across; splitting
// costs EFFECTIVENESS, never headcount.

import { switchFactorFor, type PersonLike, type AllocationLike } from "./resolve";

const EPS = 1e-6;

export interface WorkforceState {
  people: PersonLike[];
  allocations: AllocationLike[];
}

export interface ChannelReading {
  scopeId: string;
  /** Physical human allocation: SUM(fte x fraction). What the fader sets. */
  raw: number;
  /** Delivery capacity after context-switch friction. What the forecast gets. */
  effective: number;
  /** How much of `raw` is carried by people who also work elsewhere. This is
      the number that explains a gap between raw and effective. */
  splitRaw: number;
  /** Distinct people on this scope who also work elsewhere. */
  splitPeople: number;
  /** Distinct people contributing at all. */
  people: number;
  /** Requested by the fader but unavailable -- the portfolio has nobody
      left to give. Zero unless the scenario is asking for more than exists. */
  required: number;
}

export interface MasterReading {
  /** Total embodied human capacity that exists. Only hiring changes this. */
  workforce: number;
  /** Physically allocated across every channel. */
  allocated: number;
  /** Workforce not yet allocated anywhere. Never negative. */
  free: number;
  /** Delivery capacity after context-switch friction, across every channel. */
  effective: number;
  /** Allocation requested beyond the workforce. Non-zero means the scenario
      is auditioning people who do not exist, and Reality cannot accept it. */
  required: number;
  /** Signed headroom: positive = spare, negative = deficit. */
  overUnder: number;
}

// ── READINGS ──────────────────────────────────────────────────────────

export function workforceFte(people: PersonLike[]): number {
  return people.filter((p) => p.active).reduce((t, p) => t + p.fte, 0);
}

/** How much of each person's own time is committed, 0..1. */
export function committedFractionByPerson(allocations: AllocationLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of allocations) {
    if (a.fraction <= EPS) continue;
    out.set(a.personId, (out.get(a.personId) ?? 0) + a.fraction);
  }
  return out;
}

/** Distinct scopes each person works on -- what the switch penalty keys on. */
export function scopeCountByPerson(allocations: AllocationLike[]): Map<string, number> {
  const scopes = new Map<string, Set<string>>();
  for (const a of allocations) {
    if (a.fraction <= EPS) continue;
    let set = scopes.get(a.personId);
    if (!set) scopes.set(a.personId, (set = new Set()));
    set.add(a.scopeId);
  }
  return new Map([...scopes].map(([id, s]) => [id, s.size]));
}

/** Unallocated capacity in the pool, in FTE. */
export function freeFte(state: WorkforceState): number {
  const committed = committedFractionByPerson(state.allocations);
  return state.people
    .filter((p) => p.active)
    .reduce((t, p) => t + Math.max(0, 1 - (committed.get(p.id) ?? 0)) * p.fte, 0);
}

export function readChannel(
  state: WorkforceState,
  scopeId: string,
  contextSwitchCostPct: number,
  required = 0
): ChannelReading {
  const active = new Map(state.people.filter((p) => p.active).map((p) => [p.id, p]));
  const counts = scopeCountByPerson(state.allocations);

  let raw = 0;
  let effective = 0;
  let splitRaw = 0;
  let splitPeople = 0;
  let people = 0;

  for (const a of state.allocations) {
    if (a.scopeId !== scopeId || a.fraction <= EPS) continue;
    const person = active.get(a.personId);
    if (!person) continue;
    const contribution = a.fraction * person.fte;
    const count = counts.get(a.personId) ?? 1;
    raw += contribution;
    effective += contribution * switchFactorFor(contextSwitchCostPct, count);
    people += 1;
    if (count > 1) {
      splitRaw += contribution;
      splitPeople += 1;
    }
  }

  // Capacity the scenario asked for and could not find. Modelled as a
  // dedicated person, so it carries no switch penalty -- a new hire put on
  // one project is not split.
  return { scopeId, raw: raw + required, effective: effective + required, splitRaw, splitPeople, people, required };
}

export function readMaster(
  state: WorkforceState,
  scopeIds: string[],
  contextSwitchCostPct: number,
  requiredByScope: Record<string, number> = {}
): MasterReading {
  const workforce = workforceFte(state.people);
  const channels = scopeIds.map((id) => readChannel(state, id, contextSwitchCostPct, requiredByScope[id] ?? 0));
  const required = channels.reduce((t, c) => t + c.required, 0);
  const allocated = channels.reduce((t, c) => t + c.raw, 0);
  const effective = channels.reduce((t, c) => t + c.effective, 0);
  return {
    workforce,
    allocated,
    // Allocation beyond the workforce is a deficit, not negative free space.
    free: Math.max(0, workforce - allocated),
    effective,
    required,
    overUnder: workforce - allocated,
  };
}

// ── TRANSFERS ─────────────────────────────────────────────────────────

export interface FaderResult {
  allocations: AllocationLike[];
  /** What the channel actually reached. */
  achievedRaw: number;
  /** Requested minus achieved -- capacity the portfolio does not contain. */
  required: number;
}

function clone(allocations: AllocationLike[]): AllocationLike[] {
  return allocations.filter((a) => a.fraction > EPS).map((a) => ({ ...a }));
}

// Who to take free capacity from, in order of least disruption:
//
//   1. people already on this scope who still have spare time -- topping
//      someone up adds capacity without involving anyone new and without
//      creating a split
//   2. people allocated nowhere at all -- a whole person joining one
//      project, still no split
//   3. everyone else with spare time -- this necessarily creates a split,
//      so it is the last resort
//
// Ties break on personId so the same drag always produces the same result.
function acquisitionOrder(
  state: WorkforceState,
  scopeId: string,
  committed: Map<string, number>
): { person: PersonLike; freeFraction: number; tier: number }[] {
  const onScope = new Set(
    state.allocations.filter((a) => a.scopeId === scopeId && a.fraction > EPS).map((a) => a.personId)
  );
  return state.people
    .filter((p) => p.active)
    .map((person) => {
      const used = committed.get(person.id) ?? 0;
      const freeFraction = Math.max(0, 1 - used);
      const tier = onScope.has(person.id) ? 0 : used <= EPS ? 1 : 2;
      return { person, freeFraction, tier };
    })
    .filter((c) => c.freeFraction > EPS)
    .sort((a, b) => a.tier - b.tier || a.person.id.localeCompare(b.person.id));
}

// Who to give back first when a channel comes down: the most-split people,
// because releasing them recovers effectiveness elsewhere as well as
// capacity here. Then smallest contributions, so a channel sheds its
// fragments before it gives up a whole dedicated person.
function releaseOrder(
  state: WorkforceState,
  scopeId: string
): { allocation: AllocationLike; person: PersonLike; contribution: number; scopeCount: number }[] {
  const active = new Map(state.people.filter((p) => p.active).map((p) => [p.id, p]));
  const counts = scopeCountByPerson(state.allocations);
  return state.allocations
    .filter((a) => a.scopeId === scopeId && a.fraction > EPS && active.has(a.personId))
    .map((allocation) => {
      const person = active.get(allocation.personId)!;
      return {
        allocation,
        person,
        contribution: allocation.fraction * person.fte,
        scopeCount: counts.get(allocation.personId) ?? 1,
      };
    })
    .sort(
      (a, b) =>
        b.scopeCount - a.scopeCount ||
        a.contribution - b.contribution ||
        a.person.id.localeCompare(b.person.id)
    );
}

/**
 * Move one channel's physical allocation to `requestedRaw`, conserving the
 * portfolio. Raising consumes free capacity and reports any shortfall as
 * `required` rather than inventing a donor or a person; lowering returns
 * capacity to free. Never silently touches another channel.
 */
export function setChannelRaw(
  state: WorkforceState,
  scopeId: string,
  requestedRaw: number,
  contextSwitchCostPct = 0
): FaderResult {
  const target = Math.max(0, requestedRaw);
  const allocations = clone(state.allocations);
  const current = readChannel({ ...state, allocations }, scopeId, contextSwitchCostPct).raw;
  let delta = target - current;

  if (Math.abs(delta) <= EPS) return { allocations, achievedRaw: current, required: 0 };

  if (delta > 0) {
    const committed = committedFractionByPerson(allocations);
    for (const candidate of acquisitionOrder({ ...state, allocations }, scopeId, committed)) {
      if (delta <= EPS) break;
      const availableFte = candidate.freeFraction * candidate.person.fte;
      const takeFte = Math.min(delta, availableFte);
      const takeFraction = takeFte / candidate.person.fte;
      const existing = allocations.find((a) => a.personId === candidate.person.id && a.scopeId === scopeId);
      if (existing) existing.fraction += takeFraction;
      else allocations.push({ personId: candidate.person.id, scopeId, fraction: takeFraction });
      delta -= takeFte;
    }
    const achieved = readChannel({ ...state, allocations }, scopeId, contextSwitchCostPct).raw;
    return { allocations, achievedRaw: achieved, required: Math.max(0, target - achieved) };
  }

  let toRelease = -delta;
  for (const held of releaseOrder({ ...state, allocations }, scopeId)) {
    if (toRelease <= EPS) break;
    const row = allocations.find((a) => a.personId === held.person.id && a.scopeId === scopeId)!;
    const giveFte = Math.min(toRelease, row.fraction * held.person.fte);
    row.fraction -= giveFte / held.person.fte;
    toRelease -= giveFte;
  }
  const kept = allocations.filter((a) => a.fraction > EPS);
  return {
    allocations: kept,
    achievedRaw: readChannel({ ...state, allocations: kept }, scopeId, contextSwitchCostPct).raw,
    required: 0,
  };
}

/**
 * Settle outstanding requests against capacity that is now free.
 *
 * A channel dragged past the pool keeps its requested value and carries the
 * unmet part as `required`. That claim stays open. When capacity later comes
 * free -- another channel came down, or the workforce grew -- the claim is
 * paid out of what is genuinely free.
 *
 * This cannot become auto-donation: it settles by RAISING each pending
 * channel through setChannelRaw, which only ever consumes free capacity. No
 * path here lowers a channel the user did not touch. A neighbour's fader
 * moves only when the user moves it, or through an explicit named transfer.
 *
 * `skipScopeId` is the channel the user currently has hold of; its own value
 * is whatever the hand just asked for and is never re-derived here.
 */
export function settlePending(
  people: PersonLike[],
  allocations: AllocationLike[],
  pending: Map<string, number>,
  contextSwitchCostPct = 0,
  skipScopeId?: string
): { allocations: AllocationLike[]; required: Map<string, number> } {
  let current = allocations;
  const required = new Map(pending);
  // Stable order, so the same free person always lands on the same claim.
  for (const scopeId of [...pending.keys()].sort()) {
    const shortfall = pending.get(scopeId) ?? 0;
    if (scopeId === skipScopeId || shortfall <= EPS) continue;
    const state: WorkforceState = { people, allocations: current };
    const target = readChannel(state, scopeId, contextSwitchCostPct).raw + shortfall;
    const settled = setChannelRaw(state, scopeId, target, contextSwitchCostPct);
    current = settled.allocations;
    if (settled.required > EPS) required.set(scopeId, settled.required);
    else required.delete(scopeId);
  }
  return { allocations: current, required };
}

/**
 * One coordinated physical action: capacity leaves the donor and arrives at
 * the recipient in the same transaction. This is what "take 1.0 from JSA"
 * means -- not two independent edits that happen to cancel out.
 */
export function transferBetweenChannels(
  state: WorkforceState,
  fromScopeId: string,
  toScopeId: string,
  amountFte: number,
  contextSwitchCostPct = 0
): FaderResult {
  const from = readChannel(state, fromScopeId, contextSwitchCostPct);
  const to = readChannel(state, toScopeId, contextSwitchCostPct);
  const moved = Math.min(amountFte, from.raw);

  const released = setChannelRaw(state, fromScopeId, from.raw - moved, contextSwitchCostPct);
  return setChannelRaw({ ...state, allocations: released.allocations }, toScopeId, to.raw + moved, contextSwitchCostPct);
}

export interface DonorSuggestion {
  scopeId: string;
  /** The most this channel could give without going below zero. */
  availableFte: number;
}

/** Channels that genuinely hold capacity to give. Never suggests a donor
    that has none -- an offer the machine cannot honour is worse than no
    offer at all. */
export function suggestDonors(
  state: WorkforceState,
  recipientScopeId: string,
  neededFte: number,
  scopeIds: string[],
  contextSwitchCostPct = 0
): DonorSuggestion[] {
  return scopeIds
    .filter((id) => id !== recipientScopeId)
    .map((id) => ({ scopeId: id, availableFte: readChannel(state, id, contextSwitchCostPct).raw }))
    .filter((d) => d.availableFte > EPS)
    .sort((a, b) => {
      // A donor that can cover the whole need in one move beats one that
      // cannot; among those, take the least disruptive (smallest surplus).
      const aCovers = a.availableFte >= neededFte - EPS;
      const bCovers = b.availableFte >= neededFte - EPS;
      if (aCovers !== bCovers) return aCovers ? -1 : 1;
      return aCovers ? a.availableFte - b.availableFte : b.availableFte - a.availableFte;
    });
}

// ── SPLITTING ONE HUMAN ───────────────────────────────────────────────

export interface SplitLine {
  scopeId: string;
  fraction: number;
}

/**
 * Set one person's whole allocation picture at once. Their fractions must
 * total at most 1.0: a human split 50/50 is still exactly one human, and
 * the model must never be able to say otherwise.
 */
export function setPersonSplit(
  state: WorkforceState,
  personId: string,
  lines: SplitLine[]
): { allocations: AllocationLike[]; error: string | null } {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return { allocations: state.allocations, error: "Unknown person" };

  const kept = lines.filter((l) => l.fraction > EPS);
  const total = kept.reduce((t, l) => t + l.fraction, 0);
  if (total > 1 + EPS) {
    return {
      allocations: state.allocations,
      error: `That commits ${Math.round(total * 100)}% of one person. Nobody has more than 100% of themselves.`,
    };
  }

  const others = clone(state.allocations).filter((a) => a.personId !== personId);
  return {
    allocations: [...others, ...kept.map((l) => ({ personId, scopeId: l.scopeId, fraction: l.fraction }))],
    error: null,
  };
}

export interface SplitPersonView {
  personId: string;
  label: string;
  fte: number;
  lines: SplitLine[];
  scopeCount: number;
  rawFte: number;
  effectiveFte: number;
}

/** Everyone currently working across more than one channel -- the people
    the mixer draws a bridge between, and the only ones paying a switch
    penalty. */
export function splitPeople(state: WorkforceState, contextSwitchCostPct: number): SplitPersonView[] {
  const counts = scopeCountByPerson(state.allocations);
  return state.people
    .filter((p) => p.active && (counts.get(p.id) ?? 0) > 1)
    .map((p) => {
      const lines = state.allocations
        .filter((a) => a.personId === p.id && a.fraction > EPS)
        .map((a) => ({ scopeId: a.scopeId, fraction: a.fraction }))
        .sort((a, b) => b.fraction - a.fraction || a.scopeId.localeCompare(b.scopeId));
      const rawFte = lines.reduce((t, l) => t + l.fraction, 0) * p.fte;
      const factor = switchFactorFor(contextSwitchCostPct, counts.get(p.id) ?? 1);
      return {
        personId: p.id,
        label: p.name,
        fte: p.fte,
        lines,
        scopeCount: counts.get(p.id) ?? 1,
        rawFte,
        effectiveFte: rawFte * factor,
      };
    })
    .sort((a, b) => b.rawFte - a.rawFte || a.personId.localeCompare(b.personId));
}

// ── WORKFORCE (HIRING AND LEAVING) ────────────────────────────────────

export const SYNTHETIC_PREFIX = "Person";

/** Anonymous capacity units for a scenario that hires. Deterministic, so
    auditioning the same hire twice produces the same pool. */
export function hypotheticalHires(count: number, startIndex: number): PersonLike[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `hire-${startIndex + i}`,
    name: `${SYNTHETIC_PREFIX} ${String(startIndex + i).padStart(2, "0")}`,
    fte: 1,
    active: true,
  }));
}

/**
 * Lowering the workforce means somebody leaves. Take it out of free
 * capacity where possible; where it isn't, report exactly how much project
 * allocation must be released first. Never silently deletes an allocated
 * human -- that would quietly reassign their work to nobody.
 */
export function reductionRequirement(state: WorkforceState, targetWorkforce: number): number {
  const available = freeFte(state);
  const reduction = workforceFte(state.people) - targetWorkforce;
  return Math.max(0, reduction - available);
}
