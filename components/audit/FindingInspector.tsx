"use client";

// THE INSPECTOR. One panel, always present, always about whatever is
// selected — the same contract the Portfolio inspector keeps, so moving
// between instruments does not mean learning a new place to look.
//
// TWO STATES, and the resting one is not a KPI grid.
//
//   NO SELECTION -> AUDIT OVERVIEW. What this run found, and what deserves
//   the first click. Four counts stated as a sentence-like stack rather than
//   as four boxes, because they are one reading, not four metrics.
//
//   SELECTED -> the finding, disclosed in layers: what it is, what it says,
//   what stands behind it, and only then the deep material.
//
// WHAT IS DELIBERATELY ABSENT: a confidence percentage. The concept images
// show "92%" and "84%". The Finding model carries no confidence column and
// nothing in this app computes one, so the number would be invented — the
// exact class of unfalsifiable claim docs/CONTROL-ROOM-TRUTH-AUDIT.md spent
// a pass removing. In its place the inspector states the GROUNDING, which is
// a fact: what is cited, from which package, read when.

import { useState, type ReactNode } from "react";
import type { TruthMapModel, TruthFinding } from "@/lib/audit/truth";
import type { FindingProvenance, groundingLabel } from "@/lib/audit/provenance";
import { candidateRealityFor } from "@/lib/audit/actions";
import { findingColor, STATE_COLOR, TIER_LABEL } from "./tokens";
import { IconHolder, findingIcon, LANE_ICONS, ICON_PX } from "./icons";

type Provenance = FindingProvenance & { grounding: ReturnType<typeof groundingLabel> };

export default function FindingInspector({
  model,
  finding,
  provenance,
  onSelect,
  evidenceSolo,
  onEvidenceSolo,
  onOpenReview,
}: {
  model: TruthMapModel;
  finding: TruthFinding | null;
  provenance: Provenance | null;
  onSelect: (id: string) => void;
  evidenceSolo: boolean;
  /** Null when the graph holds no provenance route out of this finding.
      LAW 10: a Trace that lights only the node you already had reads as the
      instrument being broken, not as the finding being ungrounded. The panel
      says so in words instead of offering a control that cannot work. */
  onEvidenceSolo: (() => void) | null;
  onOpenReview?: () => void;
}) {
  if (!finding) return <AuditOverview model={model} onSelect={onSelect} />;
  return (
    <SelectedFinding
      model={model}
      finding={finding}
      provenance={provenance}
      evidenceSolo={evidenceSolo}
      onEvidenceSolo={onEvidenceSolo}
      onOpenReview={onOpenReview}
    />
  );
}

// ── RESTING: THE AUDIT OVERVIEW ────────────────────────────────────────

function AuditOverview({ model, onSelect }: { model: TruthMapModel; onSelect: (id: string) => void }) {
  const top = [...model.findings].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    return order[a.tier] - order[b.tier];
  })[0];

  const unsupplied = model.lanes.filter((l) => !l.supplied);

  return (
    <div className="flex h-full flex-col overflow-y-auto i-noscrollbar" data-shoot="inspector-overview">
      <div className="px-4 pt-4">
        <div className="i-label" style={{ color: "var(--i-text-faint)" }}>
          Audit overview
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="flex items-baseline gap-2">
          <span className="i-readout text-[30px] leading-none text-[var(--i-text)]">{model.totals.all}</span>
          <span className="text-[12px] text-[var(--i-text-soft)]">
            open finding{model.totals.all === 1 ? "" : "s"} against {model.scopeName}
          </span>
        </div>
        <div className="mt-3 space-y-1.5 text-[12px]">
          <CountLine
            n={model.totals.critical}
            color="var(--i-red)"
            label="critical — high severity and blocking"
          />
          <CountLine
            n={model.totals.needsHuman}
            color="var(--i-violet)"
            label="need a human judgement"
          />
          <CountLine
            n={model.totals.handled}
            color="var(--i-mint)"
            label="already handled — ticketed, resolved or dismissed"
          />
        </div>
      </div>

      {top && (
        <div className="mt-5 px-4">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            Start here
          </div>
          <button
            type="button"
            onClick={() => onSelect(top.id)}
            data-shoot="inspector-start-here"
            className="w-full rounded-lg border px-3 py-3 text-left transition-colors hover:bg-white/[0.03]"
            style={{ borderColor: "var(--i-border-strong)", background: "var(--i-panel)" }}
          >
            <div className="flex items-start gap-2.5">
              <IconHolder tone={findingColor(top)}>
                {(() => {
                  const Icon = findingIcon(top.type, top.blocking);
                  return <Icon size={ICON_PX} />;
                })()}
              </IconHolder>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[9px] uppercase tracking-[0.15em]"
                  style={{ color: findingColor(top) }}
                >
                  {top.kindLabel} · {TIER_LABEL[top.tier]}
                </span>
                <span className="mt-1 block text-[12px] leading-[1.45] text-[var(--i-text)]">{top.title}</span>
              </span>
            </div>
          </button>
        </div>
      )}

      {/* AN UNCONNECTED SOURCE IS PROJECT TRUTH, not an empty state to hide.
          "Nothing is supplying design" is exactly the kind of gap Audit
          exists to surface. */}
      {unsupplied.length > 0 && (
        <div className="mt-5 px-4 pb-5">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            Not supplying this Scope
          </div>
          <div className="space-y-1.5">
            {unsupplied.map((lane) => (
              <div key={lane.id} className="flex items-start gap-2 text-[11px]">
                <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--i-reality)" }} />
                <span className="text-[var(--i-text-soft)]">
                  <span className="text-[var(--i-text)]">{lane.label}</span> — {lane.checkpoints[0]?.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex-1" />
    </div>
  );
}

function CountLine({ n, color, label }: { n: number; color: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="i-readout w-6 text-right text-[14px]" style={{ color: n > 0 ? color : "var(--i-text-faint)" }}>
        {n}
      </span>
      <span style={{ color: n > 0 ? "var(--i-text-soft)" : "var(--i-text-faint)" }}>{label}</span>
    </div>
  );
}

// ── SELECTED ───────────────────────────────────────────────────────────

function SelectedFinding({
  model,
  finding,
  provenance,
  evidenceSolo,
  onEvidenceSolo,
  onOpenReview,
}: {
  model: TruthMapModel;
  finding: TruthFinding;
  provenance: Provenance | null;
  evidenceSolo: boolean;
  /** Null when the graph holds no provenance route out of this finding.
      LAW 10: a Trace that lights only the node you already had reads as the
      instrument being broken, not as the finding being ungrounded. The panel
      says so in words instead of offering a control that cannot work. */
  onEvidenceSolo: (() => void) | null;
  onOpenReview?: () => void;
}) {
  const color = findingColor(finding);
  const Icon = findingIcon(finding.type, finding.blocking);
  const lane = model.lanes.find((l) => l.id === finding.laneId);
  const candidate = candidateRealityFor(finding, model.scopeName);

  return (
    <div className="flex h-full flex-col overflow-y-auto i-noscrollbar" data-shoot="inspector-finding">
      <div className="px-4 pt-4">
        <div className="i-label" style={{ color: "var(--i-text-faint)" }}>
          Selected finding
        </div>
        <div className="mt-2.5 flex items-start gap-2.5">
          <IconHolder tone={color}>
            <Icon size={ICON_PX} />
          </IconHolder>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium leading-tight text-[var(--i-text)]">
              {finding.kindLabel}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Chip color={color}>{TIER_LABEL[finding.tier]}</Chip>
              {/* Stated in words, never colour alone. */}
              {finding.needsHuman && <Chip color="var(--i-violet)">Human judgement</Chip>}
              {finding.blocking && <Chip color="var(--i-red)">Blocking</Chip>}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-[1.55] text-[var(--i-text)]">{finding.title}</p>
      </div>

      {/* THE THREE FACTS A READER WANTS FIRST, each read off a real column
          and each labelled with what it is, not with a percentage. */}
      <div className="mt-4 px-4">
        {/* "Concerns", not "Reality": this names the part of the model the
            finding is about. Labelling it "Reality" read as though Reality
            itself were equal to the word "Dependencies". */}
        <Row label="Concerns" value={lane ? lane.label : "—"} tone={lane ? STATE_COLOR[lane.state] : undefined} />
        <Row
          label="Execution"
          value={
            finding.matchedIssues.length > 0 ? finding.matchedIssues.join(", ") : "No tracked work matched"
          }
          tone={finding.matchedIssues.length > 0 ? "var(--i-signal)" : "var(--i-reality)"}
        />
        <Row
          label="Owner"
          value={finding.owner ?? "Not recorded"}
          tone={finding.owner ? "var(--i-text)" : "var(--i-amber)"}
        />
        {finding.blocks && <Row label="Blocks" value={finding.blocks} tone="var(--i-red)" />}
        {/* GROUNDING, NOT CONFIDENCE. See the module header. */}
        {provenance && (
          <Row
            label="Grounding"
            value={provenance.grounding.label}
            tone={provenance.kind === "none" ? "var(--i-amber)" : "var(--i-signal)"}
          />
        )}
      </div>

      <div className="mt-4 px-4" data-shoot="inspector-why-it-matters">
        <div className="i-label mb-1.5" style={{ color: "var(--i-text-faint)" }}>
          Why it matters
        </div>
        <p className="text-[11px] leading-[1.6] text-[var(--i-text-soft)]">{whyItMatters(finding)}</p>
      </div>

      {/* CLAIM vs EVIDENCE — the audit's assertion beside the words it read. */}
      <div className="mt-4 px-4">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg" style={{ background: "var(--i-border)" }}>
          <div className="p-2.5" style={{ background: "var(--i-panel)" }}>
            <div className="i-label mb-1.5" style={{ color: "var(--i-text-faint)" }}>
              Claim
            </div>
            <div className="text-[11px] leading-[1.5] text-[var(--i-text-soft)]">{finding.rationale}</div>
          </div>
          <div className="p-2.5" style={{ background: "var(--i-panel)" }}>
            <div className="i-label mb-1.5" style={{ color: "var(--i-text-faint)" }}>
              Evidence
            </div>
            <div className="text-[11px] leading-[1.5] text-[var(--i-text-soft)]">
              {finding.quote ? quoted(finding.quote) : "No quote recorded."}
            </div>
          </div>
        </div>
      </div>

      {/* PROVENANCE — the route, at a glance, with the deep material folded. */}
      {provenance && (
        <div className="mt-4 px-4">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            Provenance
          </div>
          {provenance.kind === "none" ? (
            <div
              className="rounded-lg border px-3 py-2.5 text-[11px] leading-[1.5]"
              style={{ borderColor: "var(--i-amber)", background: "var(--i-amber-soft)", color: "var(--i-text-soft)" }}
            >
              {provenance.grounding.detail}
            </div>
          ) : (
            <>
              <div className="space-y-1">
                {provenance.snapshot && (
                  <ProvRow
                    laneId="hermes"
                    title={`${provenance.snapshot.producer} · ${provenance.snapshot.packageId}`}
                    sub={`accepted ${provenance.snapshot.acceptedAt.slice(0, 10)}`}
                  />
                )}
                {provenance.source && (
                  <ProvRow
                    laneId="evidence"
                    title={provenance.source.title}
                    sub={`${provenance.source.kind} · ${provenance.source.createdAt.slice(0, 10)}`}
                  />
                )}
                {provenance.matchedIssues.map((id) => (
                  <ProvRow key={id} laneId="linear" title={id} sub="matched against execution" />
                ))}
              </div>
              {!onEvidenceSolo && (
                <p
                  className="mt-2 text-[10.5px] leading-[1.55]"
                  style={{ color: "var(--i-text-faint)" }}
                  data-shoot="inspector-no-trace"
                >
                  No route to trace on the map. This finding is stated from the model rather than
                  from a passage the graph can walk back to a source.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-4 px-4 pb-6">
        <div className="mb-4" data-shoot="inspector-next-actions">
          <div className="i-label mb-2" style={{ color: "var(--i-text-faint)" }}>
            Next actions
          </div>
          <div className="grid grid-cols-2 gap-2">
            {onEvidenceSolo && (
              <button
                type="button"
                onClick={onEvidenceSolo}
                data-shoot="inspector-evidence-solo"
                aria-pressed={evidenceSolo}
                className="rounded-md border px-3 py-2 text-[11px] transition-colors hover:bg-white/[0.04]"
                style={{
                  borderColor: evidenceSolo ? "var(--i-signal)" : "var(--i-border-strong)",
                  background: evidenceSolo ? "var(--i-signal-soft)" : "transparent",
                  color: evidenceSolo ? "var(--i-signal)" : "var(--i-text-soft)",
                }}
              >
                {evidenceSolo ? "Stop trace" : "Trace provenance"}
              </button>
            )}
            {onOpenReview && (
              <button
                type="button"
                onClick={onOpenReview}
                data-shoot="open-full-review"
                className="rounded-md border px-3 py-2 text-[11px] font-medium transition-colors hover:bg-white/[0.04]"
                style={{
                  borderColor: "color-mix(in srgb, var(--i-violet) 65%, var(--i-border-strong))",
                  background: "var(--i-violet-soft)",
                  color: "var(--i-violet)",
                }}
              >
                Review finding →
              </button>
            )}
          </div>
        </div>

        <Disclosure label="Deep provenance">
          {provenance && provenance.passages.length > 0 ? (
            <div className="space-y-2.5">
              {provenance.passages.map((p) => (
                <div key={p.evidenceId} className="rounded-md border p-2.5" style={{ borderColor: "var(--i-border)" }}>
                  <div className="text-[11px] leading-[1.5] text-[var(--i-text)]">{quoted(p.excerpt)}</div>
                  <div className="mt-1.5 text-[10px] leading-[1.5] text-[var(--i-text-faint)]">
                    {p.sourceRef}
                    {p.sourceType ? ` · ${p.sourceType}` : ""}
                    {p.role ? ` · ${p.role}` : ""}
                    {/* observedAt is the PRODUCER's own reading time, not this
                        app's clock — the distinction the package contract
                        makes a point of, carried through to the surface. */}
                    {p.observedAt ? ` · read ${p.observedAt.slice(0, 10)}` : ""}
                    {p.externalRef ? ` · ${p.externalRef}` : ""}
                  </div>
                </div>
              ))}
              {provenance.unresolvedRefs.length > 0 && (
                <div className="text-[10px]" style={{ color: "var(--i-amber)" }}>
                  {provenance.unresolvedRefs.length} cited id(s) could not be resolved in the snapshot:{" "}
                  {provenance.unresolvedRefs.join(", ")}
                </div>
              )}
            </div>
          ) : provenance?.source?.locatedExcerpt ? (
            <div className="rounded-md border p-2.5" style={{ borderColor: "var(--i-border)" }}>
              <div className="text-[11px] leading-[1.6] text-[var(--i-text-soft)]">
                {provenance.source.locatedExcerpt}
              </div>
              <div className="mt-1.5 text-[10px] text-[var(--i-text-faint)]">
                located in “{provenance.source.title}”
              </div>
            </div>
          ) : (
            <p className="text-[11px] leading-[1.6]" style={{ color: "var(--i-text-faint)" }}>
              No package passages cite this finding. Deeper provenance would need a context package that does — see
              docs/CONTEXT-MODEL.md.
            </p>
          )}
        </Disclosure>

        <Disclosure label="Consequence if confirmed">
          <div className="space-y-2 text-[11px] leading-[1.6]">
            <div>
              <span className="i-label" style={{ color: "var(--i-text-faint)" }}>
                A · Current
              </span>
              <p className="mt-1 text-[var(--i-text-soft)]">{candidate.current}</p>
            </div>
            <div>
              <span className="i-label" style={{ color: "var(--i-violet)" }}>
                B · Candidate
              </span>
              <p className="mt-1 text-[var(--i-text-soft)]">{candidate.candidate}</p>
            </div>
            <p className="pt-1 text-[var(--i-text)]">{candidate.consequence}</p>
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

/** Wrap a quote in typographic quotes WITHOUT doubling them. Stored quotes
    arrive both ways — some sources include their own — and blindly adding a
    pair produced `""like this""`. */
function quoted(text: string): string {
  const t = text.trim().replace(/^["“”']+/, "").replace(/["“”']+$/, "");
  return `“${t}”`;
}

/** Read entirely off real columns — never a generated narrative. */
function whyItMatters(f: TruthFinding): string {
  if (f.type === "decision") {
    return f.blocks
      ? `Until this is settled, ${f.blocks} has no agreed direction. A decision that nobody owns tends to be discovered late, when the cost of either answer has already been paid.`
      : `An unresolved choice with no recorded owner stays unresolved by default. Recording it makes it something the project can schedule rather than something it discovers.`;
  }
  if (f.type === "missing_work") {
    return `Work that requirements imply and execution does not contain is invisible to every downstream number. The forecast already carries this as placeholder effort, which is a wider estimate than a real ticket would give it.`;
  }
  if (f.type === "contradiction") {
    return `Two sources disagree and neither is marked authoritative, so any reader picks whichever they saw first. That is how two teams end up building to different specifications.`;
  }
  return f.blocks
    ? `${f.blocks} is recorded as waiting on this. A risk with no resolution stored stays a live assumption in the plan.`
    : `A recorded risk with no resolution stays a live assumption in the plan.`;
}

function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="rounded px-1.5 py-[3px] text-[8.5px] uppercase tracking-[0.14em]"
      style={{ color, border: `1px solid color-mix(in srgb, ${color} 42%, transparent)` }}
    >
      {children}
    </span>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 border-b py-[7px] text-[11px] last:border-b-0"
      style={{ borderColor: "var(--i-border)" }}
    >
      <span className="shrink-0 text-[var(--i-text-faint)]">{label}</span>
      <span className="truncate text-right" style={{ color: tone ?? "var(--i-text)" }} title={value}>
        {value}
      </span>
    </div>
  );
}

function ProvRow({ laneId, title, sub }: { laneId: string; title: string; sub: string }) {
  const Icon = LANE_ICONS[laneId] ?? LANE_ICONS.evidence;
  return (
    <div
      className="flex items-center gap-2.5 rounded-md border px-2.5 py-2"
      style={{ borderColor: "var(--i-border)", background: "var(--i-panel)" }}
    >
      <IconHolder tone="var(--i-text-soft)" size={22} filled={false}>
        <Icon size={13} />
      </IconHolder>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-[var(--i-text)]">{title}</span>
        <span className="block truncate text-[10px] text-[var(--i-text-faint)]">{sub}</span>
      </span>
    </div>
  );
}

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t" style={{ borderColor: "var(--i-border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-2.5 text-left"
      >
        <span className="i-label" style={{ color: open ? "var(--i-text)" : "var(--i-text-faint)" }}>
          {label}
        </span>
        <span className="text-[13px] leading-none" style={{ color: "var(--i-text-faint)" }}>
          {open ? "−" : "+"}
        </span>
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}
