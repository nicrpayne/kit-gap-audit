"use client";

// FEATURE DETAIL — the plugin's advanced page, and the only place tickets
// appear in Scope at all.
//
// Five modes, one per honest question, using the suite's existing ToolWindow
// chrome so summoning depth feels identical in every instrument:
//
//   OVERVIEW  what this capability is, and how much of the release it is
//   WORK      the Linear issues underneath it — the implementation evidence
//   EVIDENCE  why the machine believes it exists at all
//   ESTIMATE  what the numbers rest on, and the one Scenario lever Scope owns
//   HISTORY   what has actually happened to it, from stored records only
//
// The rule that shaped every mode: a mode shows what the model holds, or it
// says plainly that the model holds nothing. There is no mode here that is
// filled out with plausible-looking material.

import { useMemo, useState } from "react";
import Link from "@/components/instrument/SignalLink";
import ToolWindow, { RailButton, Row } from "@/components/instrument/ToolWindow";
import { DistributionDisplay, accentFor, materialOf } from "@/components/instrument/CapabilityTile";
import { Prototype } from "@/components/instrument/Panel";
import { expectedDays, uncertaintyLabel, type Feature, type ThreePoint, type DraftFeature } from "@/lib/scope/features";
import type { ScopeWorkItem } from "@/lib/instrument/useProject";
import type { ShapeCapability } from "@/lib/scope/productShape";
import type { CapabilityKnowledgeEstimate } from "@/lib/scope/knowledgeEstimates";

type Mode = "overview" | "work" | "evidence" | "estimate" | "history";

const ESTIMATE_SOURCE: Record<string, string> = {
  ai: "Estimated by the model from the ticket's own content",
  points: "The team's Linear points, read as days with a fixed spread",
  issue_placeholder: "No estimate on the ticket — a deliberately wide 1–7 day guess",
  hint: "Parsed from a range someone actually stated",
  finding_placeholder: "Nobody sized this — a deliberately wide 2–12 day guess",
};

export default function FeatureDetail({
  feature,
  onClose,
  scopeName,
  capacity,
  releaseLoadDays,
  realityRange,
  maxSpread,
  onToggle,
  onAccept,
  onSetEstimate,
  onClearEstimate,
  onStageKnowledgeEstimate,
  onClearKnowledgeEstimate,
  onEditReality,
  onUnlinkReality,
  onCommitDraft,
}: {
  feature: Feature | null;
  onClose: () => void;
  scopeName: string;
  capacity: number;
  releaseLoadDays: number;
  /** Where Reality's own estimate sits, so a Scenario re-estimate is drawn
      against a real before rather than an implied one. */
  realityRange: ThreePoint | null;
  maxSpread: number;
  onToggle: (out: boolean) => void;
  onAccept: (id: string) => void;
  onSetEstimate: (id: string, range: ThreePoint) => void;
  onClearEstimate: (id: string) => void;
  onStageKnowledgeEstimate: (capabilityId: string, estimate: CapabilityKnowledgeEstimate) => void;
  onClearKnowledgeEstimate: (capabilityId: string) => void;
  onEditReality: (capability: ShapeCapability) => void;
  onUnlinkReality: (capability: ShapeCapability, linkId: string, itemLabel: string) => void;
  onCommitDraft: (feature: Feature) => void;
}) {
  const [mode, setMode] = useState<Mode>("overview");
  if (!feature) return null;
  const f = feature;

  return (
    <ToolWindow
      open
      onClose={onClose}
      title={`${scopeName} · feature detail`}
      subtitle={f.name}
      width={640}
      docked
      dataShoot="feature-detail"
      hero={<ModuleHead feature={f} capacity={capacity} releaseLoadDays={releaseLoadDays} realityRange={realityRange} maxSpread={maxSpread} />}
      footer={
        <div className="px-5 py-3 space-y-1.5">
          {f.canonicalCapability && (
            <button
              onClick={() => onEditReality(f.canonicalCapability!)}
              data-shoot="edit-capability-reality"
              className="w-full rounded-md px-3 py-2 text-[11.5px] transition-colors"
              style={{ border: "1px solid var(--i-signal)", color: "var(--i-signal)" }}
            >
              Edit accepted Reality
            </button>
          )}
          {f.source === "manual" && (
            <button onClick={() => onCommitDraft(f)} data-shoot="commit-draft-reality" className="w-full rounded-md px-3 py-2 text-[11.5px]" style={{ border: "1px solid var(--i-signal)", color: "var(--i-signal)" }}>Commit this draft to Reality</button>
          )}
          <button
            onClick={() => onToggle(!f.bypassed)}
            data-shoot="detail-toggle"
            className="w-full rounded-md px-3 py-2 text-[11.5px] transition-colors"
            style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
          >
            {f.bypassed ? "Put back in this release" : "Take out of this release"}
          </button>
          <Link
            href="/forecast"
            data-shoot="detail-forecast"
            className="block w-full rounded-md px-3 py-2 text-center text-[11px] transition-colors"
            style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
          >
            See consequence in Forecast →
          </Link>
        </div>
      }
      rail={
        <>
          {(["overview", "work", "evidence", "estimate", "history"] as Mode[]).map((mo) => (
            <RailButton
              key={mo}
              label={mo}
              active={mode === mo}
              onClick={() => setMode(mo)}
              dataShoot={`mode-${mo}`}
              compact
            />
          ))}
        </>
      }
    >
      {mode === "overview" && (
        <Overview feature={f} />
      )}
      {mode === "work" && <Work feature={f} capacity={capacity} onUnlinkReality={onUnlinkReality} />}
      {mode === "evidence" && <Evidence feature={f} onAccept={onAccept} onStageKnowledgeEstimate={onStageKnowledgeEstimate} onClearKnowledgeEstimate={onClearKnowledgeEstimate} />}
      {mode === "estimate" && (
        <Estimate feature={f} capacity={capacity} onSetEstimate={onSetEstimate} onClearEstimate={onClearEstimate} onStageKnowledgeEstimate={onStageKnowledgeEstimate} onClearKnowledgeEstimate={onClearKnowledgeEstimate} />
      )}
      {mode === "history" && <History feature={f} />}
    </ToolWindow>
  );
}


// ── THE MODULE HEAD ──────────────────────────────────────────────────────
//
// What is fixed under the panel's header, above every mode: this is the
// module you opened, and this is its display — larger, and reading from the
// same geometry the deck draws, so the panel is unmistakably an editor for
// the object rather than a page about it.
function ModuleHead({
  feature: f,
  capacity,
  releaseLoadDays,
  realityRange,
  maxSpread,
}: {
  feature: Feature;
  capacity: number;
  releaseLoadDays: number;
  realityRange: ThreePoint | null;
  maxSpread: number;
}) {
  const material = materialOf(f);
  const accent = accentFor(material);
  const hasEstimate = f.items.length > 0 || f.activeKnowledgeEstimate !== null;
  const hasRange = hasEstimate && f.range.high - f.range.low > 0;
  const retuned = !!realityRange && hasRange && Math.abs(realityRange.likely - f.range.likely) > 0.05;
  const source =
    f.source === "canonical"
      ? "Scope · accepted capability"
      : f.source === "linear"
      ? "Linear"
      : f.source === "hermes"
        ? f.accepted
          ? "Hermes · accepted here"
          : "Hermes · candidate"
        : f.source === "manual"
          ? "Declared here · draft"
          : "Unmapped work";

  return (
    <div className="px-5 pt-3 pb-3.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
      <div className="flex items-center gap-2">
        <span
          className="rounded-sm px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: accent, border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)` }}
        >
          {source}
        </span>
        {f.epic && <span className="min-w-0 truncate text-[9.5px] text-[var(--i-text-faint)]">in {f.epic}</span>}
        <span className="flex-1" />
        {f.bypassed && (
          <span className="text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--i-violet)" }}>
            out of this release
          </span>
        )}
      </div>

      {hasEstimate ? <div className="mt-2.5 h-[96px]">
        <DistributionDisplay range={f.range} hasItems maxSpread={maxSpread} accent={accent} ghost={realityRange} dim={f.bypassed} scale={2} />
      </div> : <div className="mt-3 rounded-md px-3 py-4 text-center" style={{ border: "1px solid var(--i-border)", background: "var(--i-recess)" }}><div className="text-[10px] font-medium text-[var(--i-amber)]">Mapping needed</div><div className="mt-1 text-[8.5px] text-[var(--i-text-faint)]">No chart or effort value is fabricated for an empty capability.</div></div>}
      {hasRange ? (
        <div className="mt-1 flex items-baseline justify-between text-[8.5px] tabular-nums text-[var(--i-text-faint)]">
          <span>{f.range.low.toFixed(1)}d</span>
          <span style={{ color: retuned ? "var(--i-violet)" : undefined }}>
            {retuned ? `re-estimated · Reality ${realityRange!.likely.toFixed(1)}d likely` : "days of effort"}
          </span>
          <span>{f.range.high.toFixed(1)}d</span>
        </div>
      ) : (
        <div className="mt-1 text-center text-[8.5px] text-[var(--i-text-faint)]">no work mapped, so no range</div>
      )}

      <div className="mt-3 flex items-start gap-5">
        <HeadStat k="Load" v={hasEstimate ? `${f.loadDays.toFixed(1)}d` : "—"} n={f.activeKnowledgeEstimate ? `provisional · ÷ ${capacity.toFixed(2)} FTE` : hasEstimate ? `÷ ${capacity.toFixed(2)} FTE` : "no mapped work"} />
        <HeadStat
          k="Share"
          v={releaseLoadDays > 0 && !f.bypassed ? `${((f.loadDays / releaseLoadDays) * 100).toFixed(0)}%` : "—"}
          n={f.bypassed ? "not carried" : `of ${releaseLoadDays.toFixed(1)}d`}
        />
        <HeadStat
          k="Uncertainty"
          v={uncertaintyLabel(f.uncertainty)}
          n={f.activeKnowledgeEstimate ? "meeting evidence" : f.placeholderCount > 0 ? `${f.placeholderCount} unestimated` : "all sized"}
        />
      </div>
    </div>
  );
}

function HeadStat({ k, v, n }: { k: string; v: string; n: string }) {
  return (
    <div className="min-w-0">
      <div className="i-label" style={{ fontSize: 8 }}>
        {k}
      </div>
      <div className="i-readout mt-1 text-[15px] leading-none text-[var(--i-text)]">{v}</div>
      <div className="mt-1 text-[8.5px] leading-none text-[var(--i-text-faint)] truncate">{n}</div>
    </div>
  );
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────

function Overview({ feature: f }: { feature: Feature }) {
  const mapped = f.items.length + f.done.length;
  return (
    <div className="px-5 py-4">
      <p className="text-[11.5px] text-[var(--i-text-soft)] leading-relaxed">
        {f.source === "canonical" && (
          <>
            An accepted Capability owned by Scope. {mapped > 0
              ? `${mapped} execution ${mapped === 1 ? "item is" : "items are"} explicitly linked underneath it.`
              : "No execution work is mapped yet; no distribution is fabricated."}
          </>
        )}
        {f.source === "linear" && (
          <>
            A capability in Linear. {mapped} issue{mapped === 1 ? "" : "s"} hang from it.
          </>
        )}
        {f.source === "hermes" && (
          <>
            Hermes found this in a source; nothing in Linear represents it.{" "}
            <strong className="text-[var(--i-violet)]">A candidate, not accepted Reality</strong> — though the work it
            implies is already counted.
          </>
        )}
        {f.source === "manual" && (
          <>
            Declared in this Scenario. <strong className="text-[var(--i-violet)]">Not saved</strong> — use the
            Reality action in Add Capability when it should be accepted across devices.
          </>
        )}
        {f.source === "unmapped" && (
          <>
            Not a capability. Work items with no parent in Linear, so nothing says which capability they serve — a real
            coverage gap.
          </>
        )}
      </p>

      <div className="mt-3">
        <Row
          k="In this release"
          v={f.bypassed ? "No — out in this Scenario" : "Yes"}
          tone={f.bypassed ? "var(--i-violet)" : "var(--i-mint)"}
          changed={f.bypassed}
        />
        <Row
          k="Coverage"
          v={mapped === 0 ? "no work mapped" : `${f.done.length}/${mapped} done`}
          note={f.epic ? `in ${f.epic}` : "no Linear project"}
        />
        <Row
          k="Effort"
          v={f.items.length > 0 || f.activeKnowledgeEstimate ? `${expectedDays(f.range).toFixed(1)}d` : "—"}
          note={f.activeKnowledgeEstimate
            ? `provisional meeting range · ${f.range.low.toFixed(0)}–${f.range.high.toFixed(0)} developer-days`
            : f.items.length > 0
              ? `expected, before capacity · ${f.range.low.toFixed(0)}–${f.range.high.toFixed(0)}d range`
              : "no mapped work or staged estimate"}
        />
      </div>

      {/* Release assignment: designed, not modelled. Fenced off and inert. */}
      <div className="mt-4 rounded px-3 py-3" style={{ background: "var(--i-recess)" }}>
        <div className="flex items-center gap-2">
          <Prototype note="The model has no release entity. Nothing here changes the forecast." />
          <span className="i-label">Which release</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {["Beta", "Production", "Later"].map((r, i) => (
            <span
              key={r}
              className="rounded px-2.5 py-1 text-[10.5px]"
              style={{
                border: `1px solid ${i === 0 ? "var(--i-border-strong)" : "var(--i-border)"}`,
                color: i === 0 ? "var(--i-text-soft)" : "var(--i-text-faint)",
                background: i === 0 ? "var(--i-panel-raised)" : "transparent",
              }}
            >
              {r}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-[var(--i-text-faint)] leading-snug">
          &ldquo;Move this to Production&rdquo; is a Scope operation and it is coming — but a WorkItem cannot belong to
          a release in the model yet, so these are inert. Taking a capability out of the Scenario is the honest version
          of the question today.
        </p>
      </div>

      {/* The control itself lives in the panel's pinned footer, where it stays
          reachable from every mode. This is what it will do. */}
      <p className="mt-4 text-[10px] text-[var(--i-text-faint)] leading-snug">
        {f.bypassed
          ? "Out in this Scenario only. Reality still ships it, and discarding the Scenario brings it back."
          : `Taking it out removes its ${f.items.length} open item${
              f.items.length === 1 ? "" : "s"
            } from the simulation in this hypothetical. Nothing is deleted.`}
      </p>
    </div>
  );
}

// ── WORK ─────────────────────────────────────────────────────────────────

function Work({ feature: f, capacity, onUnlinkReality }: { feature: Feature; capacity: number; onUnlinkReality: (capability: ShapeCapability, linkId: string, itemLabel: string) => void }) {
  if (f.items.length === 0 && f.done.length === 0)
    return (
      <Empty
        title="No work mapped yet"
        body="This capability exists as a declaration. Nothing in Linear hangs from it, so it carries no load and the forecast is unaffected by it."
      />
    );

  return (
    <div className="px-5 py-4">
      <div className="i-label mb-2">
        Open · {f.items.length} item{f.items.length === 1 ? "" : "s"}
      </div>
      <ul>
        {f.items.map((i) => (
          <li key={i.id} className="py-2" style={{ borderTop: "1px solid var(--i-border)" }}>
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 text-[11.5px] text-[var(--i-text)] leading-snug">{i.label}</span>
              <span className="shrink-0 i-readout text-[11px] text-[var(--i-text-soft)]">
                {(expectedDays({ low: i.low, likely: i.likely, high: i.high }) / (capacity > 0 ? capacity : 1)).toFixed(
                  1
                )}
                d
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[9.5px] text-[var(--i-text-faint)]">
              <span>{i.state ?? "inferred work"}</span>
              <span>{i.assignee ?? "nobody assigned"}</span>
              <span>
                {i.low}–{i.high}d
              </span>
              {i.points !== null && <span>{i.points} pts</span>}
              {i.parentIdentifier && i.parentIdentifier !== f.id && (
                <span title="This is a sub-issue; its feature was resolved by walking the parent chain.">
                  sub-issue of {i.parentIdentifier}
                </span>
              )}
            </div>
            {f.canonicalCapability && (() => {
              const link = f.canonicalCapability.workLinks.find((candidate) => candidate.externalId === i.id);
              return link ? <button onClick={() => onUnlinkReality(f.canonicalCapability!, link.id, i.label)} className="mt-1.5 text-[9px] text-[var(--i-amber)] hover:underline" data-shoot="unlink-work">Unlink from capability</button> : null;
            })()}
          </li>
        ))}
      </ul>

      {f.done.length > 0 && (
        <>
          <div className="i-label mt-4 mb-2">Done · {f.done.length}</div>
          <ul>
            {f.done.map((d) => (
              <li
                key={d.id}
                className="py-1.5 flex items-baseline gap-2"
                style={{ borderTop: "1px solid var(--i-border)" }}
              >
                <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text-faint)] line-through">
                  {d.label}
                </span>
                <span className="shrink-0 text-[9.5px] text-[var(--i-text-faint)]">
                  {d.completedAt ? new Date(d.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-[10px] text-[var(--i-text-faint)] leading-snug">
        Only open work is simulated. Finished issues are shown for coverage so a capability is not mistaken for its
        unfinished half.
      </p>
    </div>
  );
}

// ── EVIDENCE ─────────────────────────────────────────────────────────────

function evidenceReferences(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return value == null ? [] : [value];

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.contextRefs)) return record.contextRefs;
  if (Array.isArray(record.evidenceRefs)) return record.evidenceRefs;
  return [value];
}

function evidenceString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function EvidenceReference({ value, index }: { value: unknown; index: number }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return (
      <li className="rounded px-3 py-2" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}>
        <div className="i-label">Reference {index + 1}</div>
        <div className="mt-1 break-words text-[10.5px] leading-relaxed text-[var(--i-text-soft)]">{String(value)}</div>
      </li>
    );
  }

  const record = value as Record<string, unknown>;
  const statement = evidenceString(record, ["statement", "quote", "excerpt", "title", "label", "name"]);
  const reference = evidenceString(record, ["ref", "url", "externalUrl", "sourceRef", "evidenceId", "id"]);
  const kind = evidenceString(record, ["kind", "type"]);
  const observedAt = evidenceString(record, ["observedAt", "observedDate", "createdAt"]);
  const suppliedBy = evidenceString(record, ["suppliedBy", "actor", "source"]);
  const nestedIds = Array.isArray(record.evidenceRefs)
    ? record.evidenceRefs.filter((item): item is string => typeof item === "string")
    : [];
  const href = reference && /^https?:\/\//i.test(reference) ? reference : null;
  const fallback = !statement && !reference ? JSON.stringify(record) : null;
  const metadata = [kind, observedAt, suppliedBy].filter(Boolean).join(" · ");

  return (
    <li className="rounded px-3 py-2" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border)" }}>
      <div className="i-label">Reference {index + 1}{kind ? ` · ${kind}` : ""}</div>
      {statement && <div className="mt-1 break-words text-[10.5px] leading-relaxed text-[var(--i-text-soft)]">{statement}</div>}
      {reference && (href ? (
        <a href={href} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[9.5px] text-[var(--i-signal)] hover:underline">
          {reference}
        </a>
      ) : (
        <div className="mt-1 break-all text-[9.5px] text-[var(--i-text-faint)]">{reference}</div>
      ))}
      {nestedIds.length > 0 && (
        <div className="mt-1 break-words text-[9px] text-[var(--i-text-faint)]">Evidence IDs · {nestedIds.join(", ")}</div>
      )}
      {metadata && <div className="mt-1 text-[9px] text-[var(--i-text-faint)]">{metadata}</div>}
      {fallback && <div className="mt-1 break-words text-[9.5px] leading-relaxed text-[var(--i-text-faint)]">{fallback}</div>}
    </li>
  );
}

function AttachedEvidence({ evidence }: { evidence: unknown[] }) {
  if (evidence.length === 0) {
    return <Row k="Attached evidence" v="None recorded" note="absence is shown, not inferred" />;
  }

  return (
    <details className="group py-2" style={{ borderTop: "1px solid var(--i-border)" }} data-shoot="attached-evidence">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--i-signal)]">
        <span className="i-label">Attached evidence</span>
        <span className="text-right text-[11px] font-semibold text-[var(--i-text)]">
          {evidence.length} reference{evidence.length === 1 ? "" : "s"} <span aria-hidden className="ml-1 text-[var(--i-text-faint)] group-open:hidden">▸</span><span aria-hidden className="ml-1 hidden text-[var(--i-text-faint)] group-open:inline">▾</span>
        </span>
      </summary>
      <p className="mt-1 text-right text-[8.5px] text-[var(--i-text-faint)]">Stored on the accepted assertion</p>
      <ul className="mt-2 space-y-2" data-shoot="attached-evidence-list">
        {evidence.map((item, index) => <EvidenceReference key={index} value={item} index={index} />)}
      </ul>
    </details>
  );
}

function Evidence({
  feature: f,
  onAccept,
  onStageKnowledgeEstimate,
  onClearKnowledgeEstimate,
}: {
  feature: Feature;
  onAccept: (id: string) => void;
  onStageKnowledgeEstimate: (capabilityId: string, estimate: CapabilityKnowledgeEstimate) => void;
  onClearKnowledgeEstimate: (capabilityId: string) => void;
}) {
  if (f.canonicalCapability) {
    const ownerEvents = f.canonicalCapability.events ?? [];
    const provenance = f.canonicalCapability.provenance && typeof f.canonicalCapability.provenance === "object" && !Array.isArray(f.canonicalCapability.provenance)
      ? f.canonicalCapability.provenance as Record<string, unknown>
      : {};
    const evidence = evidenceReferences(provenance.evidence);
    const source = typeof provenance.source === "string" ? provenance.source.replaceAll("_", " ") : "operator-governed Scope";
    const assertion = typeof provenance.assertion === "string" ? provenance.assertion : null;
    return (
      <div className="px-5 py-4">
        <div className="i-label" style={{ color: "var(--i-signal)" }}>Accepted truth and provenance</div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--i-text-soft)]">{assertion ?? "This capability is accepted Scope Reality and its work is connected through explicit CapabilityWorkLink records."}</p>
        <div className="mt-3">
          <Row k="Authority" v={typeof provenance.authority === "string" ? provenance.authority : "Scope"} note={`source · ${source}`} />
          <Row k="Reality revision" v={`r${f.canonicalCapability.revision}`} note={`${ownerEvents.length} recent event${ownerEvents.length === 1 ? "" : "s"} retained`} />
          <Row k="Execution evidence" v={`${f.canonicalCapability.workLinks.length} explicit link${f.canonicalCapability.workLinks.length === 1 ? "" : "s"}`} note="current Linear facts remain owned by Linear" />
          <AttachedEvidence evidence={evidence} />
        </div>
        <KnowledgeEstimateEvidence feature={f} onStage={onStageKnowledgeEstimate} onClear={onClearKnowledgeEstimate} />
        <div className="i-label mt-4 mb-2">Recent governed history</div>
        {ownerEvents.length ? ownerEvents.slice(0, 6).map((event) => (
          <div key={event.id} className="flex items-baseline gap-2 py-1.5" style={{ borderTop: "1px solid var(--i-border)" }}>
            <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--i-text-soft)]">{event.action.replaceAll("_", " ")}</span>
            <span className="text-[8.5px] text-[var(--i-text-faint)]">{event.actor} · {new Date(event.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
        )) : <p className="text-[9.5px] text-[var(--i-text-faint)]">No event rows are available for this accepted record.</p>}
      </div>
    );
  }
  if (f.source === "hermes" && f.evidence)
    return (
      <div className="px-5 py-4">
        <div className="i-label" style={{ color: "var(--i-violet)" }}>
          Why the machine believes this exists
        </div>
        <div className="mt-2 rounded px-3 py-3" style={{ background: "var(--i-recess)" }}>
          <div className="text-[11.5px] italic text-[var(--i-text-soft)] leading-relaxed">
            &ldquo;{f.evidence.quote}&rdquo;
          </div>
          {f.evidence.rationale && (
            <div className="mt-2 text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">{f.evidence.rationale}</div>
          )}
        </div>
        <div className="mt-3">
          <Row k="Represented in Linear" v="No" tone="var(--i-amber)" note="no ticket covers this" />
          <Row k="Counted in the forecast" v="Yes" note="the audit's estimate is already simulated" />
          <Row
            k="Accepted as a capability"
            v={f.accepted ? "Yes — in this Scenario" : "Not yet"}
            tone="var(--i-violet)"
            note={f.accepted ? "seated by hand in this Scenario" : "this is a candidate"}
          />
        </div>

        <div className="mt-3 rounded px-3 py-3" style={{ background: "var(--i-recess)" }}>
          <div className="flex items-center gap-2">
            <Prototype note="Candidate seating is hypothetical until accepted through the governed owner workflow." />
            <span className="i-label">Seat it into the release</span>
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--i-text-faint)] leading-snug">
            Accepting sets the candidate down on the tray with everything else in Reality. It changes no forecast
            input — this work was already being counted — so the only thing that moves is what we call a capability.
          </p>
          <button
            onClick={() => onAccept(f.id)}
            data-shoot="accept-candidate"
            className="mt-2.5 w-full rounded-md px-3 py-2 text-[11.5px] transition-colors"
            style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
          >
            {f.accepted ? "Return it to candidate" : "Accept as a capability"}
          </button>
        </div>
        <p className="mt-3 text-[10.5px] text-[var(--i-text-soft)] leading-relaxed">
          Accepting a candidate means writing it down as a first-class capability, which needs the Feature table Scope
          does not have yet. Until then it stays a candidate here, and the work it implies keeps being counted — which
          is the safe way round.
        </p>
        <Link
          href="/audit"
          className="mt-3 inline-block text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
        >
          Intelligence owns the investigation →
        </Link>
      </div>
    );

  if (f.source === "unmapped")
    return (
      <Empty
        title="Nothing to attribute"
        body="These items have no parent in Linear, so there is no capability to gather evidence about. The evidence you want here is a decision about where this work belongs."
      />
    );

  return (
    <div className="px-5 py-4">
      <p className="text-[11.5px] text-[var(--i-text-soft)] leading-relaxed">
        This capability comes from Linear&apos;s own structure — {f.items.length + f.done.length} issues share it as a
        parent. That is the evidence: somebody organised the work this way.
      </p>
      <div className="mt-3">
        <Row k="Source" v="Linear parent" note={f.id} />
        <Row k="Project" v={f.epic ?? "—"} note="the epic this sits in" />
      </div>
      <p className="mt-3 text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">
        No wiki or meeting evidence is attached to it. Scope does not go looking — Intelligence does, and anything it
        finds that Linear does not represent arrives here as its own candidate capability.
      </p>
      <Link
        href="/audit"
        className="mt-3 inline-block text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
      >
        Intelligence owns the investigation →
      </Link>
    </div>
  );
}

// ── ESTIMATE ─────────────────────────────────────────────────────────────

function Estimate({
  feature: f,
  capacity,
  onSetEstimate,
  onClearEstimate,
  onStageKnowledgeEstimate,
  onClearKnowledgeEstimate,
}: {
  feature: Feature;
  capacity: number;
  onSetEstimate: (id: string, range: ThreePoint) => void;
  onClearEstimate: (id: string) => void;
  onStageKnowledgeEstimate: (capabilityId: string, estimate: CapabilityKnowledgeEstimate) => void;
  onClearKnowledgeEstimate: (capabilityId: string) => void;
}) {
  const [tuning, setTuning] = useState<string | null>(null);
  if (f.items.length === 0 && f.knowledgeEstimates.length === 0)
    return <Empty title="Nothing to estimate" body="No open work is mapped and the current knowledge snapshot carries no developer estimate for this capability." />;

  const tuned = f.items.find((i) => i.id === tuning) ?? null;
  return (
    <div className="px-5 py-4">
      <KnowledgeEstimateEvidence feature={f} onStage={onStageKnowledgeEstimate} onClear={onClearKnowledgeEstimate} />
      {f.items.length > 0 ? <>
      <p className="text-[11px] text-[var(--i-text-soft)] leading-relaxed">
        {f.activeKnowledgeEstimate
          ? "The staged meeting estimate is replacing this ticket rollup in Scenario, so the same work is not counted twice. Remove it to return to the ranges below."
          : `The display above is the sum of these ${f.items.length} range${f.items.length === 1 ? "" : "s"}. Re-estimating one moves it, in this Scenario only.`}
      </p>

      <div className="i-label mt-4 mb-2">Where each number comes from</div>
      <ul>
        {f.items.map((i) => (
          <li key={i.id} className="py-2" style={{ borderTop: "1px solid var(--i-border)" }}>
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text-soft)]">{i.label}</span>
              <span className="shrink-0 i-readout text-[11px] text-[var(--i-text)]">
                {i.low}–{i.likely}–{i.high}d
              </span>
              <button
                onClick={() => setTuning(tuning === i.id ? null : i.id)}
                data-shoot="tune-estimate"
                className="shrink-0 rounded px-2 py-1 text-[9.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
                style={{ border: "1px solid var(--i-border-strong)" }}
              >
                {tuning === i.id ? "done" : "re-estimate"}
              </button>
            </div>
            <div className="mt-1 text-[9.5px] text-[var(--i-text-faint)]">
              {ESTIMATE_SOURCE[i.estimateSource] ?? i.estimateSource}
            </div>
          </li>
        ))}
      </ul>

      {tuned && (
        <EstimatePad
          item={tuned}
          capacity={capacity}
          onChange={(r) => onSetEstimate(tuned.id, r)}
          onReset={() => onClearEstimate(tuned.id)}
        />
      )}

      </> : (
        <p className="mt-3 text-[10px] text-[var(--i-text-faint)] leading-snug">
          There are no linked Linear items yet. A usable meeting range can stand in for the whole capability in Scenario; it does not create tickets or change accepted Reality.
        </p>
      )}

      <p className="mt-3 text-[10px] text-[var(--i-text-faint)] leading-snug">
        The stored estimate is never written.
      </p>
    </div>
  );
}

function KnowledgeEstimateEvidence({
  feature,
  onStage,
  onClear,
}: {
  feature: Feature;
  onStage: (capabilityId: string, estimate: CapabilityKnowledgeEstimate) => void;
  onClear: (capabilityId: string) => void;
}) {
  const capability = feature.canonicalCapability;
  if (!capability || feature.knowledgeEstimates.length === 0) return null;
  return (
    <div className="mt-4 rounded-md px-3 py-3" style={{ border: "1px solid color-mix(in srgb, var(--i-violet) 45%, var(--i-border))", background: "var(--i-recess)" }} data-shoot="knowledge-estimate-evidence">
      <div className="flex items-baseline justify-between gap-3">
        <span className="i-label" style={{ color: "var(--i-violet)" }}>Developer estimate evidence</span>
        <span className="text-[8.5px] text-[var(--i-text-faint)]">from current knowledge snapshot</span>
      </div>
      <div className="mt-2 space-y-2">
        {feature.knowledgeEstimates.slice(0, 3).map((estimate) => {
          const active = feature.activeKnowledgeEstimate?.id === estimate.id;
          const attribution = [estimate.speaker ?? estimate.owner, estimate.observedAt, estimate.sourceRef].filter(Boolean).join(" · ");
          return (
            <div key={estimate.id} className="rounded px-2.5 py-2" style={{ border: "1px solid var(--i-border)" }}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 text-[10.5px] text-[var(--i-text-soft)]">{estimate.statement}</span>
                <span className="shrink-0 i-readout text-[10.5px] text-[var(--i-text)]">{estimate.rawEstimate}</span>
              </div>
              {attribution && <div className="mt-1 text-[8.5px] text-[var(--i-text-faint)]">{attribution}</div>}
              {estimate.excerpt && <div className="mt-1.5 text-[9.5px] italic leading-relaxed text-[var(--i-text-faint)]">&ldquo;{estimate.excerpt}&rdquo;</div>}
              {estimate.range ? (
                <button
                  type="button"
                  onClick={() => active ? onClear(capability.id) : onStage(capability.id, estimate)}
                  className="mt-2 w-full rounded px-2 py-1.5 text-[9.5px]"
                  style={{ border: "1px solid var(--i-violet)", color: "var(--i-violet)" }}
                  data-shoot={active ? "clear-knowledge-estimate" : "stage-knowledge-estimate"}
                >
                  {active ? "Remove provisional estimate from Scenario" : "Use provisionally in Scenario"}
                </button>
              ) : (
                <div className="mt-2 text-[9px] leading-snug text-[var(--i-amber)]">
                  Evidence only. Signal will not convert sprints, story points, or an unbounded statement into developer-days.
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[9px] leading-snug text-[var(--i-text-faint)]">
        Staging replaces this capability&apos;s ticket rollup in the hypothetical. It never adds both totals, never writes to Linear, and never changes Reality.
      </p>
    </div>
  );
}

// The one continuous control Scope owns. Two real dimensions, because a
// three-point estimate has exactly two things worth saying about it: how big,
// and how sure. Reality's own estimate stays on the pad as a ghost, so the
// size of the claim you are making is always visible.
function EstimatePad({
  item,
  capacity,
  onChange,
  onReset,
}: {
  item: ScopeWorkItem;
  capacity: number;
  onChange: (r: ThreePoint) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const stored = useMemo<ThreePoint>(() => ({ low: item.low, likely: item.likely, high: item.high }), [item]);
  const maxLikely = Math.max(1, stored.likely * 2.5);
  const storedSpread = Math.max(0.5, stored.high - stored.low);
  const maxSpread = storedSpread * 2.5;
  // Keep the stored estimate's own asymmetry: one that skewed pessimistic in
  // Reality keeps skewing pessimistic when you widen it.
  const leftShare = (stored.likely - stored.low) / storedSpread;

  const x = Math.min(1, stored.likely / maxLikely);
  const y = Math.min(1, storedSpread / maxSpread);

  const emit = (nx: number, ny: number) => {
    const likely = Math.max(0.5, Math.round(nx * maxLikely * 2) / 2);
    const spread = Math.max(0, Math.round(ny * maxSpread * 2) / 2);
    const low = Math.max(0.1, Math.round((likely - spread * leftShare) * 10) / 10);
    onChange({ low, likely, high: Math.max(Math.round((low + spread) * 10) / 10, likely) });
  };
  const fromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    emit(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    );
  };

  return (
    <div className="mt-3 rounded px-3 py-3" style={{ background: "var(--i-recess)" }}>
      <div className="flex items-baseline justify-between">
        <span className="i-label">Re-estimate — hypothetical</span>
        <button onClick={onReset} className="text-[10px] text-[var(--i-text-faint)] hover:text-[var(--i-text)]">
          back to Reality
        </button>
      </div>
      <div
        className="i-meter relative mt-2"
        style={{ height: 118, touchAction: "none" }}
        role="application"
        aria-label="Estimate pad: horizontal is how big, vertical is how unsure"
        data-shoot="estimate-pad"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          fromEvent(e);
        }}
        onPointerMove={(e) => dragging && fromEvent(e)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        {[25, 50, 75].map((g) => (
          <span
            key={`v${g}`}
            className="absolute inset-y-0 pointer-events-none"
            style={{ left: `${g}%`, width: 1, background: "var(--i-border)", opacity: 0.5 }}
          />
        ))}
        {[25, 50, 75].map((g) => (
          <span
            key={`h${g}`}
            className="absolute inset-x-0 pointer-events-none"
            style={{ top: `${g}%`, height: 1, background: "var(--i-border)", opacity: 0.5 }}
          />
        ))}
        <span
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            background: "var(--i-violet)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
            transition: dragging ? "none" : "left 160ms ease, top 160ms ease",
          }}
        />
        <span className="absolute left-2 bottom-1.5 text-[9px] text-[var(--i-text-faint)] pointer-events-none">
          less certain ↓
        </span>
        <span className="absolute right-2 top-1.5 text-[9px] text-[var(--i-text-faint)] pointer-events-none">
          bigger →
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="i-readout text-[12px] text-[var(--i-text)]">
          {stored.low} – {stored.likely} – {stored.high}d
        </span>
        <span className="text-[10px] text-[var(--i-text-faint)]">
          {(expectedDays(stored) / (capacity > 0 ? capacity : 1)).toFixed(1)}d of schedule
        </span>
      </div>
    </div>
  );
}

// ── HISTORY ──────────────────────────────────────────────────────────────

function History({ feature: f }: { feature: Feature }) {
  const completed = [...f.done]
    .filter((d) => d.completedAt)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const ownerEvents = f.canonicalCapability?.events ?? [];

  return (
    <div className="px-5 py-4">
      {ownerEvents.length === 0 && completed.length === 0 ? (
        <Empty
          title="Nothing recorded yet"
          body="No governed edit or completed work has been recorded for this capability yet."
        />
      ) : (
        <>
          {ownerEvents.length > 0 && <>
            <div className="i-label mb-2">Governed owner history</div>
            <ul>
              {ownerEvents.map((event) => (
                <li key={event.id} className="py-2 flex items-baseline gap-3" style={{ borderTop: "1px solid var(--i-border)" }}>
                  <span className="shrink-0 i-readout text-[10px] text-[var(--i-text-faint)]" style={{ width: 46 }}>
                    {new Date(event.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] text-[var(--i-text-soft)] leading-snug">
                    {event.action.replaceAll("_", " ")} · {event.actor}
                  </span>
                </li>
              ))}
            </ul>
          </>}
          {completed.length > 0 && <>
            <div className="i-label mb-2 mt-4">What has completed</div>
            <ul>
              {completed.map((d) => (
                <li key={d.id} className="py-2 flex items-baseline gap-3" style={{ borderTop: "1px solid var(--i-border)" }}>
                  <span className="shrink-0 i-readout text-[10px] text-[var(--i-text-faint)]" style={{ width: 46 }}>
                    {new Date(d.completedAt!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] text-[var(--i-text-soft)] leading-snug">{d.label}</span>
                </li>
              ))}
            </ul>
          </>}
        </>
      )}
      <p className="mt-4 text-[10px] text-[var(--i-text-faint)] leading-snug">
        Reality edits are append-only owner events. Work completion remains Linear execution history.
      </p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-5 py-8">
      <div className="text-[12.5px] text-[var(--i-text)]">{title}</div>
      <p className="mt-1.5 text-[11px] text-[var(--i-text-faint)] leading-relaxed">{body}</p>
    </div>
  );
}

// ── ADD CAPABILITY ───────────────────────────────────────────────────────

export function AddFeature({
  open,
  onClose,
  unmappedItems,
  capacity,
  saving,
  error,
  onSaveReality,
  onCreateScenario,
}: {
  open: boolean;
  onClose: () => void;
  unmappedItems: ScopeWorkItem[];
  capacity: number;
  saving: boolean;
  error: string | null;
  onSaveReality: (draft: { name: string; description: string; note: string; evidence: unknown[]; workItemIds: string[]; status: "accepted" | "outside" | "future" }) => void;
  onCreateScenario: (draft: DraftFeature) => void;
}) {
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [note, setNote] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (!open) return null;

  const pickedDays = unmappedItems
    .filter((i) => picked.has(i.id))
    .reduce((s, i) => s + expectedDays({ low: i.low, likely: i.likely, high: i.high }) / (capacity > 0 ? capacity : 1), 0);

  return (
    <ToolWindow open onClose={onClose} title="Scope" subtitle="Add a capability" width={470} dataShoot="add-feature-tool">
      <div className="px-5 py-4">
        <label className="i-label" htmlFor="feature-name">
          Name
        </label>
        <input
          id="feature-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Offline Capture"
          autoFocus
          className="mt-1.5 w-full rounded px-3 py-2 text-[13px]"
          style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
        />

        <label className="i-label mt-3.5 block" htmlFor="feature-intent">
          What it is for
        </label>
        <textarea
          id="feature-intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={2}
          placeholder="Field teams must capture work without connectivity."
          className="mt-1.5 w-full rounded px-3 py-2 text-[12px] leading-relaxed resize-none"
          style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
        />

        {unmappedItems.length > 0 && (
          <>
            <div className="i-label mt-4">Claim work that is not mapped yet</div>
            <p className="mt-1 text-[10px] text-[var(--i-text-faint)] leading-snug">
              Optional. In Reality this explicitly brings selected Linear work into the accepted modeled subset;
              in Scenario it remains a local attribution preview.
            </p>
            <ul className="mt-2 max-h-[186px] overflow-y-auto">
              {unmappedItems.map((i) => {
                const on = picked.has(i.id);
                return (
                  <li key={i.id} style={{ borderTop: "1px solid var(--i-border)" }}>
                    <button
                      onClick={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (on) next.delete(i.id);
                          else next.add(i.id);
                          return next;
                        })
                      }
                      data-shoot="claim-item"
                      className="w-full py-2 flex items-center gap-2.5 text-left"
                    >
                      <span
                        aria-hidden
                        className="shrink-0 rounded-sm"
                        style={{
                          width: 13,
                          height: 13,
                          border: `1px solid ${on ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                          background: on ? "var(--i-violet)" : "transparent",
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--i-text-soft)]">{i.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <label className="i-label mt-4 block" htmlFor="feature-note">Acceptance note · optional</label>
        <input id="feature-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why this belongs in accepted product shape" className="mt-1.5 w-full rounded px-3 py-2 text-[11px]" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }} />
        <label className="i-label mt-3 block" htmlFor="feature-evidence">Evidence reference · optional</label>
        <input id="feature-evidence" value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} placeholder="URL, document id, or source reference" className="mt-1.5 w-full rounded px-3 py-2 text-[11px]" style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }} />

        <div className="mt-3 rounded border border-[var(--i-border)] bg-[var(--i-recess)] px-3 py-2 text-[9.5px] text-[var(--i-text-faint)]">
          {evidenceRef.trim() ? "Operator assertion · evidence attached" : "Operator assertion · no evidence yet"} · explicit server save
        </div>

        {error && <div className="mt-2 text-[10px] text-[var(--i-red)]">{error}</div>}

        <button
          disabled={name.trim().length === 0 || saving}
          onClick={() => onSaveReality({
            name: name.trim(), description: intent.trim(), note: note.trim(),
            evidence: evidenceRef.trim() ? [{ ref: evidenceRef.trim(), suppliedBy: "operator" }] : [],
            workItemIds: [...picked], status: "accepted",
          })}
          data-shoot="create-feature-reality"
          className="mt-4 w-full rounded-md px-3 py-2.5 text-[12px] transition-colors disabled:opacity-30"
          style={{ border: "1px solid var(--i-signal)", color: "var(--i-signal)" }}
        >
          {saving ? "Saving Reality…" : `Add ${name.trim() || "capability"} to Reality`}
          {picked.size > 0 && ` with ${picked.size} item${picked.size === 1 ? "" : "s"} · ${pickedDays.toFixed(1)}d`}
        </button>
        <button
          disabled={name.trim().length === 0 || saving}
          onClick={() => onCreateScenario({ id: `draft-${Date.now().toString(36)}`, name: name.trim(), intent: intent.trim(), itemIds: [...picked] })}
          data-shoot="create-feature-scenario"
          className="mt-2 w-full rounded-md border border-[var(--i-violet)] px-3 py-2 text-[10.5px] text-[var(--i-violet)] disabled:opacity-30"
        >
          Preview in Scenario only
        </button>
      </div>
    </ToolWindow>
  );
}
