"use client";

// INTELLIGENCE — what does the machine think we are missing, wrong about, or
// unsure of? Challenge the model.
//
// The one place in the suite that is allowed to be dense, because you came
// here on purpose. Everything is ranked rather than filtered by default:
// blocking first, then unrepresented obligations, then the rest.
//
// The organising idea is EPISTEMIC STATUS. The machine is not equally sure of
// everything, so how it knows a thing is shown next to the thing, in human
// words. Promotion into Reality (ticketing, resolving, dismissing) is owned by
// the audit source detail, which this hands off to rather than duplicating.

import { useMemo, useState } from "react";
import Link from "next/link";
import InstrumentShell from "@/components/instrument/InstrumentShell";
import { Panel, EpistemicBadge, SeverityDot, Stat, type Epistemic } from "@/components/instrument/Panel";
import { useProject, fmtDay } from "@/lib/instrument/useProject";
import type { ProjectFinding } from "@/lib/instrument/useProject";

// Derived from what the record actually says -- never asserted beyond it.
function epistemicOf(f: ProjectFinding): Epistemic {
  if (f.status === "resolved" || f.status === "ticketed") return "accepted";
  if (f.type === "decision" && f.blocking) return "needs-clarification";
  if (f.matchedIssues.length > 1) return "cross-source";
  if (f.type === "missing_work" && f.matchedIssues.length === 0) return "inferred";
  return "observed";
}

const LENSES = [
  { id: "all", label: "Everything" },
  { id: "blocking", label: "Blocking" },
  { id: "unrepresented", label: "No ticket" },
  { id: "inferred", label: "Inferred" },
] as const;
type Lens = (typeof LENSES)[number]["id"];

export default function IntelligenceInstrument() {
  const m = useProject();
  const [lens, setLens] = useState<Lens>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const sourceById = useMemo(() => new Map((m.data?.sources ?? []).map((s) => [s.id, s])), [m.data]);

  const ranked = useMemo(() => {
    const open = (m.data?.findings ?? []).filter((f) => f.status === "open" || f.status === "ticketed");
    const score = (f: ProjectFinding) =>
      (f.blocking ? 1000 : 0) +
      (f.severity === "high" ? 300 : f.severity === "medium" ? 150 : 0) +
      (f.type === "missing_work" && f.matchedIssues.length === 0 ? 120 : 0);
    const filtered = open.filter((f) => {
      if (lens === "blocking") return f.blocking;
      if (lens === "unrepresented") return f.type === "missing_work" && f.matchedIssues.length === 0;
      if (lens === "inferred") return epistemicOf(f) === "inferred";
      return true;
    });
    return filtered.sort((a, b) => score(b) - score(a));
  }, [m.data, lens]);

  if (!m.data)
    return (
      <InstrumentShell>
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--i-text-faint)]">
          {m.error ?? "Loading…"}
        </div>
      </InstrumentShell>
    );

  const all = m.data.findings;
  const openCount = all.filter((f) => f.status === "open").length;
  const unrepresented = all.filter((f) => f.type === "missing_work" && f.matchedIssues.length === 0 && f.status === "open");
  const blockingCount = all.filter((f) => f.blocking && f.status === "open").length;

  return (
    <InstrumentShell scopes={m.data.scopes.map((s) => ({ scopeId: s.scopeId, name: s.name }))}>
      <div className="flex-1 min-h-0 flex gap-3 p-3 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-hidden">
          <div
            className="shrink-0 grid gap-px"
            style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", background: "var(--i-border)", borderRadius: 8 }}
          >
            {[
              <Stat key="a" label="Open findings" value={String(openCount)} sub="across every source" />,
              <Stat
                key="b"
                label="Blocking"
                value={String(blockingCount)}
                tone={blockingCount ? "var(--i-red)" : "var(--i-mint)"}
                sub="holding work up right now"
              />,
              <Stat
                key="c"
                label="No ticket anywhere"
                value={String(unrepresented.length)}
                tone={unrepresented.length ? "var(--i-violet)" : "var(--i-mint)"}
                sub="obligations the plan doesn't represent"
              />,
            ].map((el, i) => (
              <div key={i} className="px-4 py-3" style={{ background: "var(--i-panel)" }}>
                {el}
              </div>
            ))}
          </div>

          <Panel
            title="Findings"
            subtitle={`${ranked.length} shown, ranked by consequence`}
            accent="var(--i-amber)"
            dense
            dataShoot="panel-findings"
            actions={
              <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ background: "var(--i-void)" }}>
                {LENSES.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setLens(l.id)}
                    className="rounded px-2 py-0.5 text-[10px] transition-colors"
                    style={{
                      background: lens === l.id ? "var(--i-panel-raised)" : "transparent",
                      color: lens === l.id ? "var(--i-text)" : "var(--i-text-faint)",
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            }
          >
            <ul className="space-y-1.5">
              {ranked.map((f) => {
                const expanded = openId === f.id;
                // A package-derived Finding has no Source by design (Context
                // Phase 1b), so there is nothing to look up — the source
                // suffix and the "see the source" link below both already
                // render only when one exists.
                const src = f.sourceId ? sourceById.get(f.sourceId) : undefined;
                return (
                  <li
                    key={f.id}
                    className="rounded-md"
                    style={{ background: "var(--i-panel-raised)", border: "1px solid var(--i-border)" }}
                  >
                    <button
                      onClick={() => setOpenId(expanded ? null : f.id)}
                      className="w-full text-left flex items-start gap-2.5 px-3 py-2.5"
                    >
                      <SeverityDot severity={f.severity} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] text-[var(--i-text)] leading-snug">{f.title}</span>
                        <span className="mt-1 flex items-center gap-2 flex-wrap">
                          <EpistemicBadge kind={epistemicOf(f)} />
                          <span className="text-[10px] text-[var(--i-text-faint)]">
                            {f.type.replace("_", " ")}
                            {f.blocking ? " · blocking" : ""}
                            {src ? ` · ${src.title}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] text-[var(--i-text-faint)]">
                        {fmtDay(new Date(f.createdAt))}
                      </span>
                    </button>
                    {expanded && (
                      <div className="px-3 pb-3 space-y-2.5" style={{ borderTop: "1px solid var(--i-border)" }}>
                        <blockquote
                          className="mt-2.5 text-[11px] italic text-[var(--i-text-soft)] pl-2.5"
                          style={{ borderLeft: "2px solid var(--i-border-strong)" }}
                        >
                          “{f.quote}”
                        </blockquote>
                        <p className="text-[11px] text-[var(--i-text-soft)] leading-relaxed">{f.rationale}</p>
                        <dl className="grid gap-x-4 gap-y-1 text-[10.5px]" style={{ gridTemplateColumns: "auto 1fr" }}>
                          {f.owner && (
                            <>
                              <dt className="i-label">Owner</dt>
                              <dd className="text-[var(--i-text-soft)]">{f.owner}</dd>
                            </>
                          )}
                          {f.blocks && (
                            <>
                              <dt className="i-label">Blocks</dt>
                              <dd className="text-[var(--i-text-soft)]">{f.blocks}</dd>
                            </>
                          )}
                          {f.estimateHint && (
                            <>
                              <dt className="i-label">Size</dt>
                              <dd className="text-[var(--i-text-soft)]">{f.estimateHint}</dd>
                            </>
                          )}
                          <dt className="i-label">Tickets</dt>
                          <dd className="text-[var(--i-text-soft)]">
                            {f.matchedIssues.length > 0 ? f.matchedIssues.join(", ") : "none — not represented in Linear"}
                          </dd>
                        </dl>
                        <div className="flex items-center gap-3 pt-1">
                          {src && (
                            <Link
                              href={`/audit/${src.id}`}
                              className="text-[10.5px] text-[var(--i-violet)] hover:brightness-125"
                            >
                              Open the source to act on this →
                            </Link>
                          )}
                          {f.type === "decision" && (
                            <Link
                              href="/decisions"
                              className="text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text)]"
                            >
                              Decisions →
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {ranked.length === 0 && (
                <li className="text-[11.5px] text-[var(--i-text-faint)] p-3">
                  Nothing under this lens. The machine has no open objection here.
                </li>
              )}
            </ul>
          </Panel>
        </div>

        <aside className="shrink-0 w-[280px] space-y-3 overflow-auto">
          <Panel title="Sources" subtitle={`${m.data.sources.length}`} accent="var(--i-violet)" dense>
            <ul className="space-y-px">
              {m.data.sources.map((s) => {
                const n = all.filter((f) => f.sourceId === s.id).length;
                return (
                  <li key={s.id}>
                    <Link
                      href={`/audit/${s.id}`}
                      className="flex items-start justify-between gap-2 rounded px-2 py-2 hover:bg-[var(--i-panel-raised)] transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-[11.5px] text-[var(--i-text)] truncate">{s.title}</span>
                        <span className="block text-[10px] text-[var(--i-text-faint)]">
                          {s.kind} · {fmtDay(new Date(s.createdAt))}
                        </span>
                      </span>
                      <span className="shrink-0 i-readout text-[11px] text-[var(--i-text-soft)]">{n}</span>
                    </Link>
                  </li>
                );
              })}
              {m.data.sources.length === 0 && (
                <li className="text-[11.5px] text-[var(--i-text-faint)] p-2">Nothing ingested yet.</li>
              )}
            </ul>
            <Link
              href="/audit/new"
              className="mt-2 block rounded-md px-2.5 py-2 text-center text-[11px] font-medium"
              style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
            >
              Run a new audit
            </Link>
          </Panel>

          <Panel title="How to read status" accent="var(--i-text-faint)" dense>
            <ul className="space-y-2 p-1">
              {(["observed", "cross-source", "inferred", "needs-clarification", "accepted"] as Epistemic[]).map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <EpistemicBadge kind={k} />
                </li>
              ))}
            </ul>
            <p className="mt-2 p-1 text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">
              Hover any badge for what it means. Only <em>accepted</em> items are things the model treats as true.
            </p>
          </Panel>
        </aside>
      </div>
    </InstrumentShell>
  );
}
