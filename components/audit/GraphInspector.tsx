"use client";

// THE GRAPH INSPECTOR. One panel, always beside the graph, never navigating
// away from it — the pattern the reference's side panel establishes and the
// same contract Portfolio's inspector already keeps.
//
// WHAT IT SHOWS DEPENDS ON WHAT IS SELECTED, and the difference is a product
// rule rather than a convenience:
//
//   A FINDING gets the full Audit treatment — claim, evidence, provenance,
//   and the human review actions — because a finding is an accusation
//   somebody has to answer.
//
//   ANY OTHER NODE gets identity, state, connections and provenance, and NO
//   review actions. There is nothing to accept about a Linear ticket; showing
//   "Reject finding" next to one would be offering an action that means
//   nothing.

import type { AuditGraph, AuditNodeAttributes, EdgeBasis } from "@/lib/audit/graph";
import { EDGE_RULES } from "@/lib/audit/graph";
import { SOURCE_KINDS } from "@/lib/audit/sources";
import { nodeColor, KIND_LABEL, REL_LABEL, MEMBERSHIP_RELS } from "./graphTokens";

export interface Connection {
  edgeId: string;
  rel: string;
  basis: EdgeBasis;
  rule: string;
  /** True when this node is the source of the edge. */
  outbound: boolean;
  otherId: string;
  otherLabel: string;
  otherKind: string;
  /** A quantity the edge itself carries, formatted — an allocation's share.
      Null for the relations that are not measured. */
  detail: string | null;
  /** The PRODUCER'S OWN relation name on an external edge — `supersedes`,
      `related_to`, `caused_by`. Signal carries every external relation under
      one of its own so the two vocabularies cannot be confused, and this is
      where the original is preserved and printed. */
  intelRel: string | null;
  /** `temporal` | `semantic` | `contextual` on an external edge. Governs how
      loud the edge is on the field, so the panel says it too. */
  relClass: string | null;
}

/** Every relationship a node actually has, membership excluded — the same
    exclusion the renderer makes, so the list and the picture agree. */
export function connectionsOf(graph: AuditGraph, id: string): Connection[] {
  if (!graph.hasNode(id)) return [];
  return graph
    .edges(id)
    .filter((e) => !MEMBERSHIP_RELS.has(graph.getEdgeAttribute(e, "rel")))
    .map((e) => {
      const a = graph.getEdgeAttributes(e);
      const outbound = graph.source(e) === id;
      const otherId = outbound ? graph.target(e) : graph.source(e);
      const other = graph.getNodeAttributes(otherId);
      return {
        edgeId: e,
        rel: a.rel,
        basis: a.basis,
        rule: a.rule,
        outbound,
        otherId,
        otherLabel: String(other.label),
        otherKind: String(other.kind),
        // The quantity the edge itself was grounded in, when it carries one.
        // An allocation without its share is half a fact.
        detail: typeof a.fraction === "number" ? `${Math.round(a.fraction * 100)}%` : null,
        intelRel: typeof a.intelRel === "string" ? a.intelRel : null,
        relClass: typeof a.relClass === "string" ? a.relClass : null,
      };
    })
    .sort((a, b) => (a.basis === b.basis ? a.rel.localeCompare(b.rel) : a.basis === "attested" ? -1 : 1));
}

export default function GraphInspector({
  graph,
  nodeId,
  onSelect,
  onFocusNode,
  expandedNodes,
  onToggleNode,
  evidenceSolo,
  onEvidenceSolo,
}: {
  graph: AuditGraph;
  nodeId: string;
  onSelect: (id: string) => void;
  onFocusNode: (id: string) => void;
  /** Cluster ids AND source-artifact node ids the user has opened. */
  expandedNodes: Set<string>;
  onToggleNode: (id: string) => void;
  evidenceSolo: boolean;
  /** Null when this node cannot be traced. The control is then not offered
      at all rather than offered and inert — a dead button is worse than no
      button, which this panel learned once already on the source expander. */
  onEvidenceSolo: ((on: boolean) => void) | null;
}) {
  const attrs = graph.getNodeAttributes(nodeId) as AuditNodeAttributes;
  const color = nodeColor(attrs);
  const connections = connectionsOf(graph, nodeId);
  const isRequirement = attrs.kind === "requirement";
  const isPerson = attrs.kind === "person";
  const isSource = SOURCE_KINDS.includes(attrs.kind);
  const isIntel = attrs.kind === "intel";
  // Everything the producer sent that Signal does not model, plus the fields
  // its own type carries. Shown rather than dropped: the boundary must not be
  // where information goes to die, and a reader who can see an unmodelled
  // field can tell Signal it matters.
  const intelFields = (attrs.fields as Record<string, unknown> | undefined) ?? {};
  const intelProvenance = (attrs.provenance as Record<string, unknown> | undefined) ?? {};
  const intelExtra = (attrs.extra as Record<string, unknown> | undefined) ?? {};
  const intelDates = (attrs.dates as Record<string, unknown> | undefined) ?? {};
  // The passages actually extracted from THIS artifact — read off the graph,
  // so the count and the field can never disagree.
  const passages = isSource
    ? graph
        .inEdges(nodeId)
        .filter((e) => graph.getEdgeAttribute(e, "rel") === "extracted_from")
        .map((e) => graph.source(e))
    : [];
  const sourceOpen = expandedNodes.has(nodeId);
  // Its passages may already be on screen because the whole CLUSTER is open,
  // in which case expanding this one artifact would change nothing. A control
  // that does nothing is worse than no control.
  const clusterOpen = typeof attrs.lane === "string" && expandedNodes.has(attrs.lane);
  const pct = (f: number) => `${Math.round(f * 100)}%`;
  const allocations = (attrs.allocations as { scopeName: string; fraction: number; current: boolean }[] | undefined) ?? [];
  // Findings that explicitly cite this requirement's own evidence id. Read
  // off the graph rather than recomputed, so the panel and the field agree.
  const concerningFindings = isRequirement
    ? graph
        .inEdges(nodeId)
        .filter((e) => graph.getEdgeAttribute(e, "rel") === "concerns")
        .map((e) => graph.source(e))
        .filter((n) => graph.getNodeAttribute(n, "kind") === "finding")
    : [];

  return (
    <div className="flex h-full flex-col overflow-y-auto i-noscrollbar" data-shoot="graph-inspector">
      <div className="px-4 pt-4">
        <div className="i-label" style={{ color: "var(--i-text-faint)" }}>
          {KIND_LABEL[attrs.kind] ?? attrs.kind}
        </div>
        <h2 className="mt-2 text-[15px] font-medium leading-snug text-[var(--i-text)]">
          {isRequirement ? String(attrs.statement ?? attrs.label) : String(attrs.label)}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* THE PRODUCER'S OWN WORD, MARKED AS THEIRS. "Committed" is
              Notion's vocabulary read out of the generic `data` escape hatch;
              it is not a Signal state and is never mapped onto one. */}
          {isRequirement && attrs.dataStatus != null && (
            <Chip color="var(--i-mint)">{String(attrs.dataStatus)}</Chip>
          )}
          {isRequirement && attrs.section != null && (
            <Chip color="var(--i-text-soft)">{String(attrs.section)}</Chip>
          )}
          {isSource && attrs.supplied === false && <Chip color="var(--i-reality)">Supplied nothing</Chip>}
          {isSource && attrs.role != null && <Chip color="var(--i-text-soft)">{String(attrs.role)}</Chip>}
          {isPerson && attrs.active === false && <Chip color="var(--i-reality)">Inactive</Chip>}
          {isPerson && attrs.synthetic === true && <Chip color="var(--i-reality)">Synthetic</Chip>}
          {isPerson && Number(attrs.scopeCount) > 1 && (
            <Chip color="var(--i-violet)">Split across {String(attrs.scopeCount)} projects</Chip>
          )}
          {/* THE FIRST THING SAID ABOUT AN EXTERNAL OBJECT IS THAT IT IS
              EXTERNAL, and the second is whether it is still the head. */}
          {isIntel && <Chip color="var(--i-amber)">External · not Signal Reality</Chip>}
          {isIntel && <Chip color="var(--i-text-soft)">{String(attrs.intelligenceType)}</Chip>}
          {isIntel && attrs.isCurrent === false && <Chip color="var(--i-reality)">Superseded</Chip>}
          {isIntel && attrs.dataStatus != null && (
            <Chip color="var(--i-text-faint)">{String(attrs.dataStatus)}</Chip>
          )}
          {attrs.state != null && <Chip color={color}>{String(attrs.state)}</Chip>}
          {attrs.status != null && (
            <Chip color={isSource && attrs.status !== "active" ? "var(--i-amber)" : "var(--i-text-soft)"}>
              {String(attrs.status)}
            </Chip>
          )}
          {attrs.stateType != null && <Chip color="var(--i-text-soft)">{String(attrs.state ?? attrs.stateType)}</Chip>}
          {attrs.supplied === false && <Chip color="var(--i-reality)">Not supplied</Chip>}
          {attrs.gated === true && <Chip color="var(--i-violet)">Gated</Chip>}
        </div>
      </div>

      {/* IDENTITY — the canonical row this node projects. The graph is a
          projection, and the inspector says so rather than implying the node
          is itself the thing. */}
      <div className="mt-4 px-4">
        <Row label="Projects" value={String(attrs.ref)} mono />
        {attrs.lane != null && <Row label="Cluster" value={String(attrs.lane)} />}
        {attrs.owner != null && <Row label="Owner" value={String(attrs.owner)} />}
        {attrs.owner === null && attrs.kind === "decision" && (
          <Row label="Owner" value="Not recorded" tone="var(--i-amber)" />
        )}
        {attrs.assignee != null && <Row label="Assignee" value={String(attrs.assignee)} />}
        {attrs.assignee === null && attrs.kind === "work" && (
          <Row label="Assignee" value="Unassigned" tone="var(--i-amber)" />
        )}
        {attrs.estimate != null && <Row label="Estimate" value={`${attrs.estimate} points`} />}
        {attrs.estimate === null && attrs.kind === "work" && (
          <Row label="Estimate" value="None" tone="var(--i-amber)" />
        )}
        {attrs.targetDate != null && <Row label="Target" value={String(attrs.targetDate).slice(0, 10)} />}
        {attrs.producer != null && <Row label="Producer" value={String(attrs.producer)} />}
        {attrs.observedAt != null && <Row label="Read" value={String(attrs.observedAt).slice(0, 10)} />}
        {attrs.sourceType != null && <Row label="Source type" value={String(attrs.sourceType)} />}
        {attrs.detail != null && <Row label="Measured" value={String(attrs.detail)} />}
      </div>

      {/* ── SOURCE ARTIFACT: WHERE WE LEARNED IT ──────────────────────
          Enough to know what this is and whether to trust it, plus the one
          action the graph is for: open its passages in place. The artifact's
          contents are NOT dumped here — a passage is a navigable anchor, and
          reading one is a click away rather than a scroll. */}
      {isSource && (
        <div className="mt-4 px-4">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            {attrs.supplied === false ? "Declared, but unread" : "This artifact"}
          </div>
          {attrs.sourceType != null && <Row label="Type" value={String(attrs.sourceType)} />}
          {attrs.externalRef != null && <Row label="Reference" value={String(attrs.externalRef)} mono />}
          {attrs.observedAt != null && <Row label="Last read" value={String(attrs.observedAt).slice(0, 10)} />}

          {attrs.supplied === false ? (
            <p className="mt-2 text-[10.5px] leading-[1.55]" style={{ color: "var(--i-amber)" }}>
              This project declares this artifact as context ({String(attrs.declaredIn)}), and the
              current package contains nothing read from it. Signal is pointed at it and is
              working from none of it.
            </p>
          ) : (
            <>
              <Row label="Passages" value={String(passages.length)} />
              {passages.length > 0 && clusterOpen && (
                <p className="mt-2 text-[10.5px] leading-[1.55]" style={{ color: "var(--i-text-faint)" }}>
                  Its passages are already on the graph — the {String(attrs.lane)} cluster is open.
                </p>
              )}
              {passages.length > 0 && !clusterOpen && (
                <button
                  type="button"
                  onClick={() => onToggleNode(nodeId)}
                  data-shoot="source-expand"
                  className="mt-2 w-full rounded-md border px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-white/[0.04]"
                  style={{ borderColor: "var(--i-border-strong)", color: "var(--i-text-soft)" }}
                >
                  {sourceOpen
                    ? `− Collapse ${passages.length} passage${passages.length === 1 ? "" : "s"} on the graph`
                    : `+ Open ${passages.length} passage${passages.length === 1 ? "" : "s"} on the graph`}
                </button>
              )}
              {passages.length === 0 && (
                <p className="mt-2 text-[10.5px] leading-[1.55]" style={{ color: "var(--i-text-faint)" }}>
                  Nothing in the current package was extracted from this artifact as a
                  quotable passage. Findings citing it quote it directly.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PERSON: CAPACITY, AS THE RESOLVER COMPUTED IT ─────────────
          Every figure here comes out of lib/capacity/resolve.ts unchanged, so
          the number beside a face and the number the forecast receives are
          one calculation. The switch factor names the setting it came from,
          because 0.88 is a consequence of a knob someone set, not a law. */}
      {isPerson && (
        <div className="mt-4 px-4">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            Capacity
          </div>
          <Row label="Base capacity" value={`${attrs.fte} FTE`} />
          <Row label="Allocated here" value={`${pct(Number(attrs.fraction))} of their time`} />
          <Row label="Projects" value={String(attrs.scopeCount)} />
          <Row
            label="Context switch"
            value={
              Number(attrs.switchFactor) === 1
                ? "None — single project"
                : `×${Number(attrs.switchFactor).toFixed(2)} at ${attrs.contextSwitchCostPct}% per extra project`
            }
            tone={Number(attrs.switchFactor) === 1 ? undefined : "var(--i-violet)"}
          />
          <Row label="Effective here" value={`${Number(attrs.effectiveFte).toFixed(2)} FTE`} />

          {allocations.length > 1 && (
            <div className="mt-3">
              <div className="i-label mb-1.5" style={{ color: "var(--i-text-faint)" }}>
                Also committed to
              </div>
              <div className="space-y-1">
                {allocations.map((a) => (
                  <div key={a.scopeName} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span style={{ color: a.current ? "var(--i-text)" : "var(--i-text-soft)" }}>
                      {a.scopeName}
                      {a.current ? " · this project" : ""}
                    </span>
                    <span className="i-readout text-[11px] text-[var(--i-text)]">{pct(a.fraction)}</span>
                  </div>
                ))}
              </div>
              {/* THE GRAPH SHOWS THIS SCOPE; THE INSPECTOR EXPLAINS THE REST.
                  The other commitment is what makes the switch factor what it
                  is, so hiding it would leave an uncheckable number — but
                  drawing that project here would turn a project instrument
                  into a portfolio one. */}
              <p className="mt-1.5 text-[10.5px] leading-[1.5]" style={{ color: "var(--i-text-faint)" }}>
                Listed for context. The graph stays this project — the other work is
                why the context-switch factor is what it is.
              </p>
            </div>
          )}

          {attrs.synthetic === true && (
            <p className="mt-3 text-[10.5px] leading-[1.55]" style={{ color: "var(--i-amber)" }}>
              Modelled capacity, not a verified person. This unit stands in for a stated
              team size nobody attributed to anyone.
            </p>
          )}

          {/* THE GAP, STATED WHERE IT MATTERS. Someone looking at a person on
              this field will reasonably ask what they are working on, and the
              honest answer is that Signal cannot say. */}
          <p className="mt-3 text-[10.5px] leading-[1.55]" style={{ color: "var(--i-text-faint)" }}>
            Capacity allocation is project-level. Signal has no grounded link from a
            person to a Feature or a ticket, so it cannot say what this person is
            working on.
          </p>
        </div>
      )}

      {/* ── REQUIREMENT: ITS GROUNDING, AND ITS LIMITS ─────────────────
          The role says where requirements are RECORDED. It does not say the
          source is approved policy — and on the current JSA package it is a
          `candidate` source with no registration behind it. Printing the
          status beside the role is what stops "requirement of record" being
          read as "company-approved". */}
      {isRequirement && (
        <div className="mt-4 px-4">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            Where this comes from
          </div>
          <Row label="Source" value={String(attrs.sourceRef ?? "—")} />
          <Row label="Source role" value={String(attrs.sourceRole ?? "—")} mono />
          <Row
            label="Source status"
            value={String(attrs.sourceStatus ?? "—")}
            tone={attrs.sourceStatus === "active" ? undefined : "var(--i-amber)"}
          />
          <Row
            label="Registered"
            value={attrs.registrationId != null ? String(attrs.registrationId) : "Not registered"}
            tone={attrs.registrationId != null ? undefined : "var(--i-amber)"}
          />
          <p className="mt-2 text-[10.5px] leading-[1.55]" style={{ color: "var(--i-text-faint)" }}>
            {attrs.sourceStatus === "active"
              ? "This source is an active requirements-of-record source for the project."
              : "This source records requirements but is not yet an accepted, registered source. Treat it as what the project says, not as approved policy."}
          </p>
        </div>
      )}

      {/* ── IMPLEMENTATION COVERAGE, STATED EXACTLY ────────────────────
          The distinction this panel exists to hold: Signal knows what it has
          been told, and being told nothing is not the same as nothing being
          true. Nothing in the current model links a requirement to work, so
          the honest sentence is about SIGNAL'S KNOWLEDGE, not about the
          project. Saying "not implemented" here would be inventing an
          observation out of an absence. */}
      {isRequirement && (
        <div className="mt-4 px-4">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            Implementation
          </div>
          <div
            className="rounded-md border px-3 py-2.5"
            style={{ borderColor: "var(--i-border-strong)", background: "var(--i-panel)" }}
          >
            <div className="text-[11.5px] text-[var(--i-text)]">No grounded implementation link</div>
            <p className="mt-1 text-[10.5px] leading-[1.55]" style={{ color: "var(--i-text-faint)" }}>
              Signal has no stored field connecting this requirement to a Feature or a
              Linear issue, so it cannot say which work delivers it.{" "}
              <span style={{ color: "var(--i-text-soft)" }}>
                That is a gap in what Signal has been told — not evidence that nobody
                built it.
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Findings that name this requirement's own evidence id. */}
      {isRequirement && concerningFindings.length > 0 && (
        <div className="mt-4 px-4">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            Findings concerning this
          </div>
          <div className="space-y-1.5">
            {concerningFindings.map((f) => {
              const fa = graph.getNodeAttributes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => onSelect(f)}
                  data-shoot="requirement-finding"
                  className="w-full rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-white/[0.03]"
                  style={{ borderColor: "var(--i-border)" }}
                >
                  <span className="block text-[9px] uppercase tracking-[0.14em]" style={{ color: nodeColor(fa) }}>
                    {String(fa.kindLabel ?? "Finding")} · {String(fa.tier)}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-[1.45] text-[var(--i-text)]">
                    {String(fa.label)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── EXTERNAL STRUCTURED INTELLIGENCE ──────────────────────────
          The trust boundary is already held structurally — its own node kind,
          its own edge basis, its own relation, its own band outside the
          record's edge, and no rule joining it to any Signal entity. This
          panel is not the boundary; it EXPLAINS the one already there, which
          is the difference between a guarantee and a disclaimer. */}
      {isIntel && (
        <div className="mt-4 px-4">
          <div
            className="rounded-md border px-3 py-2.5"
            style={{ borderColor: "color-mix(in srgb, var(--i-amber) 40%, transparent)", background: "var(--i-panel)" }}
          >
            <div className="text-[11.5px]" style={{ color: "var(--i-amber)" }}>
              A claim from outside Signal
            </div>
            <p className="mt-1 text-[10.5px] leading-[1.55]" style={{ color: "var(--i-text-faint)" }}>
              This was produced by an external knowledge system reading the same evidence.
              It is what that system BELIEVES the evidence supports.{" "}
              <span style={{ color: "var(--i-text-soft)" }}>
                It is not an accepted Signal decision, dependency, or finding, it changes no
                forecast, and nothing in Signal has checked it.
              </span>
            </p>
          </div>

          <div className="mt-3">
            <Row label="Type" value={String(attrs.intelligenceType)} />
            <Row label="Trust" value={String(attrs.trust)} mono />
            {/* THE PRODUCER'S OWN HEAD DETERMINATION, never derived from
                status — the corpus contains objects that are open AND
                superseded, and reading one from the other gets those wrong. */}
            <Row
              label="Still current"
              value={attrs.isCurrent === false ? "No — superseded" : "Yes — head of its chain"}
              tone={attrs.isCurrent === false ? "var(--i-text-faint)" : undefined}
            />
            {attrs.dataStatus != null && <Row label="Producer status" value={String(attrs.dataStatus)} />}
            {attrs.statementBasis != null && <Row label="Statement basis" value={String(attrs.statementBasis)} mono />}
            {attrs.observedDate != null && <Row label="Observed" value={String(attrs.observedDate).slice(0, 10)} />}
            <Row label="Producer id" value={String(attrs.externalId)} mono />
          </div>

          {attrs.isCurrent === false && (
            <p className="mt-2 text-[10.5px] leading-[1.55]" style={{ color: "var(--i-text-faint)" }}>
              The producer no longer holds this as current. It is kept so the chain that
              replaced it can be followed, and it stays a mark on the field until something
              reaches it.
            </p>
          )}

          {Object.keys(intelDates).length > 0 && (
            <KeyValues title="Dates" values={intelDates} />
          )}
          {Object.keys(intelFields).length > 0 && (
            <KeyValues title={`${String(attrs.intelligenceType)} fields`} values={intelFields} />
          )}
          {Object.keys(intelProvenance).length > 0 && (
            <KeyValues title="Producer provenance" values={intelProvenance} />
          )}
          {/* NOTHING IS DROPPED AT THE BOUNDARY. The transport preserves any
              field Signal does not model; showing it here is what makes that
              preservation checkable by a person rather than only by a proof. */}
          {Object.keys(intelExtra).length > 0 && (
            <KeyValues title="Not modelled by Signal" values={intelExtra} />
          )}

          {/* WHY DOES THE PRODUCER SAY THIS — the same guarded traversal a
              finding gets, one boundary over. It follows citations out to the
              passages and the artifacts they were read from, and it does NOT
              follow external relations: the corpus is mostly `related_to`,
              and a walk that admitted it would light most of the outer band. */}
          {onEvidenceSolo && (
            <button
              type="button"
              onClick={() => onEvidenceSolo(!evidenceSolo)}
              data-shoot="intel-solo"
              aria-pressed={evidenceSolo}
              className="mt-3 w-full rounded-md border px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-white/[0.04]"
              style={{
                borderColor: evidenceSolo ? "var(--i-signal)" : "var(--i-border-strong)",
                color: evidenceSolo ? "var(--i-signal)" : "var(--i-text-soft)",
              }}
            >
              {evidenceSolo ? "− Stop tracing this claim" : "Trace what the producer read"}
            </button>
          )}
        </div>
      )}

      {/* THE STATEMENT, VERBATIM. Never summarised and never rewritten — the
          label above it is the same text trimmed to fit, and this is the one
          place the whole claim is readable. */}
      {isIntel && (
        <div className="mt-4 px-4">
          <div className="i-label mb-1.5" style={{ color: "var(--i-text-faint)" }}>
            The claim
          </div>
          <div
            className="rounded-md border p-2.5 text-[11px] leading-[1.6] text-[var(--i-text)]"
            style={{ borderColor: "var(--i-border)", background: "var(--i-recess)" }}
          >
            {String(attrs.statement)}
          </div>
        </div>
      )}

      {/* CONTENT — enough of a source or passage to understand it without
          leaving Audit, which is the whole point of a graph you explore. */}
      {attrs.excerpt != null && !isRequirement && (
        <div className="mt-4 px-4">
          <div className="i-label mb-1.5" style={{ color: "var(--i-text-faint)" }}>
            Passage
          </div>
          <div
            className="rounded-md border p-2.5 text-[11px] leading-[1.6] text-[var(--i-text)]"
            style={{ borderColor: "var(--i-border)", background: "var(--i-recess)" }}
          >
            “{String(attrs.excerpt).replace(/^["“”']+|["“”']+$/g, "")}”
          </div>
          {attrs.externalRef != null && (
            <div className="mt-1.5 text-[10px] text-[var(--i-text-faint)]">{String(attrs.externalRef)}</div>
          )}
        </div>
      )}

      {/* CONNECTIONS — the reference's own side-panel pattern, with the one
          thing it does not have: WHERE each relationship came from. */}
      <div className="mt-4 px-4 pb-6">
        <div className="i-label mb-2 flex items-baseline justify-between" style={{ color: "var(--i-text-faint)" }}>
          <span>Connections</span>
          <span className="i-readout text-[11px]">{connections.length}</span>
        </div>
        {connections.length === 0 ? (
          <p className="text-[11px] leading-[1.5]" style={{ color: "var(--i-text-faint)" }}>
            Nothing points at this and it points at nothing. It sits in its cluster because of what it is, not
            because of what it relates to.
          </p>
        ) : (
          <div className="space-y-1">
            {connections.map((c) => (
              <button
                key={c.edgeId}
                type="button"
                onClick={() => onSelect(c.otherId)}
                onDoubleClick={() => onFocusNode(c.otherId)}
                data-shoot={`connection-${c.rel}`}
                title={EDGE_RULES[c.rule]?.why ?? ""}
                className="flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-white/[0.035]"
                style={{ borderColor: "var(--i-border)", background: "var(--i-panel)" }}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[9px] uppercase tracking-[0.13em]" style={{ color: "var(--i-text-faint)" }}>
                      {c.outbound ? "" : "← "}
                      {c.intelRel ?? REL_LABEL[c.rel] ?? c.rel}
                    </span>
                    {/* ATTESTED · INFERRED · EXTERNAL, in words. The
                        difference between a relationship Signal's data
                        states, one Signal read into it, and one somebody
                        outside Signal asserted and Signal has not checked. */}
                    <span
                      className="rounded px-1 text-[8px] uppercase tracking-[0.12em]"
                      style={{ color: BASIS_COLOR[c.basis], border: `1px solid color-mix(in srgb, ${BASIS_COLOR[c.basis]} 40%, transparent)` }}
                    >
                      {c.basis}
                    </span>
                    {c.relClass != null && (
                      <span className="text-[8px] uppercase tracking-[0.12em]" style={{ color: "var(--i-text-faint)" }}>
                        {c.relClass}
                      </span>
                    )}
                    <span className="i-readout text-[10px]" style={{ color: "var(--i-text-soft)" }}>
                      {c.detail ?? ""}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[11.5px] text-[var(--i-text)]">{c.otherLabel}</span>
                  <span className="block text-[9.5px] text-[var(--i-text-faint)]">
                    {KIND_LABEL[c.otherKind as keyof typeof KIND_LABEL] ?? c.otherKind}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1" />
    </div>
  );
}

/** One colour per epistemic basis. External is amber rather than faint: it is
    not weak evidence, it is UNCHECKED evidence, and those read differently. */
const BASIS_COLOR: Record<EdgeBasis, string> = {
  attested: "var(--i-signal)",
  inferred: "var(--i-text-faint)",
  external: "var(--i-amber)",
};

/** A producer's own record, printed as it arrived. Values are stringified
    rather than interpreted — Signal does not model these, so rendering them
    as anything but text would be Signal claiming to understand them. */
function KeyValues({ title, values }: { title: string; values: Record<string, unknown> }) {
  return (
    <div className="mt-3">
      <div className="i-label mb-1" style={{ color: "var(--i-text-faint)" }}>
        {title}
      </div>
      {Object.entries(values).map(([k, v]) => (
        <Row key={k} label={k} value={typeof v === "string" ? v : JSON.stringify(v)} mono={typeof v !== "string"} />
      ))}
    </div>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded px-1.5 py-[3px] text-[8.5px] uppercase tracking-[0.14em]"
      style={{ color, border: `1px solid color-mix(in srgb, ${color} 42%, transparent)` }}
    >
      {children}
    </span>
  );
}

function Row({ label, value, tone, mono }: { label: string; value: string; tone?: string; mono?: boolean }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 border-b py-[7px] text-[11px] last:border-b-0"
      style={{ borderColor: "var(--i-border)" }}
    >
      <span className="shrink-0 text-[var(--i-text-faint)]">{label}</span>
      <span
        className={`truncate text-right ${mono ? "i-readout text-[10.5px]" : ""}`}
        style={{ color: tone ?? "var(--i-text)" }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
