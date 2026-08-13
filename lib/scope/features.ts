// THE FEATURE LAYER — the product's own unit, assembled from work the engine
// already counts.
//
// A product manager does not think in tickets. They think in capabilities:
// "Offline Capture", "Approval Workflow". Linear has no first-class Feature
// entity, so this module DERIVES one, and it derives it from structure rather
// than from language — never by clustering titles, never by asking a model to
// guess. Three honest sources, and each one is labelled on screen:
//
//   LINEAR   Issues carry a parent chain. After the Epic -> Feature -> Issue
//            -> Sub-issue reorganisation, the top of an issue's parent chain
//            IS its feature. A sub-issue's parent is another issue, so the
//            chain is walked to its root rather than read one level deep.
//   HERMES   An open Finding the audit raised that no ticket represents. The
//            engine already counts its work (see buildForecastInputs) -- what
//            is unsettled is whether it is a capability of its own. It is
//            therefore a CANDIDATE, never accepted Reality.
//   MANUAL   A capability Nic declares directly. Session-local in this pass:
//            there is no Feature table yet (see docs/SCOPE-INSTRUMENT.md).
//
// And one thing that is not a source at all: work with no parent. That is a
// real coverage gap, and it gets its own visibly-unmapped module rather than
// being swept into an invented bucket.

import type { ScopeWorkItem } from "@/lib/instrument/useProject";
import type { CompletedWork } from "@/lib/forecast/compute";

export interface ThreePoint {
  low: number;
  likely: number;
  high: number;
}

/** The expected value of a triangular range -- what the simulation draws on
    average, and therefore the only honest single number for "how big is this".
    Shared with lib/scope/load.ts so the two cannot disagree. */
export function expectedDays(r: ThreePoint): number {
  return (r.low + r.likely + r.high) / 3;
}

export type FeatureSource = "linear" | "hermes" | "manual" | "unmapped";

export interface Feature {
  /** Stable across reloads: the Linear parent identifier, the Finding id, or
      the client-generated draft id. Used as the scenario's bypass key. */
  id: string;
  name: string;
  source: FeatureSource;
  /** The Linear Project the work sits in, when the work agrees on one. */
  epic: string | null;
  /** Remaining work, which is what the simulation actually carries. */
  items: ScopeWorkItem[];
  /** Finished work. Coverage only -- never simulated. */
  done: CompletedWork[];
  /** Expected days of effort, before capacity. */
  effortDays: number;
  /** Expected days of schedule: effort ÷ capacity. */
  loadDays: number;
  /** Summed three-point range across the feature's remaining work. */
  range: ThreePoint;
  /** (high − low) ÷ expected — how unsure this feature is, relative to size. */
  uncertainty: number;
  /** How many of this feature's remaining items rest on a placeholder guess. */
  placeholderCount: number;
  /** For a Hermes candidate: what was said, and why the machine believes it. */
  evidence: { quote: string | null; rationale: string | null } | null;
  /** True once the user has bypassed it in this Scenario. */
  bypassed: boolean;
  /** A Hermes candidate the user has seated by hand, in this Scenario only. */
  accepted: boolean;
}

export interface FeatureComposition {
  features: Feature[];
  /** Engaged features only -- what the release currently carries. */
  engaged: Feature[];
  bypassed: Feature[];
  /** Σ loadDays over engaged features. */
  loadDays: number;
  /** Largest engaged load, for scaling meters against a stable maximum. */
  peakLoadDays: number;
  /** Remaining items across every feature, mapped and unmapped. */
  totalItems: number;
  /** Items that reached no feature at all. */
  unmappedItems: number;
}

const UNMAPPED_ID = "__unmapped__";

// Walks an issue's parent chain to its root. Linear guarantees no cycles, but
// a malformed or partial fetch could still produce one, so the walk is bounded
// rather than trusting the data -- a hung page is a worse failure than a
// feature resolving one level short.
function rootParentOf(
  item: ScopeWorkItem,
  byIdentifier: Map<string, ScopeWorkItem>
): { id: string; title: string } | null {
  if (!item.parentIdentifier) return null;
  let id = item.parentIdentifier;
  let title = item.parentTitle ?? item.parentIdentifier;
  const seen = new Set<string>([item.id]);

  for (let hops = 0; hops < 12; hops++) {
    if (seen.has(id)) break;
    seen.add(id);
    const parentAsIssue = byIdentifier.get(id);
    // The chain ends when the parent is not itself one of the issues we
    // fetched -- that is the Feature, sitting above the implementation work.
    if (!parentAsIssue?.parentIdentifier) break;
    id = parentAsIssue.parentIdentifier;
    title = parentAsIssue.parentTitle ?? id;
  }
  return { id, title };
}

function summarise(
  id: string,
  name: string,
  source: FeatureSource,
  items: ScopeWorkItem[],
  done: CompletedWork[],
  capacity: number,
  epic: string | null,
  evidence: Feature["evidence"],
  bypassed: boolean,
  accepted: boolean,
  estimateOverrides: Record<string, ThreePoint>
): Feature {
  const range = items.reduce<ThreePoint>(
    (acc, i) => {
      const o = estimateOverrides[i.id];
      const r = o ?? { low: i.low, likely: i.likely, high: i.high };
      return { low: acc.low + r.low, likely: acc.likely + r.likely, high: acc.high + r.high };
    },
    { low: 0, likely: 0, high: 0 }
  );
  const effortDays = expectedDays(range);
  return {
    id,
    name,
    source,
    epic,
    items,
    done,
    effortDays,
    loadDays: effortDays / (capacity > 0 ? capacity : 1),
    range,
    // Relative spread. A feature whose range is as wide as it is big is one
    // nobody has really sized, whatever its ticket count says.
    uncertainty: effortDays > 0 ? (range.high - range.low) / effortDays : 0,
    placeholderCount: items.filter(
      (i) => i.estimateSource === "issue_placeholder" || i.estimateSource === "finding_placeholder"
    ).length,
    evidence,
    bypassed,
    accepted,
  };
}

export interface DraftFeature {
  id: string;
  name: string;
  intent: string;
  /** Work item ids the user has reassigned to this draft, session-local. */
  itemIds: string[];
}

export function composeFeatures(
  items: ScopeWorkItem[],
  completedWork: CompletedWork[],
  capacity: number,
  bypassedFeatureIds: Set<string>,
  estimateOverrides: Record<string, ThreePoint>,
  drafts: DraftFeature[],
  acceptedCandidateIds: Set<string> = new Set()
): FeatureComposition {
  const byIdentifier = new Map(items.map((i) => [i.id, i]));

  // A draft feature's claim on a work item outranks its Linear parent: the
  // user has said, in this session, that this is where the work belongs.
  const draftOf = new Map<string, DraftFeature>();
  for (const d of drafts) for (const itemId of d.itemIds) draftOf.set(itemId, d);

  interface Bucket {
    name: string;
    source: FeatureSource;
    items: ScopeWorkItem[];
    epic: string | null;
    evidence: Feature["evidence"];
  }
  const buckets = new Map<string, Bucket>();
  const put = (id: string, name: string, source: FeatureSource, item: ScopeWorkItem, evidence: Feature["evidence"] = null) => {
    const b = buckets.get(id) ?? { name, source, items: [], epic: item.projectName, evidence };
    b.items.push(item);
    buckets.set(id, b);
  };

  for (const item of items) {
    const draft = draftOf.get(item.id);
    if (draft) {
      put(draft.id, draft.name, "manual", item);
      continue;
    }
    // Inferred work has no Linear representation at all -- that IS the
    // finding. It becomes its own Hermes candidate rather than being filed
    // under a feature nobody linked it to.
    if (item.kind === "inferred") {
      put(item.id, item.label, "hermes", item, { quote: item.quote, rationale: item.rationale });
      continue;
    }
    const root = rootParentOf(item, byIdentifier);
    if (!root) {
      put(UNMAPPED_ID, "No capability yet", "unmapped", item);
      continue;
    }
    put(root.id, root.title, "linear", item);
  }

  // Finished work joins the feature it belongs to for coverage. It never
  // creates a feature of its own: a capability with nothing left to do and no
  // remaining work is not part of what we are still deciding to ship.
  const doneByFeature = new Map<string, CompletedWork[]>();
  for (const d of completedWork) {
    if (!d.parentIdentifier) continue;
    const list = doneByFeature.get(d.parentIdentifier) ?? [];
    list.push(d);
    doneByFeature.set(d.parentIdentifier, list);
  }

  const features: Feature[] = [];
  for (const [id, b] of buckets) {
    features.push(
      summarise(
        id,
        b.name,
        b.source,
        b.items,
        doneByFeature.get(id) ?? [],
        capacity,
        b.epic,
        b.evidence,
        bypassedFeatureIds.has(id),
        acceptedCandidateIds.has(id),
        estimateOverrides
      )
    );
  }

  // A draft with no work mapped to it yet is still a real declaration -- "we
  // are going to ship this, we just have not written the tickets". It carries
  // no load, and the surface says so rather than hiding it.
  for (const d of drafts) {
    if (features.some((f) => f.id === d.id)) continue;
    features.push(
      summarise(
        d.id,
        d.name,
        "manual",
        [],
        [],
        capacity,
        null,
        null,
        bypassedFeatureIds.has(d.id),
        acceptedCandidateIds.has(d.id),
        estimateOverrides
      )
    );
  }

  // Heaviest first, but unmapped work always sits last: it is a gap to close,
  // not a capability to weigh against the others.
  features.sort((a, b) => {
    if (a.source === "unmapped") return 1;
    if (b.source === "unmapped") return -1;
    return b.loadDays - a.loadDays || a.name.localeCompare(b.name);
  });

  const engaged = features.filter((f) => !f.bypassed);
  return {
    features,
    engaged,
    bypassed: features.filter((f) => f.bypassed),
    loadDays: engaged.reduce((s, f) => s + f.loadDays, 0),
    peakLoadDays: Math.max(0.001, ...features.map((f) => f.loadDays)),
    totalItems: items.length,
    unmappedItems: buckets.get(UNMAPPED_ID)?.items.length ?? 0,
  };
}

/** Plain-language uncertainty, so the surface never shows a bare ratio.
    Thresholds are stated here once rather than inline in the UI. */
export function uncertaintyLabel(u: number): "Low" | "Moderate" | "High" {
  if (u < 0.9) return "Low";
  if (u < 1.4) return "Moderate";
  return "High";
}

export const UNMAPPED_FEATURE_ID = UNMAPPED_ID;
