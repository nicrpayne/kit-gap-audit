"use client";

// ONE HUMAN, DIVIDED. Deep on demand.
//
// Normal planning happens at channel level -- how much capacity is on
// Platform, not who. This opens only when the question genuinely becomes
// "which person, and how much of them", and it works on ONE unit of human
// capacity at a time.
//
// The invariant it exists to make visible: whatever the split, the person
// is still exactly one person. Their fractions total at most 100%, and the
// difference between what they cost the portfolio (raw) and what the
// portfolio gets back (effective) is the price of dividing them.
//
// No names required. A unit labelled "Person 07" plans exactly as well as
// one labelled with somebody's name, and the label never touches the math.

import { useMemo, useState } from "react";
import type { SplitPersonView, SplitLine } from "@/lib/capacity/workforce";

export interface PatchbayPerson {
  personId: string;
  label: string;
  fte: number;
  lines: SplitLine[];
}

interface Props {
  open: boolean;
  people: PatchbayPerson[];
  scopeNameById: Map<string, string>;
  accentByScope: Map<string, string>;
  contextSwitchCostPct: number;
  splits: SplitPersonView[];
  error: string | null;
  onSetSplit: (personId: string, lines: SplitLine[]) => void;
  onRelabel: (personId: string, label: string) => void;
  onClose: () => void;
}

export default function SplitPatchbay({
  open,
  people,
  scopeNameById,
  accentByScope,
  contextSwitchCostPct,
  splits,
  error,
  onSetSplit,
  onRelabel,
  onClose,
}: Props) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState<string | null>(null);

  const focus = useMemo(
    () => people.find((p) => p.personId === (focusId ?? people[0]?.personId)) ?? null,
    [people, focusId]
  );
  const splitView = splits.find((s) => s.personId === focus?.personId) ?? null;

  if (!open) return null;

  const scopeIds = [...scopeNameById.keys()];
  const total = focus ? focus.lines.reduce((t, l) => t + l.fraction, 0) : 0;
  const over = total > 1 + 1e-6;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center pb-6"
      style={{ background: "rgba(6,8,10,0.66)" }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Split a person"
        data-shoot="patchbay"
        onClick={(e) => e.stopPropagation()}
        className="w-[720px] max-w-[94vw] rounded-lg overflow-hidden"
        style={{ background: "var(--i-bg)", border: "1px solid var(--i-border-strong)" }}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--i-border)" }}>
          <div>
            <div className="i-label">Patchbay</div>
            <div className="mt-0.5 text-[12.5px] text-[var(--i-text)]">One person, across projects</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="h-6 w-6 text-[var(--i-text-faint)] hover:text-[var(--i-text)]">
            ✕
          </button>
        </div>

        <div className="flex" style={{ maxHeight: 380 }}>
          {/* who */}
          <div className="w-[190px] shrink-0 overflow-y-auto py-1.5" style={{ borderRight: "1px solid var(--i-border)" }}>
            {people.map((p) => {
              const isSplit = p.lines.filter((l) => l.fraction > 1e-6).length > 1;
              const active = p.personId === focus?.personId;
              return (
                <button
                  key={p.personId}
                  onClick={() => {
                    setFocusId(p.personId);
                    setLabelDraft(null);
                  }}
                  data-shoot="patchbay-person"
                  className="w-full px-3 py-1.5 text-left text-[11px] transition-colors"
                  style={{ background: active ? "var(--i-panel-raised)" : "transparent", color: active ? "var(--i-text)" : "var(--i-text-soft)" }}
                >
                  <div className="truncate">{p.label}</div>
                  <div className="text-[9px] text-[var(--i-text-faint)]">
                    {p.fte.toFixed(1)} FTE{isSplit ? " · split" : ""}
                  </div>
                </button>
              );
            })}
          </div>

          {/* how they are divided */}
          <div className="flex-1 min-w-0 p-4 overflow-y-auto">
            {!focus ? (
              <div className="text-[11px] text-[var(--i-text-faint)]">Nobody to divide.</div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {labelDraft === null ? (
                    <>
                      <span className="i-readout text-[15px]">{focus.label}</span>
                      <button
                        onClick={() => setLabelDraft(focus.label)}
                        data-shoot="rename-person"
                        className="text-[9.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)] underline underline-offset-2"
                      >
                        rename
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        value={labelDraft}
                        autoFocus
                        aria-label="Person label"
                        onChange={(e) => setLabelDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && labelDraft.trim()) {
                            onRelabel(focus.personId, labelDraft.trim());
                            setLabelDraft(null);
                          }
                          if (e.key === "Escape") setLabelDraft(null);
                        }}
                        className="rounded px-2 py-1 text-[12px]"
                        style={{ background: "var(--i-void)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
                      />
                      <button
                        onClick={() => {
                          if (labelDraft.trim()) onRelabel(focus.personId, labelDraft.trim());
                          setLabelDraft(null);
                        }}
                        data-shoot="save-label"
                        className="rounded px-2 py-1 text-[9.5px] font-medium"
                        style={{ background: "var(--i-text)", color: "var(--i-void)" }}
                      >
                        Save
                      </button>
                      <span className="text-[9.5px] text-[var(--i-text-faint)]">a label only — the forecast will not move</span>
                    </>
                  )}
                </div>

                <div className="mt-3.5 space-y-2">
                  {scopeIds.map((scopeId) => {
                    const line = focus.lines.find((l) => l.scopeId === scopeId);
                    const pct = Math.round((line?.fraction ?? 0) * 100);
                    return (
                      <div key={scopeId} className="flex items-center gap-2.5 text-[11px]">
                        <span
                          className="h-[7px] w-[7px] rounded-full shrink-0"
                          style={{ background: accentByScope.get(scopeId) ?? "var(--i-text-faint)" }}
                          aria-hidden
                        />
                        <span className="w-24 shrink-0 truncate text-[var(--i-text-soft)]">
                          {scopeNameById.get(scopeId) ?? scopeId}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={pct}
                          aria-label={`${focus.label} on ${scopeNameById.get(scopeId) ?? scopeId}`}
                          data-shoot={`patch-${scopeId}`}
                          onChange={(e) => {
                            const next = focus.lines.filter((l) => l.scopeId !== scopeId);
                            const v = Number(e.target.value) / 100;
                            if (v > 1e-6) next.push({ scopeId, fraction: v });
                            onSetSplit(focus.personId, next);
                          }}
                          className="flex-1 accent-[var(--i-violet)]"
                        />
                        <span className="w-9 text-right tabular-nums text-[var(--i-text-soft)]">{pct}%</span>
                      </div>
                    );
                  })}
                </div>

                <div
                  className="mt-4 rounded-md px-3 py-2.5 flex items-center justify-between"
                  style={{
                    background: over ? "var(--i-red-soft)" : "var(--i-panel)",
                    border: `1px solid ${over ? "rgba(239,107,91,0.4)" : "var(--i-border)"}`,
                  }}
                >
                  <div>
                    <div className="i-label">Physical</div>
                    <div className="i-readout text-[15px] mt-1" data-shoot="patch-raw" style={{ color: over ? "var(--i-red)" : "var(--i-text)" }}>
                      {(total * focus.fte).toFixed(2)} FTE
                    </div>
                    <div className="mt-0.5 text-[9.5px] text-[var(--i-text-faint)]">
                      {Math.round(total * 100)}% of one person
                    </div>
                  </div>
                  <div className="text-[var(--i-text-faint)]">→</div>
                  <div className="text-right">
                    <div className="i-label">Effective</div>
                    <div className="i-readout text-[15px] mt-1" data-shoot="patch-effective" style={{ color: "var(--i-amber)" }}>
                      {(splitView?.effectiveFte ?? total * focus.fte).toFixed(2)} FTE
                    </div>
                    <div className="mt-0.5 text-[9.5px] text-[var(--i-text-faint)]">
                      at {contextSwitchCostPct}% switch cost
                    </div>
                  </div>
                </div>

                {over && (
                  <div className="mt-2 text-[10.5px] text-[var(--i-red)]">
                    That is {Math.round(total * 100)}% of one human. Nobody has more than 100% of themselves.
                  </div>
                )}
                {error && <div className="mt-2 text-[10.5px] text-[var(--i-red)]">{error}</div>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
