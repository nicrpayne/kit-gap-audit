// THE SIGNAL GRAPH — Audit's semantic projection.
//
// A DERIVED, IN-MEMORY GRAPH PROJECTION OF SIGNAL AUDIT TRUTH.
//
// It is NOT canonical storage, NOT a graph database, NOT a source of truth,
// and it may never mutate Reality. The canonical model stays exactly where it
// is: Prisma rows, read through lib/audit/truth.ts. This module turns that
// read model into a graph and nothing else — build it, throw it away, build
// it again, and nothing in the database has moved.
//
// THREE LAYERS, KEPT APART
//
//   semantic graph   this file          what is related to what, and why
//   layout           lib/audit/layout   where things sit
//   rendering        components/audit   what it looks like
//
// No renderer state lives here. There is no x, y, colour, opacity or
// selection in a node's attributes — a graph that knows about pixels is a
// graph that cannot be reused by a different renderer, and the whole point of
// this layer is that the renderer is replaceable.
//
// EVERY EDGE CITES A RULE.
//
// The single law this module exists to enforce is that a relationship must be
// explainable. Every edge carries a `rule` id into EDGE_RULES below, which
// names the exact field it was constructed from. An edge may never exist
// because two nodes are near each other, because lines cross, or because they
// share a layout region — geometry is downstream of this file and cannot
// reach back into it.
//
// NO FORCE-DIRECTED LAYOUT, EVER. Audit is deliberately composed. graphology
// is used purely as a data structure; none of its layout packages are
// installed and none should be.

import Graph from "graphology";
import type { TruthMapModel } from "./truth";
import type { FindingProvenance } from "./provenance";
import { requirementLabel, type ProjectedRequirement } from "./requirements";
import type { ProjectedPerson } from "./capacity";

// ── EPISTEMIC BASIS ────────────────────────────────────────────────────
//
// Reconciled with Signal's own vocabulary rather than importing a new one.
// The product already distinguishes attested from inferred in exactly this
// sense: `capacitySource: "allocations" | "explicit" | "inferred"`,
// `Person.synthetic` ("stands in for a legacy figure nobody attested"), and
// `DecisionGate.provenance: "manual" | "migrated"`. So:
//
//   ATTESTED  a stored field DIRECTLY NAMES the other endpoint.
//             Finding.evidenceRefs names the passage. Scope.dependsOnScopeIds
//             names the scope. Decision.sourceFindingId names the finding.
//             Delete Signal and the relationship still exists in the data.
//
//   INFERRED  Signal derived the relationship while interpreting Audit state.
//             "A decision belongs to the Decisions lane" is Signal's taxonomy.
//             "A missing_work finding concerns execution" is Signal's reading
//             of `type`. True and useful, but ours, not the world's.
//
// There is NO numeric confidence, because nothing computes one. This is a
// two-valued fact about where a relationship came from, not a score.
export type EdgeBasis = "attested" | "inferred";

export type NodeKind =
  | "reality"
  | "scope"
  | "lane"
  | "checkpoint"
  | "finding"
  | "work"
  | "feature"
  | "decision"
  | "decisionGate"
  | "dependency"
  | "intelligence"
  | "passage"
  | "source"
  | "requirement"
  | "person";

export type EdgeRel =
  | "supports"
  | "attests"
  | "concerns"
  | "evidenced_by"
  | "extracted_from"
  | "linked_to"
  | "depends_on"
  | "blocks"
  | "resolves"
  | "implements"
  | "missing_from"
  | "supersedes"
  | "belongs_to"
  | "allocated_to";

// ── SLICES ─────────────────────────────────────────────────────────────
//
// Progressive detail is a property of the graph, not of the renderer. Every
// node declares the SHALLOWEST slice it belongs to, so a renderer asks for a
// level of detail rather than maintaining its own visibility bookkeeping.
//
//   core      Reality, the Scope, lanes, findings, decisions, dependencies
//   execution individual Linear work items
//   evidence  intelligence packages, passages, original sources
//   detail    checkpoints — Signal's own computed assertions
export type GraphSlice = "core" | "execution" | "evidence" | "detail";

export const SLICE_ORDER: GraphSlice[] = ["core", "execution", "evidence", "detail"];

export interface AuditNodeAttributes {
  kind: NodeKind;
  label: string;
  slice: GraphSlice;
  /** The canonical row this node projects. Never null — a node with no row
      behind it has no business existing. */
  ref: string;
  /** Which lane's sector this node belongs to, when it belongs to one. Used
      by layout for clustering; carries no geometry itself.
  
      ABSENT IS MEANINGFUL. Reality, the Scope and Requirements have no lane
      because they are not part of any source system — they are the project's
      own model. The layout seats them in the structural layer rather than in
      a sector, and the density pass's cluster badges skip them for the same
      reason. */
  lane?: string;
  [key: string]: unknown;
}

export interface AuditEdgeAttributes {
  rel: EdgeRel;
  basis: EdgeBasis;
  /** Into EDGE_RULES. Every edge has one; the proof asserts it. */
  rule: string;
  [key: string]: unknown;
}

export type AuditGraph = Graph<AuditNodeAttributes, AuditEdgeAttributes>;

// ── THE RULE REGISTRY ──────────────────────────────────────────────────
//
// One entry per way an edge can come into existence. `field` names the exact
// canonical column, which is what makes "every edge is explainable" a
// checkable claim rather than a promise.

export interface EdgeRule {
  id: string;
  rel: EdgeRel;
  basis: EdgeBasis;
  from: NodeKind;
  to: NodeKind;
  /** The canonical field this relationship is read from. */
  field: string;
  why: string;
}

export const EDGE_RULES: Record<string, EdgeRule> = {
  "lane-supports-reality": {
    id: "lane-supports-reality",
    rel: "supports",
    basis: "inferred",
    from: "lane",
    to: "reality",
    field: "TruthLane.supplied",
    why: "A supplied lane feeds accepted Reality. An UNSUPPLIED lane gets no edge — the absence is the finding.",
  },
  "checkpoint-attests-lane": {
    id: "checkpoint-attests-lane",
    rel: "attests",
    basis: "inferred",
    from: "checkpoint",
    to: "lane",
    field: "TruthLane.checkpoints",
    why: "A checkpoint is Signal's own computed assertion about a lane.",
  },
  "finding-concerns-lane": {
    id: "finding-concerns-lane",
    rel: "concerns",
    basis: "inferred",
    from: "finding",
    to: "lane",
    field: "Finding.type via laneForFinding()",
    why: "Signal's reading of which domain a finding is about.",
  },
  "finding-missing-from-lane": {
    id: "finding-missing-from-lane",
    rel: "missing_from",
    basis: "inferred",
    from: "finding",
    to: "lane",
    field: 'Finding.type === "missing_work"',
    why: "A sharper relation than `concerns` for the one type that asserts absence: requirements imply this work and execution does not contain it.",
  },
  "finding-evidenced-by-passage": {
    id: "finding-evidenced-by-passage",
    rel: "evidenced_by",
    basis: "attested",
    from: "finding",
    to: "passage",
    field: "Finding.evidenceRefs",
    why: "A stored citation naming the exact EvidenceItem.",
  },
  "finding-evidenced-by-intelligence": {
    id: "finding-evidenced-by-intelligence",
    rel: "evidenced_by",
    basis: "attested",
    from: "finding",
    to: "intelligence",
    field: "Finding.contextSnapshotId",
    why: "A foreign key naming the accepted package.",
  },
  "finding-evidenced-by-source": {
    id: "finding-evidenced-by-source",
    rel: "evidenced_by",
    basis: "attested",
    from: "finding",
    to: "source",
    field: "Finding.sourceId",
    why: "A foreign key naming the pasted Source row.",
  },
  // ── REQUIREMENTS ─────────────────────────────────────────────────────
  //
  // Three rules, and the two that are ABSENT matter as much. See
  // lib/audit/requirements.ts for the projection law and
  // docs/SIGNAL-GRAPH.md for why `implemented_by` and `constrained_by` do
  // not appear here.
  "requirement-belongs-to-scope": {
    id: "requirement-belongs-to-scope",
    rel: "belongs_to",
    basis: "attested",
    from: "requirement",
    to: "scope",
    field: "ContextSnapshot.scopeId",
    why: "The snapshot the requirement was read from names the Scope it was assembled for.",
  },
  "requirement-evidenced-by-passage": {
    id: "requirement-evidenced-by-passage",
    rel: "evidenced_by",
    basis: "attested",
    from: "requirement",
    to: "passage",
    field: "EvidenceItem.id",
    why: "The requirement IS this evidence row, read as a statement. Same row, two levels.",
  },
  "finding-concerns-requirement": {
    id: "finding-concerns-requirement",
    rel: "concerns",
    basis: "attested",
    from: "finding",
    to: "requirement",
    field: "Finding.evidenceRefs",
    why: "The finding explicitly cites this evidence id, inside the same snapshot.",
  },
  // ── CAPACITY ─────────────────────────────────────────────────────────
  //
  // Two rules and one deliberate hole. See docs/SIGNAL-GRAPH.md → Capacity
  // for why `person → assigned_to → work` does not and must not exist.
  "person-allocated-to-scope": {
    id: "person-allocated-to-scope",
    rel: "allocated_to",
    basis: "attested",
    from: "person",
    to: "scope",
    field: "Allocation.personId + Allocation.scopeId",
    why: "A row naming both endpoints and the share of time between them.",
  },
  "person-attests-lane": {
    id: "person-attests-lane",
    rel: "attests",
    basis: "inferred",
    from: "person",
    to: "lane",
    field: "Allocation.scopeId + taxonomy",
    why: "Capacity is the lane people supply. Membership, so never drawn.",
  },
  "passage-extracted-from-source": {
    id: "passage-extracted-from-source",
    rel: "extracted_from",
    basis: "attested",
    from: "passage",
    to: "source",
    field: "EvidenceItem.sourceRef",
    why: "The manifest entry the passage was read out of.",
  },
  "finding-linked-to-work": {
    id: "finding-linked-to-work",
    rel: "linked_to",
    basis: "attested",
    from: "finding",
    to: "work",
    field: "Finding.matchedIssues",
    why: "Linear identifiers the audit checked this claim against.",
  },
  "scope-depends-on-scope": {
    id: "scope-depends-on-scope",
    rel: "depends_on",
    basis: "attested",
    from: "scope",
    to: "dependency",
    field: "Scope.dependsOnScopeIds",
    why: "A declared upstream Scope this one cannot finish ahead of.",
  },
  "gate-blocks-scope": {
    id: "gate-blocks-scope",
    rel: "blocks",
    basis: "attested",
    from: "decisionGate",
    to: "scope",
    field: "DecisionGate.targetScopeId",
    why: "THE ONLY WAY A DECISION REACHES THE FORECAST. A gate names what waits.",
  },
  "gate-gates-decision": {
    id: "gate-gates-decision",
    rel: "blocks",
    basis: "attested",
    from: "decisionGate",
    to: "decision",
    field: "DecisionGate.decisionId",
    why: "The choice the gate is waiting on.",
  },
  "decision-resolves-finding": {
    id: "decision-resolves-finding",
    rel: "resolves",
    basis: "attested",
    from: "decision",
    to: "finding",
    field: "Decision.sourceFindingId",
    why: "The audit finding this Decision was promoted from.",
  },
  "decision-attests-lane": {
    id: "decision-attests-lane",
    rel: "attests",
    basis: "inferred",
    from: "decision",
    to: "lane",
    field: "Decision.scopeId + Signal's lane taxonomy",
    why: "The row exists; placing it on the Decisions lane is Signal's taxonomy.",
  },
  "dependency-attests-lane": {
    id: "dependency-attests-lane",
    rel: "attests",
    basis: "inferred",
    from: "dependency",
    to: "lane",
    field: "Scope.dependsOnScopeIds + Signal's lane taxonomy",
    why: "As above: the edge exists, the lane is Signal's grouping.",
  },
  "work-attests-lane": {
    id: "work-attests-lane",
    rel: "attests",
    basis: "inferred",
    from: "work",
    to: "lane",
    field: "LinearIssueSummary + Signal's lane taxonomy",
    why: "As above.",
  },
  "work-implements-feature": {
    id: "work-implements-feature",
    rel: "implements",
    basis: "attested",
    from: "work",
    to: "feature",
    field: "LinearIssueSummary.parentIdentifier",
    why: "Linear has no first-class Feature entity — a Feature IS the ancestor issue an implementation issue hangs from. The parent link is the only thing that says so.",
  },
  "feature-attests-lane": {
    id: "feature-attests-lane",
    rel: "attests",
    basis: "inferred",
    from: "feature",
    to: "lane",
    field: "LinearIssueSummary.parentIdentifier + Signal's lane taxonomy",
    why: "The Feature is real; placing it on the execution lane is Signal's grouping.",
  },
  "work-implements-work": {
    id: "work-implements-work",
    rel: "implements",
    basis: "attested",
    from: "work",
    to: "work",
    field: "LinearIssueSummary.parentIdentifier",
    why: "Linear's own issue nesting: an implementation issue hangs from its Feature.",
  },
  "registration-supersedes-registration": {
    id: "registration-supersedes-registration",
    rel: "supersedes",
    basis: "attested",
    from: "source",
    to: "source",
    field: "SourceRegistration.supersededByRegistrationId",
    why: "An unambiguous replacement pointer between tracked sources.",
  },
};

// ── WHAT THE BUILDER NEEDS ─────────────────────────────────────────────
//
// Identified ROWS, not the aggregate counts the Truth Map renders. The
// existing TruthMapModel deliberately collapses decisions, dependencies and
// work into checkpoint counts, which is right for a map of lanes and wrong
// for a graph of entities — see docs/AUDIT-INSTRUMENT.md.

export interface GraphEntityInputs {
  scope: { id: string; name: string; dependsOnScopeIds: string[] };
  decisions: {
    id: string;
    title: string;
    status: string;
    owner: string | null;
    sourceFindingId: string | null;
    gate: { id: string; targetScopeId: string; dependency: string; low: number; likely: number; high: number } | null;
  }[];
  /** Upstream Scopes, resolved. */
  dependsOn: { id: string; name: string; targetDate: string | null }[];
  work: {
    identifier: string;
    title: string;
    state: string;
    stateType: string;
    estimate: number | null;
    assignee: string | null;
    parentIdentifier: string | null;
    parentTitle: string | null;
  }[];
  /** Tracked-source registrations, for the supersedes relation. */
  registrations: { id: string; sourceType: string; sourceRef: string; status: string; supersededByRegistrationId: string | null }[];
  /** Who is carrying this Scope, already resolved by lib/capacity — this
      layer applies no capacity rule and does no capacity arithmetic. */
  people: ProjectedPerson[];
  /** What the project says must be true, projected from snapshots whose
      manifest declares a `requirements_of_record` source. Already filtered by
      lib/audit/requirements.ts — this layer applies no rule of its own. */
  requirements: ProjectedRequirement[];
  /** Which evidence ids each finding cites, and in which snapshot. The
      `concerns` edge needs both: an evidence id is only meaningful inside its
      own package, so matching on the bare id across snapshots would attach a
      finding to a requirement it never cited. */
  findingCitations: { findingId: string; snapshotId: string; evidenceIds: string[] }[];
}

export interface BuildGraphInput {
  model: TruthMapModel;
  provenance: Record<string, FindingProvenance>;
  entities: GraphEntityInputs;
}

// ── NODE IDS ───────────────────────────────────────────────────────────
//
// Namespaced by kind so two kinds can never collide, and — for passages —
// namespaced by SNAPSHOT as well.
//
// That last point is a correctness requirement, not tidiness. EvidenceItem.id
// is documented as "stable WITHIN this package/snapshot's sourceRef -- not
// claimed stable across time". Two snapshots can legitimately both contain an
// item called "row-14". Keying a passage node on the bare evidence id would
// silently merge two different passages from two different packages into one
// node, and every citation through it would then be wrong.
export const nodeId = {
  reality: () => "reality",
  scope: (id: string) => `scope:${id}`,
  lane: (id: string) => `lane:${id}`,
  checkpoint: (id: string) => `checkpoint:${id}`,
  finding: (id: string) => `finding:${id}`,
  work: (identifier: string) => `work:${identifier}`,
  feature: (identifier: string) => `feature:${identifier}`,
  decision: (id: string) => `decision:${id}`,
  gate: (id: string) => `gate:${id}`,
  dependency: (scopeId: string) => `dependency:${scopeId}`,
  intelligence: (snapshotId: string) => `intelligence:${snapshotId}`,
  // Snapshot-scoped for the same reason a passage is: the requirement IS an
  // EvidenceItem, and EvidenceItem.id is documented as stable only within its
  // own package. Two snapshots may each carry a "row-14"; keying on the bare
  // id would merge two different requirements into one node and misroute
  // every finding that cites either.
  requirement: (snapshotId: string, evidenceId: string) => `requirement:${snapshotId}:${evidenceId}`,
  // KEYED ON Person.id, NEVER ON THE NAME. `Person.name` is documented as a
  // label — "Person 07" and "Alice" are the same unit of capacity — so a
  // name-keyed node would merge two people the moment two units shared a
  // label, and would silently re-point every allocation when someone is
  // renamed.
  person: (personId: string) => `person:${personId}`,
  passage: (snapshotId: string, evidenceId: string) => `passage:${snapshotId}:${evidenceId}`,
  /** Package manifest entries and Source rows are different namespaces and
      must not be able to collide on a shared string. */
  packageSource: (sourceRef: string) => `source:pkg:${sourceRef}`,
  rowSource: (id: string) => `source:row:${id}`,
};

/**
 * Build the Signal Graph for one Scope.
 *
 * DETERMINISTIC: same read model in, byte-identical graph out. Nothing here
 * reads a clock, a random source, or the database. Insertion order is fixed
 * by iterating the model's own stable orderings.
 */
export function buildAuditGraph({ model, provenance, entities }: BuildGraphInput): AuditGraph {
  const g: AuditGraph = new Graph<AuditNodeAttributes, AuditEdgeAttributes>({
    type: "directed",
    multi: true,
    allowSelfLoops: false,
  });

  const link = (from: string, to: string, ruleId: string, extra: Record<string, unknown> = {}) => {
    const rule = EDGE_RULES[ruleId];
    if (!rule) throw new Error(`Unknown edge rule "${ruleId}"`);
    // NEVER a dangling edge. graphology would happily create the missing node
    // implicitly on some APIs; refusing here means a projection bug surfaces
    // as a loud error instead of a phantom node on the map.
    if (!g.hasNode(from) || !g.hasNode(to)) {
      throw new Error(`Edge ${ruleId} references a missing node: ${!g.hasNode(from) ? from : to}`);
    }
    g.addDirectedEdge(from, to, { rel: rule.rel, basis: rule.basis, rule: ruleId, ...extra });
  };

  // ── REALITY AND THE SCOPE ────────────────────────────────────────────
  g.addNode(nodeId.reality(), {
    kind: "reality",
    label: "Reality",
    slice: "core",
    ref: `Scope:${model.scopeId}`,
  });
  g.addNode(nodeId.scope(entities.scope.id), {
    kind: "scope",
    label: entities.scope.name,
    slice: "core",
    ref: `Scope:${entities.scope.id}`,
  });

  // ── LANES AND CHECKPOINTS ────────────────────────────────────────────
  for (const lane of model.lanes) {
    g.addNode(nodeId.lane(lane.id), {
      kind: "lane",
      label: lane.label,
      slice: "core",
      ref: `TruthLane:${lane.id}`,
      lane: lane.id,
      family: lane.family,
      state: lane.state,
      supplied: lane.supplied,
    });
    // THE ABSENCE IS THE FINDING. An unsupplied lane gets no supports edge,
    // so "nothing is feeding this" falls out of the graph's shape rather than
    // needing a flag anyone has to remember to read.
    if (lane.supplied) link(nodeId.lane(lane.id), nodeId.reality(), "lane-supports-reality");

    for (const cp of lane.checkpoints) {
      g.addNode(nodeId.checkpoint(cp.id), {
        kind: "checkpoint",
        label: cp.label,
        slice: "detail",
        ref: `TruthCheckpoint:${cp.id}`,
        lane: lane.id,
        state: cp.state,
        detail: cp.detail,
      });
      link(nodeId.checkpoint(cp.id), nodeId.lane(lane.id), "checkpoint-attests-lane");
    }
  }

  // ── DEPENDENCIES ─────────────────────────────────────────────────────
  for (const dep of entities.dependsOn) {
    g.addNode(nodeId.dependency(dep.id), {
      kind: "dependency",
      label: dep.name,
      slice: "core",
      ref: `Scope:${dep.id}`,
      lane: "dependencies",
      targetDate: dep.targetDate,
    });
    link(nodeId.scope(entities.scope.id), nodeId.dependency(dep.id), "scope-depends-on-scope");
    if (g.hasNode(nodeId.lane("dependencies")))
      link(nodeId.dependency(dep.id), nodeId.lane("dependencies"), "dependency-attests-lane");
  }

  // ── DECISIONS AND GATES ──────────────────────────────────────────────
  for (const d of entities.decisions) {
    g.addNode(nodeId.decision(d.id), {
      kind: "decision",
      label: d.title,
      slice: "core",
      ref: `Decision:${d.id}`,
      lane: "decisions",
      status: d.status,
      owner: d.owner,
      gated: d.gate != null,
    });
    if (g.hasNode(nodeId.lane("decisions")))
      link(nodeId.decision(d.id), nodeId.lane("decisions"), "decision-attests-lane");

    if (d.gate) {
      g.addNode(nodeId.gate(d.gate.id), {
        kind: "decisionGate",
        label: d.gate.dependency,
        slice: "core",
        ref: `DecisionGate:${d.gate.id}`,
        lane: "decisions",
        low: d.gate.low,
        likely: d.gate.likely,
        high: d.gate.high,
      });
      link(nodeId.gate(d.gate.id), nodeId.decision(d.id), "gate-gates-decision");
      // The gate blocks a Scope. Only drawn when that Scope is in this graph
      // — a gate pointing at another project is real, but it is that
      // project's graph, not this one's.
      const target =
        d.gate.targetScopeId === entities.scope.id
          ? nodeId.scope(entities.scope.id)
          : g.hasNode(nodeId.dependency(d.gate.targetScopeId))
            ? nodeId.dependency(d.gate.targetScopeId)
            : null;
      if (target) link(nodeId.gate(d.gate.id), target, "gate-blocks-scope");
    }
  }

  // ── EXECUTION ────────────────────────────────────────────────────────
  //
  // FEATURES FIRST. Linear has no first-class Feature entity: a Feature is
  // the ancestor issue an implementation issue hangs from (see
  // LinearIssueSummary's own note). So a Feature is any parentIdentifier
  // that is NOT itself one of this Scope's work items — the parent is real,
  // it is simply above the slice we fetched. A parent that IS in the list is
  // an ordinary sub-issue relationship and stays `work-implements-work`.
  //
  // This grouping is why the execution cluster can expand at all. Without it
  // the prior tranche measured 46 work nodes seating directly on one lane,
  // which is the hairball this whole layout exists to avoid.
  const workIds = new Set(entities.work.map((w) => w.identifier));
  const features = new Map<string, string>(); // identifier -> title
  for (const w of entities.work) {
    if (!w.parentIdentifier || workIds.has(w.parentIdentifier)) continue;
    if (!features.has(w.parentIdentifier)) {
      features.set(w.parentIdentifier, w.parentTitle ?? w.parentIdentifier);
    }
  }
  for (const [identifier, title] of features) {
    g.addNode(nodeId.feature(identifier), {
      kind: "feature",
      label: title,
      slice: "core",
      ref: `LinearFeature:${identifier}`,
      lane: "linear",
      identifier,
    });
    if (g.hasNode(nodeId.lane("linear")))
      link(nodeId.feature(identifier), nodeId.lane("linear"), "feature-attests-lane");
  }

  for (const w of entities.work) {
    g.addNode(nodeId.work(w.identifier), {
      kind: "work",
      label: w.identifier,
      slice: "execution",
      ref: `LinearIssue:${w.identifier}`,
      lane: "linear",
      title: w.title,
      state: w.state,
      stateType: w.stateType,
      estimate: w.estimate,
      assignee: w.assignee,
    });
  }
  // A second pass, so a parent that appears later in the list still resolves.
  for (const w of entities.work) {
    // Work seats under its Feature where it has one, and only falls back to
    // the lane when it genuinely has no parent — otherwise every ticket
    // would carry a redundant membership edge to the lane as well.
    const featureNode = w.parentIdentifier ? nodeId.feature(w.parentIdentifier) : null;
    if (featureNode && g.hasNode(featureNode)) {
      link(nodeId.work(w.identifier), featureNode, "work-implements-feature");
    } else if (w.parentIdentifier && g.hasNode(nodeId.work(w.parentIdentifier))) {
      link(nodeId.work(w.identifier), nodeId.work(w.parentIdentifier), "work-implements-work");
    } else if (g.hasNode(nodeId.lane("linear"))) {
      link(nodeId.work(w.identifier), nodeId.lane("linear"), "work-attests-lane");
    }
  }

  // ONE PLACE A PASSAGE AND ITS SOURCE ARE BUILT.
  //
  // Two callers need them — a finding citing evidence, and a requirement
  // projecting its own row — and two constructors would drift into two
  // slightly different nodes for the same EvidenceItem.
  const ensurePassage = (
    snapshotId: string,
    psg: {
      evidenceId: string;
      excerpt: string;
      sourceRef: string;
      sourceType: string | null;
      observedAt: string | null;
      role: string | null;
      externalRef: string | null;
    }
  ): string => {
    const pid = nodeId.passage(snapshotId, psg.evidenceId);
    if (!g.hasNode(pid)) {
      g.addNode(pid, {
        kind: "passage",
        label: psg.evidenceId,
        slice: "evidence",
        ref: `EvidenceItem:${snapshotId}:${psg.evidenceId}`,
        // A passage belongs with the SOURCE it was extracted from, not with
        // "evidence" generically: a row read out of a Notion page is Notion's
        // evidence.
        lane: laneForSourceType(psg.sourceType),
        excerpt: psg.excerpt,
        externalRef: psg.externalRef,
      });
    }
    const sid = nodeId.packageSource(psg.sourceRef);
    if (!g.hasNode(sid)) {
      g.addNode(sid, {
        kind: "source",
        label: psg.sourceRef,
        slice: "evidence",
        ref: `PackageSource:${psg.sourceRef}`,
        lane: laneForSourceType(psg.sourceType),
        sourceType: psg.sourceType,
        observedAt: psg.observedAt,
        role: psg.role,
      });
    }
    if (!g.hasDirectedEdge(pid, sid)) link(pid, sid, "passage-extracted-from-source");
    return pid;
  };

  // ── CAPACITY — WHO IS CARRYING THIS ──────────────────────────────────
  //
  // Every figure here was computed by lib/capacity/resolve.ts and is carried
  // through unchanged; see lib/audit/capacity.ts. Audit reads capacity, it
  // does not decide it.
  //
  // People are `core` rather than `execution` for the same reason decisions
  // and dependencies are: there are four of them, not forty, and the sector
  // being empty at rest was the problem this solves. A cluster that says
  // "Capacity" and shows nothing until you open it is a cluster you never
  // open.
  for (const person of entities.people) {
    const pid = nodeId.person(person.personId);
    g.addNode(pid, {
      kind: "person",
      label: person.name,
      slice: "core",
      ref: `Person:${person.personId}`,
      lane: "capacity",
      personId: person.personId,
      fte: person.fte,
      active: person.active,
      synthetic: person.synthetic,
      fraction: person.fraction,
      scopeCount: person.scopeCount,
      switchFactor: person.switchFactor,
      effectiveFte: person.effectiveFte,
      contextSwitchCostPct: person.contextSwitchCostPct,
      // INSPECTOR CONTEXT, NOT TOPOLOGY. Sam's Design allocation is what
      // makes Sam's switch factor 0.88, so the number is uncheckable without
      // it — but drawing a Design node inside a JSA audit would turn a
      // project instrument into a portfolio one. It rides on the node and
      // never becomes an edge.
      allocations: person.allocations,
    });

    if (g.hasNode(nodeId.scope(entities.scope.id))) {
      link(pid, nodeId.scope(entities.scope.id), "person-allocated-to-scope", {
        fraction: person.fraction,
      });
    }
    if (g.hasNode(nodeId.lane("capacity"))) link(pid, nodeId.lane("capacity"), "person-attests-lane");
  }

  // ── REQUIREMENTS — WHAT THE PROJECT SAYS MUST BE TRUE ────────────────
  //
  // Seeded BEFORE findings so `finding → concerns → requirement` has
  // something to point at, and deliberately NOT hung off a lane: a
  // requirement is a project-model entity, not a thing that belongs to
  // Notion. Its `lane` is null and the layout seats it in the structural
  // project layer beside the Scope. Provenance runs outward from there to the
  // passage and the source, which DO live in their source cluster.
  //
  // No filtering happens here. The projection law lives in one place
  // (lib/audit/requirements.ts) so there is exactly one answer to "why is
  // this a requirement".
  for (const r of entities.requirements) {
    g.addNode(nodeId.requirement(r.snapshotId, r.evidenceId), {
      kind: "requirement",
      label: requirementLabel(r),
      slice: "core",
      ref: `EvidenceItem:${r.snapshotId}:${r.evidenceId}`,
      // Omitted on purpose. A cluster is a SOURCE SYSTEM; this is not one.
      statement: r.statement,
      snapshotId: r.snapshotId,
      evidenceId: r.evidenceId,
      sourceRef: r.sourceRef,
      sourceType: r.sourceType,
      // Carried so the node can show its own grounding AND its own limits:
      // `requirements_of_record` says where requirements are recorded, not
      // that the source is approved policy. `sourceStatus` is the honest
      // qualifier and the inspector prints it.
      sourceRole: r.sourceRole,
      sourceStatus: r.sourceStatus,
      registrationId: r.registrationId,
      observedAt: r.observedAt,
      // The producer's own words, reported verbatim, never mapped onto a
      // Signal state. "Committed" is Notion's vocabulary, not ours.
      dataStatus: r.dataStatus,
      section: r.section,
      externalRef: r.externalRef,
    });
    if (g.hasNode(nodeId.scope(entities.scope.id))) {
      link(
        nodeId.requirement(r.snapshotId, r.evidenceId),
        nodeId.scope(entities.scope.id),
        "requirement-belongs-to-scope"
      );
    }

    // A REQUIREMENT CARRIES ITS OWN PROVENANCE, whether or not anyone has
    // raised a finding about it. Passages were previously built only from
    // finding citations, which would have left an uncited requirement with no
    // route back to the row it was read from — and an uncited requirement is
    // exactly the one you most want to trace. Same row, two levels, and the
    // edge between them is the only thing that says so.
    const pid = ensurePassage(r.snapshotId, {
      evidenceId: r.evidenceId,
      excerpt: r.statement,
      sourceRef: r.sourceRef,
      sourceType: r.sourceType,
      observedAt: r.observedAt,
      role: r.sourceRole,
      externalRef: r.externalRef,
    });
    link(nodeId.requirement(r.snapshotId, r.evidenceId), pid, "requirement-evidenced-by-passage");
  }

  // ── FINDINGS AND THEIR PROVENANCE ────────────────────────────────────
  for (const f of model.findings) {
    g.addNode(nodeId.finding(f.id), {
      kind: "finding",
      label: f.title,
      slice: "core",
      ref: `Finding:${f.id}`,
      lane: f.laneId,
      type: f.type,
      kindLabel: f.kindLabel,
      tier: f.tier,
      state: f.state,
      needsHuman: f.needsHuman,
      handled: f.handled,
      blocking: f.blocking,
    });

    // ONE lane edge per finding, typed as precisely as the data allows.
    const laneNode = nodeId.lane(f.laneId);
    if (g.hasNode(laneNode)) {
      link(
        nodeId.finding(f.id),
        laneNode,
        f.type === "missing_work" ? "finding-missing-from-lane" : "finding-concerns-lane"
      );
    }

    for (const issue of f.matchedIssues) {
      // Only when execution actually contains it. A matchedIssues entry with
      // no issue behind it is a stale reference, and inventing a node for it
      // would turn a broken pointer into a fact.
      if (g.hasNode(nodeId.work(issue))) link(nodeId.finding(f.id), nodeId.work(issue), "finding-linked-to-work");
    }

    const p = provenance[f.id];
    if (!p) continue;

    if (p.snapshot) {
      const iid = nodeId.intelligence(p.snapshot.id);
      if (!g.hasNode(iid)) {
        g.addNode(iid, {
          kind: "intelligence",
          label: p.snapshot.packageId,
          slice: "evidence",
          ref: `ContextSnapshot:${p.snapshot.id}`,
          lane: "hermes",
          producer: p.snapshot.producer,
          acceptedAt: p.snapshot.acceptedAt,
        });
      }
      link(nodeId.finding(f.id), iid, "finding-evidenced-by-intelligence");
    }

    for (const psg of p.passages) {
      // A passage only exists inside a snapshot — see the nodeId note.
      if (!p.snapshot) continue;
      const pid = ensurePassage(p.snapshot.id, psg);
      link(nodeId.finding(f.id), pid, "finding-evidenced-by-passage");
    }

    if (p.source) {
      const sid = nodeId.rowSource(p.source.id);
      if (!g.hasNode(sid)) {
        g.addNode(sid, {
          kind: "source",
          label: p.source.title,
          slice: "evidence",
          ref: `Source:${p.source.id}`,
          lane: "evidence",
          sourceType: p.source.kind,
          observedAt: p.source.createdAt,
        });
      }
      link(nodeId.finding(f.id), sid, "finding-evidenced-by-source");
    }
  }

  // ── FINDING → REQUIREMENT ────────────────────────────────────────────
  //
  // Grounded in Finding.evidenceRefs, and matched WITHIN THE FINDING'S OWN
  // SNAPSHOT. Matching on the bare evidence id would let a finding in one
  // package attach itself to a requirement in another that happens to share a
  // row label — which is exactly the collision the snapshot-scoped node id
  // exists to prevent, reintroduced at the edge layer.
  for (const c of entities.findingCitations) {
    const fid = nodeId.finding(c.findingId);
    if (!g.hasNode(fid)) continue;
    for (const evidenceId of c.evidenceIds) {
      const rid = nodeId.requirement(c.snapshotId, evidenceId);
      if (g.hasNode(rid) && !g.hasDirectedEdge(fid, rid)) {
        link(fid, rid, "finding-concerns-requirement");
      }
    }
  }

  // ── DECISION → FINDING, once findings exist ──────────────────────────
  for (const d of entities.decisions) {
    if (!d.sourceFindingId) continue;
    const fid = nodeId.finding(d.sourceFindingId);
    if (g.hasNode(fid)) link(nodeId.decision(d.id), fid, "decision-resolves-finding");
  }

  // ── SUPERSESSION between tracked sources ─────────────────────────────
  //
  // Grounded in a real column. Emits nothing when no registration supersedes
  // another, which is the ordinary case — a rule that fires zero times is not
  // a rule that should be deleted.
  const regById = new Map(entities.registrations.map((r) => [r.id, r]));
  for (const r of entities.registrations) {
    if (!r.supersededByRegistrationId) continue;
    const next = regById.get(r.supersededByRegistrationId);
    if (!next) continue;
    const from = nodeId.packageSource(r.sourceRef);
    const to = nodeId.packageSource(next.sourceRef);
    if (g.hasNode(from) && g.hasNode(to)) link(to, from, "registration-supersedes-registration");
  }

  return g;
}

/** A package manifest sourceType onto a lane id. Null-safe and conservative:
    an unrecognised type lands on `evidence` rather than being forced onto a
    system it may not belong to. */
function laneForSourceType(sourceType: string | null): string {
  const t = (sourceType ?? "").toLowerCase();
  if (t.includes("linear")) return "linear";
  if (t.includes("notion")) return "notion";
  if (t.includes("figma")) return "figma";
  return "evidence";
}

// ── SLICING ────────────────────────────────────────────────────────────

/**
 * A copy of the graph containing only nodes at or shallower than `slice`,
 * plus every edge between surviving nodes.
 *
 * This is how progressive detail works: the renderer asks for a level, it
 * does not maintain its own visibility set. Slicing NEVER mutates the input.
 */
export function sliceGraph(graph: AuditGraph, slice: GraphSlice): AuditGraph {
  const depth = SLICE_ORDER.indexOf(slice);
  const out = graph.copy() as AuditGraph;
  out.forEachNode((n, attr) => {
    if (SLICE_ORDER.indexOf(attr.slice) > depth) out.dropNode(n);
  });
  return out;
}

// ── EVIDENCE SOLO ──────────────────────────────────────────────────────

/**
 * WHY SIGNAL BELIEVES THIS — as a guarded traversal.
 *
 * Deliberately NOT a plain neighbourhood walk. An unrestricted BFS from a
 * finding reaches Reality in two hops (finding → lane → reality) and from
 * there the entire graph, which would "explain" a finding with material that
 * has nothing to do with it. Evidence Solo follows an EXPLICIT ALLOWLIST of
 * relations, in an explicit direction, and stops.
 *
 * The two legs, and nothing else:
 *
 *   PROVENANCE   finding -evidenced_by-> passage -extracted_from-> source
 *                finding -evidenced_by-> intelligence
 *                finding -evidenced_by-> source
 *   SUBJECT      finding -concerns|missing_from-> lane
 *                finding -linked_to-> work
 *
 * Direction is enforced: a finding cites a passage, never the reverse, so the
 * walk never turns round at a shared source and comes back down into an
 * unrelated finding.
 */
export const EVIDENCE_SOLO_RELATIONS: EdgeRel[] = [
  "evidenced_by",
  "extracted_from",
  "concerns",
  "missing_from",
  "linked_to",
];

export interface SoloResult {
  nodes: Set<string>;
  edges: Set<string>;
}

export function evidenceSolo(
  graph: AuditGraph,
  findingNodeId: string,
  relations: EdgeRel[] = EVIDENCE_SOLO_RELATIONS
): SoloResult {
  const allowed = new Set(relations);
  const nodes = new Set<string>([findingNodeId]);
  const edges = new Set<string>();
  if (!graph.hasNode(findingNodeId)) return { nodes, edges };

  // Outbound only. The direction IS the rule.
  const queue: string[] = [findingNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    graph.forEachOutboundEdge(current, (edge, attr, _s, target) => {
      if (!allowed.has(attr.rel)) return;
      edges.add(edge);
      if (!nodes.has(target)) {
        nodes.add(target);
        queue.push(target);
      }
    });
  }
  return { nodes, edges };
}

// ── EXPORT ─────────────────────────────────────────────────────────────

/**
 * A stable, sorted, serialisable form — for proofs, debugging and diffing
 * two graphs.
 *
 * NOT canonical state. Nothing in production may read a hand-edited version
 * of this back in: it is an observation of the graph, in the same way a
 * screenshot is an observation of the screen.
 *
 * Sorted because an unordered export cannot be diffed, and diffing two audits
 * is the whole reason to have one.
 */
export function exportAuditGraph(graph: AuditGraph) {
  return {
    nodes: graph
      .nodes()
      .sort()
      .map((n) => ({ key: n, attributes: graph.getNodeAttributes(n) })),
    edges: graph
      .edges()
      .map((e) => ({
        source: graph.source(e),
        target: graph.target(e),
        attributes: graph.getEdgeAttributes(e),
      }))
      .sort((a, b) =>
        `${a.source}|${a.target}|${a.attributes.rule}`.localeCompare(
          `${b.source}|${b.target}|${b.attributes.rule}`
        )
      ),
  };
}

/** Counts, by node kind and edge relation — the measurement the rendering
    baseline is decided from. */
export function measureGraph(graph: AuditGraph) {
  const nodesByKind: Record<string, number> = {};
  const edgesByRel: Record<string, number> = {};
  const edgesByBasis: Record<string, number> = {};
  graph.forEachNode((_, a) => (nodesByKind[a.kind] = (nodesByKind[a.kind] ?? 0) + 1));
  graph.forEachEdge((_, a) => {
    edgesByRel[a.rel] = (edgesByRel[a.rel] ?? 0) + 1;
    edgesByBasis[a.basis] = (edgesByBasis[a.basis] ?? 0) + 1;
  });
  return { nodes: graph.order, edges: graph.size, nodesByKind, edgesByRel, edgesByBasis };
}
