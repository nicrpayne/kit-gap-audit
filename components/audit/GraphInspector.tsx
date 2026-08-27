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
      };
    })
    .sort((a, b) => (a.basis === b.basis ? a.rel.localeCompare(b.rel) : a.basis === "attested" ? -1 : 1));
}

export default function GraphInspector({
  graph,
  nodeId,
  onSelect,
  onFocusNode,
}: {
  graph: AuditGraph;
  nodeId: string;
  onSelect: (id: string) => void;
  onFocusNode: (id: string) => void;
}) {
  const attrs = graph.getNodeAttributes(nodeId) as AuditNodeAttributes;
  const color = nodeColor(attrs);
  const connections = connectionsOf(graph, nodeId);

  return (
    <div className="flex h-full flex-col overflow-y-auto i-noscrollbar" data-shoot="graph-inspector">
      <div className="px-4 pt-4">
        <div className="i-label" style={{ color: "var(--i-text-faint)" }}>
          {KIND_LABEL[attrs.kind] ?? attrs.kind}
        </div>
        <h2 className="mt-2 text-[15px] font-medium leading-snug text-[var(--i-text)]">{String(attrs.label)}</h2>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {attrs.state != null && <Chip color={color}>{String(attrs.state)}</Chip>}
          {attrs.status != null && <Chip color="var(--i-text-soft)">{String(attrs.status)}</Chip>}
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

      {/* CONTENT — enough of a source or passage to understand it without
          leaving Audit, which is the whole point of a graph you explore. */}
      {attrs.excerpt != null && (
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
                      {REL_LABEL[c.rel] ?? c.rel}
                    </span>
                    {/* ATTESTED vs INFERRED, in words. The distinction is the
                        difference between a relationship the data states and
                        one Signal read into it. */}
                    <span
                      className="rounded px-1 text-[8px] uppercase tracking-[0.12em]"
                      style={{
                        color: c.basis === "attested" ? "var(--i-signal)" : "var(--i-text-faint)",
                        border: `1px solid color-mix(in srgb, ${
                          c.basis === "attested" ? "var(--i-signal)" : "var(--i-text-faint)"
                        } 40%, transparent)`,
                      }}
                    >
                      {c.basis}
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
