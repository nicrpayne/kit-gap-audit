"use client";

// THE AGGREGATE INSPECTOR — what a shell says when you click it.
//
// -- WHY THIS PANEL EXISTS ---------------------------------------------
//
// A constellation shell is not a node. There is no row behind it, no
// accession number, no truth status, and Signal will never store one. So the
// node inspector cannot describe it, and must not try: half of that panel's
// vocabulary — state, provenance, "why does Signal believe this" — is a
// category error applied to a group.
//
// What a group HAS is: a canonical count, a composition, an account of what
// its members assert, and a list of real ids. That is the whole panel. Every
// number here is derived from members at read time, so it cannot drift from
// the picture, and every row is a real node you can click through to.
//
// -- THE LAW IT KEEPS --------------------------------------------------
//
// AGGREGATE BUBBLE != FAKE NODE. It is a projection of real members. So:
//
//   * The count printed is `members.length`. Not an estimate, not a
//     rendered-mark count, not a sampled figure. The same array the renderer
//     packs is the array this counts.
//   * A group asserts NO relationships of its own. So there is no
//     connections list here — there is an account of what its MEMBERS
//     assert, which is a different sentence and the only true one. It never
//     reads "this group relates to that group", because nobody in the corpus
//     said that.
//   * EXPANDING IS EXPLICIT. Selecting a group frames the region; it does not
//     resolve it. Resolution is a button, so that the reader is the one who
//     decides to go from "126 external objects, five kinds" to 126 marks
//     wearing names.

import { useMemo } from "react";
import type { AuditGraph } from "@/lib/audit/graph";
import type { SeatedAggregate } from "@/lib/audit/graphLayout";
import { typeLabel } from "@/lib/audit/constellations";
import { edgeFocusClass, type FocusClass } from "@/lib/audit/focus";
import { fieldLabel, intelColor, nodeColor, KIND_LABEL, REL_LABEL } from "./graphTokens";

/** How many members get a row before the list stops being a list. */
const SHOWN = 10;

interface Bucket {
  key: string;
  label: string;
  color: string;
  count: number;
}

/**
 * WHAT THIS GROUP IS MADE OF, by the facet that actually discriminates.
 *
 * §9: functional colour must survive aggregation, and a shell tinted with one
 * hue over mixed contents is a lie about what is inside. So the composition is
 * computed rather than assumed — and the facet is chosen by which one splits
 * this population, not by a fixed preference:
 *
 *   producer type   for external objects, where the type IS the meaning
 *   node kind       for anything else, where it is the only shared vocabulary
 *
 * A single bucket is not hidden. "All 24 are commitments" is the useful
 * statement in that case: it says the shell's colour is true.
 */
function composition(graph: AuditGraph, members: string[]): Bucket[] {
  const byType = new Map<string, number>();
  const byKind = new Map<string, number>();
  let typed = 0;
  for (const id of members) {
    if (!graph.hasNode(id)) continue;
    const a = graph.getNodeAttributes(id);
    const t = String(a.intelligenceType ?? "").trim();
    if (t) {
      typed++;
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    const k = String(a.kind);
    byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  const useType = typed === members.length && byType.size > 0;
  const src = useType ? byType : byKind;
  return [...src]
    .map(([key, count]) => ({
      key,
      count,
      label: useType ? typeLabel(key) : KIND_LABEL[key as keyof typeof KIND_LABEL] ?? key,
      color: useType ? intelColor(key) : nodeColor({ kind: key }),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The colours the field uses for the four edge classes, so a row here and a
    strand out there are visibly the same fact. */
const CLASS_COLOR: Record<FocusClass, string> = {
  semantic: "var(--i-signal)",
  temporal: "var(--i-text)",
  provenance: "var(--i-source)",
  contextual: "var(--i-text-faint)",
};

interface ReachRow {
  key: string;
  rel: string;
  cls: FocusClass;
  count: number;
  /** Distinct nodes at the other end, which is not the same number. */
  targets: number;
}

/**
 * WHAT THIS GROUP REACHES, AND BY WHICH VERB.
 *
 * §7: aggregation must preserve connection meaning, and must not imply that
 * one relationship exists between two aggregates. So this never says "this
 * group is connected to that group". It says what its MEMBERS assert, one row
 * per verb, with two numbers that are deliberately different:
 *
 *   count    how many real relationships carry that verb
 *   targets  how many distinct things are at the other end
 *
 * A bundle drawn on the field is exactly this, counted. Twelve `related_to`
 * edges reaching four objects is twelve edges and four objects — never "a
 * connection", and never a thicker line pretending to be one.
 *
 * Membership is excluded, as everywhere else: belonging is position.
 */
function reach(graph: AuditGraph, members: string[], hub: string | null): ReachRow[] {
  const inside = new Set(members);
  if (hub) inside.add(hub);
  const rows = new Map<string, { rel: string; cls: FocusClass; count: number; targets: Set<string> }>();
  const seen = new Set<string>();
  for (const id of members) {
    if (!graph.hasNode(id)) continue;
    for (const e of graph.edges(id)) {
      if (seen.has(e)) continue;
      seen.add(e);
      const a = graph.getEdgeAttributes(e);
      const cls = edgeFocusClass(a);
      if (cls === null) continue;
      const other = graph.source(e) === id ? graph.target(e) : graph.source(e);
      // AN EDGE INSIDE THE GROUP IS NOT REACH. Two passages of one transcript
      // citing each other says nothing about where this evidence goes.
      if (inside.has(other)) continue;
      const rel = typeof a.intelRel === "string" ? a.intelRel : a.rel;
      const key = `${cls}:${rel}`;
      const row = rows.get(key) ?? { rel, cls, count: 0, targets: new Set<string>() };
      row.count++;
      row.targets.add(other);
      rows.set(key, row);
    }
  }
  return [...rows]
    .map(([key, r]) => ({ key, rel: r.rel, cls: r.cls, count: r.count, targets: r.targets.size }))
    .sort((a, b) => b.count - a.count || a.rel.localeCompare(b.rel));
}

export default function AggregateInspector({
  graph,
  aggregate,
  expandedNodes,
  onSelect,
  onExpand,
}: {
  graph: AuditGraph;
  aggregate: SeatedAggregate;
  /** Cluster ids AND source-artifact node ids the reader has opened. */
  expandedNodes: Set<string>;
  onSelect: (id: string) => void;
  /** Resolve this group into its members. Explicit, never implied by
      selection. */
  onExpand: () => void;
}) {
  const buckets = useMemo(() => composition(graph, aggregate.members), [graph, aggregate.members]);
  const rows = useMemo(
    () => reach(graph, aggregate.members, aggregate.hub),
    [graph, aggregate.members, aggregate.hub]
  );
  const reachTotal = rows.reduce((n, r) => n + r.count, 0);

  // WHAT "OPEN" MEANS FOR THIS GROUP. A source group is opened by its own hub
  // — this transcript's passages and no others, on the same key the node
  // inspector's expander uses, so the two can never disagree. A type group
  // has no such node and is opened by its own id. Same set, same toggle.
  const openKey = aggregate.hub ?? aggregate.id;
  const open = expandedNodes.has(openKey);

  const hubAttrs = aggregate.hub && graph.hasNode(aggregate.hub) ? graph.getNodeAttributes(aggregate.hub) : null;

  const shown = useMemo(
    () =>
      aggregate.members
        .filter((id) => graph.hasNode(id))
        .map((id) => ({ id, label: fieldLabel(graph.getNodeAttributes(id)) }))
        .sort((a, b) => a.label.localeCompare(b.label))
        .slice(0, SHOWN),
    [graph, aggregate.members]
  );

  const tint = aggregate.homogeneous ? intelColor(aggregate.homogeneous) : "var(--i-text-soft)";

  return (
    <div className="flex h-full flex-col overflow-y-auto i-noscrollbar" data-shoot="aggregate-inspector">
      <div className="px-4 pt-4">
        <div className="i-label" style={{ color: "var(--i-text-faint)" }}>
          {aggregate.kind === "source" ? "Group · one source" : "Group · one type"}
        </div>
        <h2 className="mt-2 text-[15px] font-medium leading-snug text-[var(--i-text)]">
          {aggregate.kind === "source" && hubAttrs ? fieldLabel(hubAttrs) : aggregate.label}
        </h2>

        {/* THE COUNT IS THE HEADLINE, because the count is what a shell is
            for: it is the one thing the picture can say about a hundred and
            twenty-six marks without drawing a hundred and twenty-six names. */}
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="i-readout text-[30px] leading-none" style={{ color: tint }} data-shoot="aggregate-panel-count">
            {aggregate.count}
          </span>
          <span className="text-[12px] leading-[1.45] text-[var(--i-text-soft)]">
            {aggregate.kind === "source"
              ? `passages extracted from this source, all of them on the field around it`
              : `external objects of this type, all of them on the field inside this shell`}
          </span>
        </div>

        {/* NOT A NODE, IN WORDS. The reader has just clicked a circle with a
            number in it; the panel's first job is to say what kind of thing
            they are now looking at, before they go looking for a state or an
            id that does not exist. */}
        <p className="mt-3 text-[11px] leading-[1.55]" style={{ color: "var(--i-text-faint)" }}>
          A group, not a thing. Signal stores no record for it — it is these {aggregate.count} nodes, counted, at
          their own seats. It has no state of its own and asserts no relationship of its own.
        </p>
      </div>

      {/* ── WHAT IT IS MADE OF ──────────────────────────────────────────

          ONE LINE WHEN THERE IS ONE ANSWER. Both kinds of group are
          homogeneous by construction here — a type group shares a producer
          type, a source group is all passages — so a bar chart of one bar is
          a chart pretending there was a question. It still gets SAID, because
          "all 24 of these are commitments" is what makes the shell's colour
          trustworthy. It only gets DRAWN when something is actually mixed. */}
      <div className="mt-3 px-4" data-shoot="aggregate-composition" data-buckets={buckets.length}>
        {buckets.length === 1 ? (
          <p className="flex items-center gap-2 text-[11px]" style={{ color: "var(--i-text-soft)" }}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: buckets[0].color }} aria-hidden />
            All {buckets[0].count} are {buckets[0].label.toLowerCase()}s — one kind, so the colour on the field is
            true of every mark in it.
          </p>
        ) : (
          <>
            <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
              Composition
            </div>
            <div className="space-y-1">
              {buckets.map((b) => (
                <div key={b.key} className="flex items-center gap-2 text-[11px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--i-text-soft)" }}>
                    {b.label}
                  </span>
                  {/* A BAR, NOT A PIE. §9 asks for proportion without a
                      rainbow chart: one row per real bucket, width
                      proportional to share of this group, and the colour is
                      the same functional colour the marks themselves wear. */}
                  <span
                    className="h-[3px] rounded-full"
                    style={{
                      width: `${Math.max(6, Math.round((b.count / Math.max(1, aggregate.count)) * 84))}px`,
                      background: b.color,
                      opacity: 0.55,
                    }}
                    aria-hidden
                  />
                  <span className="i-readout w-7 shrink-0 text-right text-[11px] text-[var(--i-text)]">{b.count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── WHAT IT REACHES ─────────────────────────────────────────────

          THE ONE THING A SHELL CANNOT SAY BY ITSELF. On the field this group
          is a circle with a number in it, and the bundles leaving it are
          strokes whose thickness is a count. This is that count in words: the
          verb, how many relationships carry it, and how many distinct things
          are at the other end.

          THE TWO NUMBERS ARE NOT THE SAME NUMBER, and printing both is the
          whole point of §7. "12 → 4 things" is twelve assertions about four
          objects. A single fat line between two shells would have said "these
          two groups are connected", which is a relationship nobody in the
          corpus asserts. */}
      <div className="mt-4 px-4">
        <div className="i-label mb-2 flex items-baseline justify-between" style={{ color: "var(--i-text-faint)" }}>
          <span>What its members assert</span>
          <span className="i-readout text-[11px]" data-shoot="aggregate-reach-total">
            {reachTotal}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-[11px] leading-[1.5]" style={{ color: "var(--i-text-faint)" }}>
            Nothing in this group points outside it. These {aggregate.count} things are here because of what they
            are, not because of what they relate to.
          </p>
        ) : (
          <div className="space-y-1" data-shoot="aggregate-reach">
            {rows.map((r) => (
              <div key={r.key} className="flex items-baseline gap-2 text-[11px]">
                <span
                  className="h-[3px] w-3 shrink-0 rounded-full"
                  style={{ background: CLASS_COLOR[r.cls] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--i-text-soft)" }}>
                  {REL_LABEL[r.rel] ?? r.rel}
                </span>
                <span className="i-readout shrink-0 text-[11px] text-[var(--i-text)]">{r.count}</span>
                <span className="shrink-0 text-[10px]" style={{ color: "var(--i-text-faint)" }}>
                  → {r.targets} {r.targets === 1 ? "thing" : "things"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── THE SOURCE IT HANGS OFF ───────────────────────────────────── */}
      {aggregate.hub && hubAttrs && (
        <div className="mt-4 px-4">
          <div className="i-label mb-1.5" style={{ color: "var(--i-text-faint)" }}>
            Extracted from
          </div>
          <button
            type="button"
            onClick={() => onSelect(aggregate.hub!)}
            data-shoot="aggregate-hub"
            data-target={aggregate.hub}
            className="flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-white/[0.035]"
            style={{ borderColor: "var(--i-border)", background: "var(--i-panel)" }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] text-[var(--i-text)]">{fieldLabel(hubAttrs)}</span>
              <span className="block text-[9.5px] text-[var(--i-text-faint)]">
                {KIND_LABEL[hubAttrs.kind] ?? hubAttrs.kind}
              </span>
            </span>
          </button>
        </div>
      )}

      {/* ── RESOLUTION IS A DECISION ──────────────────────────────────── */}
      <div className="mt-4 px-4">
        <button
          type="button"
          onClick={onExpand}
          data-shoot="aggregate-expand"
          data-open={open ? "true" : "false"}
          className="w-full rounded-md border px-3 py-2 text-[11px] transition-colors hover:bg-white/[0.04]"
          style={{ borderColor: "var(--i-border)", color: "var(--i-text)", background: "var(--i-panel)" }}
        >
          {open
            ? aggregate.kind === "source"
              ? "Close this source"
              : "Collapse this region"
            : aggregate.kind === "source"
              ? `Open all ${aggregate.count} passages`
              : `Open this region`}
        </button>
        <p className="mt-1.5 text-[10.5px] leading-[1.5]" style={{ color: "var(--i-text-faint)" }}>
          {open
            ? "These are showing their identity. Closing returns them to marks at the same seats — nothing moves."
            : "They are already on the field as marks. Opening gives them their names; it does not move them."}
        </p>
      </div>

      {/* ── THE MEMBERS THEMSELVES ────────────────────────────────────── */}
      <div className="mt-4 px-4 pb-6">
        <div className="i-label mb-2 flex items-baseline justify-between" style={{ color: "var(--i-text-faint)" }}>
          <span>Members</span>
          <span className="i-readout text-[11px]">{aggregate.count}</span>
        </div>
        <div className="space-y-1">
          {shown.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              data-shoot="aggregate-member"
              data-target={m.id}
              className="flex w-full items-start rounded-md border px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.035]"
              style={{ borderColor: "var(--i-border)", background: "var(--i-panel)" }}
            >
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text)]">{m.label}</span>
            </button>
          ))}
        </div>
        {aggregate.count > shown.length && (
          <p className="mt-2 text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
            and {aggregate.count - shown.length} more — all of them drawn, at their own seats.
          </p>
        )}
      </div>
    </div>
  );
}
