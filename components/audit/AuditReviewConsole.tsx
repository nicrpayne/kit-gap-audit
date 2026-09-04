"use client";

// THE REVIEW CONSOLE. Slim at rest, an instrument console when something is
// selected — the physical bottom edge of the tool, where a decision is
// actually made.
//
// THE TRUST BOUNDARY LIVES HERE, and it is a product feature rather than a
// disclaimer:
//
//   REALITY PROTECTED
//   NO CHANGE TO REALITY OCCURS WITHOUT HUMAN CONFIRMATION
//
// It is on screen at rest, when nothing is selected and there is nothing to
// confirm — which is the only way a promise like that reads as a property of
// the instrument rather than as text that appears next to a button.
//
// There is deliberately NO "Accept into Reality" control. A Finding is not
// Reality and there is nothing in the schema that phrase could write to.
// Every primary action names the row it is about to create instead, and
// states what it will not do — see lib/audit/actions.ts.

import { useState } from "react";
import type { TruthFinding, TruthMapModel } from "@/lib/audit/truth";
import {
  primaryActionFor,
  secondaryActionsFor,
  candidateRealityFor,
  type ActionId,
  type PrimaryAction,
} from "@/lib/audit/actions";
import type { FindingProvenance } from "@/lib/audit/provenance";
import { findingColor, CONFIRMED_COLOR } from "./tokens";
import { IconHolder, LANE_ICONS } from "./icons";

export type ConsoleMode = "A" | "B";

export default function AuditReviewConsole({
  model,
  finding,
  evidenceSolo,
  onEvidenceSolo,
  mode,
  onMode,
  onAction,
  busy,
  result,
  awaitingEvidence,
  provenance,
}: {
  model: TruthMapModel;
  finding: TruthFinding | null;
  provenance: FindingProvenance | null;
  evidenceSolo: boolean;
  onEvidenceSolo: (v: boolean) => void;
  mode: ConsoleMode;
  onMode: (m: ConsoleMode) => void;
  onAction: (action: PrimaryAction, text: string) => void;
  busy: ActionId | null;
  result: { ok: boolean; message: string } | null;
  awaitingEvidence: boolean;
}) {
  const [text, setText] = useState("");

  // RESTING. The boundary is stated even with nothing to confirm.
  if (!finding) {
    return (
      <div
        data-shoot="review-console-rest"
        className="flex shrink-0 items-center justify-between gap-6 px-5 py-3"
        style={{ background: "var(--i-panel)", borderTop: "1px solid var(--i-border)" }}
      >
        <div className="flex items-center gap-2.5">
          <ShieldMark />
          <span className="i-label" style={{ color: "var(--i-signal)" }}>
            Reality protected
          </span>
          <span className="text-[11px] text-[var(--i-text-soft)]">
            No change to Reality occurs without human confirmation.
          </span>
        </div>
        <span className="text-[11px] text-[var(--i-text-faint)]">
          Select a finding to investigate it.
        </span>
      </div>
    );
  }

  const primary = primaryActionFor(finding);
  const secondaries = secondaryActionsFor(finding);
  const candidate = candidateRealityFor(finding, model.scopeName);
  const color = findingColor(finding);
  const needsText = primary.requires != null;
  const canRun = !needsText || text.trim().length > 0;

  return (
    <div
      data-shoot="review-console-open"
      className="shrink-0"
      style={{ background: "var(--i-panel)", borderTop: "1px solid var(--i-border)" }}
    >
      <div className="grid grid-cols-[248px_1fr_minmax(340px,380px)] gap-px" style={{ background: "var(--i-border)" }}>
        {/* ── EVIDENCE SOLO ────────────────────────────────────────── */}
        <div className="px-4 py-3" style={{ background: "var(--i-panel)" }}>
          <button
            type="button"
            role="switch"
            aria-checked={evidenceSolo}
            onClick={() => onEvidenceSolo(!evidenceSolo)}
            data-shoot="evidence-solo-toggle"
            className="flex w-full items-center gap-2.5 text-left"
          >
            <span
              className="relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors"
              style={{
                background: evidenceSolo ? "var(--i-signal)" : "var(--i-recess)",
                border: `1px solid ${evidenceSolo ? "var(--i-signal)" : "var(--i-border-strong)"}`,
              }}
            >
              <span
                className="absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all"
                style={{
                  left: evidenceSolo ? 16 : 2,
                  background: evidenceSolo ? "var(--i-void)" : "var(--i-text-faint)",
                }}
              />
            </span>
            <span className="i-label" style={{ color: evidenceSolo ? "var(--i-signal)" : "var(--i-text-soft)" }}>
              Evidence solo
            </span>
          </button>
          <p className="mt-2 text-[10.5px] leading-[1.5] text-[var(--i-text-faint)]">
            Isolates this finding&rsquo;s provenance through the network, and fades everything it does not run
            through.
          </p>
        </div>

        {/* ── A / B ────────────────────────────────────────────────── */}
        <div className="px-4 py-3" style={{ background: "var(--i-panel)" }}>
          <div className="flex items-center justify-between gap-3">
            <span className="i-label" style={{ color: "var(--i-text-faint)" }}>
              Why Signal believes this
            </span>
            <div className="flex overflow-hidden rounded-md border" style={{ borderColor: "var(--i-border-strong)" }}>
              {(["A", "B"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onMode(m)}
                  data-shoot={`mode-${m}`}
                  aria-pressed={mode === m}
                  className="px-2.5 py-1 text-[10px] uppercase tracking-[0.13em] transition-colors"
                  style={{
                    background: mode === m ? (m === "B" ? "var(--i-violet-soft)" : "var(--i-signal-soft)") : "transparent",
                    color: mode === m ? (m === "B" ? "var(--i-violet)" : "var(--i-signal)") : "var(--i-text-faint)",
                  }}
                >
                  {m === "A" ? "A · Current" : "B · Preview"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2.5">
            <Panel
              label="A · Current Reality"
              tone={mode === "A" ? "var(--i-signal)" : "var(--i-text-faint)"}
              active={mode === "A"}
            >
              {candidate.current}
            </Panel>
            <div className="flex items-center text-[13px]" style={{ color: "var(--i-text-faint)" }}>
              →
            </div>
            <Panel
              label="B · Candidate Reality"
              tone={mode === "B" ? "var(--i-violet)" : "var(--i-text-faint)"}
              active={mode === "B"}
              /* NEVER PERSISTED, and it says so on itself rather than only in
                 a caption somewhere else. */
              badge={mode === "B" ? "Not saved" : undefined}
            >
              {candidate.candidate}
            </Panel>
          </div>
          {mode === "B" && (
            <p className="mt-2 text-[10.5px] leading-[1.5]" style={{ color: "var(--i-text-soft)" }}>
              {candidate.consequence}
            </p>
          )}

          {/* THE ROUTE, IN ONE LINE. The column's own question is "why does
              Signal believe this", and the shortest true answer is the chain
              the claim actually came down: the finding, the object that
              carries it, the passage, the system it was read from. Every hop
              is a real row — nothing here is drawn unless it resolved. */}
          {provenance && provenance.kind !== "none" && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-shoot="provenance-chain">
              <ChainNode laneId={finding.laneId} label={finding.kindLabel} />
              {provenance.snapshot && (
                <>
                  <ChainArrow />
                  <ChainNode laneId="hermes" label={provenance.snapshot.packageId} />
                </>
              )}
              {provenance.passages.slice(0, 1).map((p) => (
                <span key={p.evidenceId} className="flex items-center gap-1.5">
                  <ChainArrow />
                  <ChainNode laneId="evidence" label={p.evidenceId} />
                  <ChainArrow />
                  <ChainNode laneId={laneForSourceLabel(p.sourceType)} label={p.sourceRef} />
                </span>
              ))}
              {provenance.passages.length === 0 && provenance.source && (
                <>
                  <ChainArrow />
                  <ChainNode laneId="evidence" label={provenance.source.title} />
                </>
              )}
            </div>
          )}
        </div>

        {/* ── HUMAN REVIEW ─────────────────────────────────────────── */}
        <div className="px-4 py-3" style={{ background: "var(--i-panel)" }}>
          <div className="flex items-center gap-2">
            <ShieldMark />
            <span className="i-label" style={{ color: "var(--i-signal)" }}>
              Human review required
            </span>
          </div>
          <p className="mt-1 text-[10.5px] leading-[1.45] text-[var(--i-text-faint)]">
            No change to Reality occurs without human confirmation.
          </p>

          {primary.requires && (
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={primary.requires.placeholder}
              aria-label={primary.requires.label}
              data-shoot="console-required-text"
              className="mt-2.5 w-full rounded-md px-2.5 py-1.5 text-[11px] outline-none"
              style={{
                background: "var(--i-recess)",
                border: "1px solid var(--i-border-strong)",
                color: "var(--i-text)",
              }}
            />
          )}

          <button
            type="button"
            disabled={!canRun || busy != null}
            onClick={() => onAction(primary, text)}
            data-shoot="console-primary"
            className="mt-2.5 w-full rounded-md px-3 py-2 text-[11.5px] font-medium transition-colors disabled:opacity-40"
            style={{
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              border: `1px solid ${color}`,
              color,
            }}
          >
            {busy === primary.id ? "Working…" : primary.label}
          </button>
          {/* WHAT IT WILL NOT DO, next to the button that does it. */}
          <p className="mt-1.5 text-[10px] leading-[1.45]" style={{ color: "var(--i-text-faint)" }}>
            {primary.doesNotWrite}
          </p>

          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {secondaries.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy != null}
                onClick={() => onAction(s, text)}
                data-shoot={`console-${s.id}`}
                title={s.doesNotWrite}
                className="rounded-md px-1.5 py-1.5 text-[10px] transition-colors hover:bg-white/[0.04] disabled:opacity-40"
                style={{
                  border: "1px solid var(--i-border-strong)",
                  color:
                    s.id === "reject"
                      ? "var(--i-red)"
                      : s.id === "need_more_evidence" && awaitingEvidence
                        ? "var(--i-amber)"
                        : "var(--i-text-soft)",
                }}
              >
                {s.id === "need_more_evidence" && awaitingEvidence ? "Awaiting evidence" : s.label}
              </button>
            ))}
          </div>

          {awaitingEvidence && (
            <p className="mt-1.5 text-[10px]" style={{ color: "var(--i-amber)" }}>
              Session only — Finding.status has no awaiting-evidence value, so this is lost on reload.
            </p>
          )}

          {result && (
            <p
              data-shoot="console-result"
              className="mt-2 text-[10.5px] leading-[1.45]"
              style={{ color: result.ok ? CONFIRMED_COLOR : "var(--i-red)" }}
            >
              {result.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({
  label,
  tone,
  active,
  badge,
  children,
}: {
  label: string;
  tone: string;
  active: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md border px-2.5 py-2 transition-colors"
      style={{
        borderColor: active ? `color-mix(in srgb, ${tone} 55%, transparent)` : "var(--i-border)",
        background: active ? `color-mix(in srgb, ${tone} 7%, transparent)` : "transparent",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="i-label" style={{ color: tone }}>
          {label}
        </span>
        {badge && (
          <span
            className="rounded px-1 py-[1px] text-[8px] uppercase tracking-[0.13em]"
            style={{ color: "var(--i-violet)", border: "1px solid color-mix(in srgb, var(--i-violet) 45%, transparent)" }}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-[10.5px] leading-[1.5] text-[var(--i-text-soft)]">{children}</p>
    </div>
  );
}

/** One hop in the provenance chain. */
function ChainNode({ laneId, label }: { laneId: string; label: string }) {
  const Icon = LANE_ICONS[laneId] ?? LANE_ICONS.evidence;
  return (
    <span
      className="flex max-w-[170px] items-center gap-1.5 rounded-md border px-1.5 py-1"
      style={{ borderColor: "var(--i-border)", background: "var(--i-recess)" }}
      title={label}
    >
      <IconHolder tone="var(--i-text-soft)" size={18} filled={false}>
        <Icon size={11} />
      </IconHolder>
      <span className="truncate text-[10px] text-[var(--i-text-soft)]">{label}</span>
    </span>
  );
}

function ChainArrow() {
  return (
    <span className="text-[10px]" style={{ color: "var(--i-text-faint)" }} aria-hidden="true">
      →
    </span>
  );
}

/** A manifest sourceType onto a lane icon. Unknown types fall back to the
    evidence glyph rather than guessing at a system. */
function laneForSourceLabel(sourceType: string | null): string {
  const t = (sourceType ?? "").toLowerCase();
  if (t.includes("linear")) return "linear";
  if (t.includes("notion")) return "notion";
  if (t.includes("figma")) return "figma";
  return "evidence";
}

function ShieldMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--i-signal)" strokeWidth={1.6} aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
