"use client";

// SIGNAL AUDIT — THE INSTRUMENT.
//
// Audit used to be a reading surface: a list of past runs, wearing
// SignalSurface's centred measure. It is a flagship instrument now, so it
// owns the viewport like Forecast and Timeline do. docs/DESIGN-NORTH-STAR.md
// has been updated to match rather than left to disagree with the code.
//
// ONE FETCH, THEN PURE CLIENT WORK. Everything the map draws arrives from
// /api/audit/truth in a single read; selection, hover, focus, Evidence Solo
// and the candidate preview are all local. That is the same constraint the
// design north star places on Portfolio, and it is the reason selection can
// feel instant.
//
// STATE, AND WHAT EACH PIECE IS ALLOWED TO TOUCH:
//
//   selected / hovered   presentation only
//   evidenceSolo         presentation only
//   mode A|B             presentation only — B NEVER writes anything
//   awaitingEvidence     session only, and labelled as such on screen
//   sweep                presentation only
//
// The only writes are the explicit human actions dispatched from the review
// console, and each of them goes through an existing, confirmed API route.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { TruthMapModel } from "@/lib/audit/truth";
import type { FindingProvenance, groundingLabel } from "@/lib/audit/provenance";
import type { PrimaryAction, ActionId } from "@/lib/audit/actions";
import { mutateReality } from "@/lib/instrument/reality";
import ProjectTruthMap from "./ProjectTruthMap";
import FindingInspector from "./FindingInspector";
import AuditReviewConsole, { type ConsoleMode } from "./AuditReviewConsole";
import { STATE_COLOR } from "./tokens";
import { IconHolder, LANE_ICONS, RealityIcon } from "./icons";

type Provenance = FindingProvenance & { grounding: ReturnType<typeof groundingLabel> };

interface TruthPayload {
  scopes: { id: string; name: string }[];
  scope: { id: string; name: string; targetDate: string | null };
  model: TruthMapModel;
  provenance: Record<string, Provenance>;
  linearError: string | null;
}

type Filter = "all" | "critical" | "human" | "handled";

const SWEEP_MS = 2300;

export default function AuditInstrument({ initialScopeId }: { initialScopeId?: string }) {
  const [scopeId, setScopeId] = useState<string | undefined>(initialScopeId);
  const [data, setData] = useState<TruthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [evidenceSolo, setEvidenceSolo] = useState(false);
  const [mode, setMode] = useState<ConsoleMode>("A");
  const [filter, setFilter] = useState<Filter>("all");
  const [awaiting, setAwaiting] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState<ActionId | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [sweepAngle, setSweepAngle] = useState<number | null>(null);
  const [sweepNote, setSweepNote] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  const load = useCallback(async (id?: string) => {
    const res = await fetch(`/api/audit/truth${id ? `?scope=${encodeURIComponent(id)}` : ""}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "The truth map could not be read.");
      return null;
    }
    const payload = (await res.json()) as TruthPayload;
    setData(payload);
    setError(null);
    return payload;
  }, []);

  useEffect(() => {
    void load(scopeId);
  }, [load, scopeId]);

  // Selection is a place you can leave, from the keyboard as well as the mouse.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedId) {
        setSelectedId(null);
        setEvidenceSolo(false);
        setMode("A");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const model = data?.model ?? null;
  const selected = useMemo(
    () => (selectedId && model ? model.findings.find((f) => f.id === selectedId) ?? null : null),
    [selectedId, model]
  );

  // Leaving a selection returns the console to A and drops solo — a
  // hypothetical must never outlive the thing it was about.
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setResult(null);
    if (id === null) {
      setEvidenceSolo(false);
      setMode("A");
    }
  }, []);

  // ── RUN AUDIT ────────────────────────────────────────────────────────
  //
  // A REAL PASS, not a decorative one. The sweep runs while every lane's
  // checkpoints are recomputed from live data — the same comparison
  // buildTruthMap performs on load — and the notes name the lane actually
  // being crossed at that moment.
  //
  // It does NOT generate new Findings: that needs new evidence to read, and
  // that path is "New evidence audit" in the header. Saying so keeps the
  // control honest about which of the two things it does.
  const runAudit = useCallback(() => {
    if (sweepAngle != null || !model) return;
    const started = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const refresh = load(scopeId);

    if (reduced) {
      // Respect the preference: do the work, skip the theatre.
      setSweepNote("Re-comparing every lane against Reality…");
      void refresh.then(() => {
        setSweepNote(null);
        setResult({ ok: true, message: "Re-compared every lane against Reality." });
      });
      return;
    }

    const lanes = model.lanes;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / SWEEP_MS);
      const angle = -90 + t * 360;
      setSweepAngle(angle);
      const idx = Math.min(lanes.length - 1, Math.floor(t * lanes.length));
      const lane = lanes[idx];
      if (lane) setSweepNote(noteFor(lane.label, lane.state));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setSweepAngle(null);
        void refresh.then(() => setSweepNote(null));
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [sweepAngle, model, load, scopeId]);

  // ── HUMAN ACTIONS ────────────────────────────────────────────────────
  const runAction = useCallback(
    async (action: PrimaryAction, text: string) => {
      if (!selected) return;
      setResult(null);

      if (action.id === "need_more_evidence") {
        // SESSION ONLY, and the console says so. Persisting this would need
        // a Finding.status value that does not exist.
        setAwaiting((prev) => {
          const next = new Set(prev);
          if (next.has(selected.id)) next.delete(selected.id);
          else next.add(selected.id);
          return next;
        });
        return;
      }

      if (action.id === "correct") {
        setResult({
          ok: false,
          message: "Correct / edit is not implemented yet — it lands with the finding-editing tranche.",
        });
        return;
      }

      setBusy(action.id);
      try {
        const done = await dispatchAction(action.id, selected.id, text);
        setResult(done);
        if (done.ok) {
          await load(scopeId);
          select(null);
        }
      } catch (e) {
        setResult({ ok: false, message: e instanceof Error ? e.message : "That did not go through." });
      } finally {
        setBusy(null);
      }
    },
    [selected, load, scopeId, select]
  );

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8" style={{ background: "var(--i-bg)" }}>
        <div className="max-w-[40ch] text-center">
          <div className="i-label mb-2" style={{ color: "var(--i-amber)" }}>
            Audit could not read the project
          </div>
          <p className="text-[13px] leading-[1.6] text-[var(--i-text-soft)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || !model) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ background: "var(--i-bg)" }}>
        <span className="i-label" style={{ color: "var(--i-text-faint)" }}>
          Reading the project…
        </span>
      </div>
    );
  }

  const visible = filterFindings(model, filter);

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: "var(--i-bg)" }}>
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center gap-4 px-4 py-2.5"
        style={{ background: "var(--i-panel)", borderBottom: "1px solid var(--i-border)" }}
        data-shoot="audit-header"
      >
        <span className="text-[12px] font-medium tracking-[0.16em] text-[var(--i-text)]">SIGNAL AUDIT</span>

        <select
          value={data.scope.id}
          onChange={(e) => {
            setScopeId(e.target.value);
            select(null);
          }}
          aria-label="Project"
          data-shoot="audit-scope"
          className="rounded-md px-2.5 py-1.5 text-[11.5px] outline-none"
          style={{ background: "var(--i-recess)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
        >
          {data.scopes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="flex items-baseline gap-2 text-[11px]">
          <span style={{ color: "var(--i-signal)" }}>
            {model.lastRunAt ? `Current audit · ${fmt(model.lastRunAt)}` : "No audit run recorded"}
          </span>
          {model.priorRunAt && (
            <span style={{ color: "var(--i-text-faint)" }}>↔ Prior · {fmt(model.priorRunAt)}</span>
          )}
        </div>

        {sweepNote && (
          <span data-shoot="sweep-note" className="text-[11px]" style={{ color: "var(--i-signal)" }}>
            {sweepNote}
          </span>
        )}

        <div className="flex-1" />

        {data.linearError && (
          <span className="text-[11px]" style={{ color: "var(--i-amber)" }} data-shoot="linear-error">
            Linear unread — execution lane shown as unsupplied
          </span>
        )}

        <Link
          href="/audit/new"
          className="rounded-md px-2.5 py-1.5 text-[11px] transition-colors hover:bg-white/[0.04]"
          style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
        >
          New evidence audit
        </Link>
        <Link
          href="/audit/history"
          className="text-[11px] transition-colors hover:text-[var(--i-text)]"
          style={{ color: "var(--i-text-faint)" }}
        >
          History
        </Link>

        <button
          type="button"
          onClick={runAudit}
          disabled={sweepAngle != null}
          data-shoot="run-audit"
          className="rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-50"
          style={{
            background: "var(--i-signal-soft)",
            border: "1px solid var(--i-signal)",
            color: "var(--i-signal)",
          }}
        >
          {sweepAngle != null ? "Scanning…" : "Run audit"}
        </button>
      </div>

      {/* ── BODY ──────────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "248px minmax(0,1fr) minmax(340px,380px)" }}>
        {/* PROJECT FIELD — the lanes, grouped by what owns them. */}
        <div
          className="flex min-h-0 flex-col overflow-y-auto i-noscrollbar"
          style={{ background: "var(--i-panel)", borderRight: "1px solid var(--i-border)" }}
          data-shoot="project-field"
        >
          <div className="px-4 pt-4">
            <div className="i-label" style={{ color: "var(--i-text-faint)" }}>
              Project field
            </div>
          </div>

          <LaneGroup title="Reality / model">
            <div
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2"
              style={{ background: "var(--i-signal-soft)", border: "1px solid color-mix(in srgb, var(--i-signal) 40%, transparent)" }}
            >
              <IconHolder tone="var(--i-signal)" size={24}>
                <RealityIcon size={14} />
              </IconHolder>
              <span className="flex-1 text-[12px] text-[var(--i-text)]">Reality</span>
              <span className="text-[9px] uppercase tracking-[0.13em]" style={{ color: "var(--i-signal)" }}>
                Accepted
              </span>
            </div>
            {model.lanes
              .filter((l) => l.family === "model")
              .map((lane) => (
                <LaneRow key={lane.id} lane={lane} onSelect={select} />
              ))}
          </LaneGroup>

          <LaneGroup title="Evidence / external">
            {model.lanes
              .filter((l) => l.family === "evidence")
              .map((lane) => (
                <LaneRow key={lane.id} lane={lane} onSelect={select} />
              ))}
          </LaneGroup>
          <div className="flex-1" />
        </div>

        {/* THE MAP */}
        <div className="flex min-h-0 flex-col" data-shoot="map-column">
          <div
            className="flex shrink-0 items-center gap-3 px-4 py-2"
            style={{ borderBottom: "1px solid var(--i-border)" }}
          >
            <span className="i-label" style={{ color: "var(--i-text-soft)" }}>
              Project truth map
            </span>
            <div className="flex-1" />
            {(
              [
                ["all", "All", model.totals.all],
                ["critical", "Critical", model.totals.critical],
                ["human", "Needs human", model.totals.needsHuman],
                ["handled", "Handled", model.totals.handled],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id as Filter)}
                aria-pressed={filter === id}
                data-shoot={`filter-${id}`}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors"
                style={{
                  background: filter === id ? "var(--i-panel-raised)" : "transparent",
                  border: `1px solid ${filter === id ? "var(--i-border-strong)" : "transparent"}`,
                  color: filter === id ? "var(--i-text)" : "var(--i-text-faint)",
                }}
              >
                {label}
                <span
                  className="i-readout text-[11px]"
                  style={{
                    color:
                      id === "critical" && n > 0
                        ? "var(--i-red)"
                        : id === "human" && n > 0
                          ? "var(--i-violet)"
                          : "var(--i-text-soft)",
                  }}
                >
                  {n}
                </span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 p-1">
            <ProjectTruthMap
              model={visible}
              selectedId={selectedId}
              hoveredId={hoveredId}
              evidenceSolo={evidenceSolo}
              candidate={mode === "B"}
              sweepAngle={sweepAngle}
              onSelect={select}
              onHover={setHoveredId}
            />
          </div>
        </div>

        {/* INSPECTOR */}
        <div
          className="flex min-h-0 flex-col"
          style={{ background: "var(--i-panel)", borderLeft: "1px solid var(--i-border)" }}
          data-shoot="inspector"
        >
          <FindingInspector
            model={model}
            finding={selected}
            provenance={selected ? data.provenance[selected.id] ?? null : null}
            onSelect={select}
            onEvidenceSolo={() => setEvidenceSolo(true)}
          />
        </div>
      </div>

      <AuditReviewConsole
        model={model}
        finding={selected}
        evidenceSolo={evidenceSolo}
        onEvidenceSolo={setEvidenceSolo}
        mode={mode}
        onMode={setMode}
        onAction={runAction}
        busy={busy}
        result={result}
        awaitingEvidence={selected ? awaiting.has(selected.id) : false}
        provenance={selected ? data.provenance[selected.id] ?? null : null}
      />
    </div>
  );
}

// ── PIECES ─────────────────────────────────────────────────────────────

function LaneGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4">
      <div className="px-1 pb-2 text-[9px] uppercase tracking-[0.15em]" style={{ color: "var(--i-text-faint)" }}>
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function LaneRow({
  lane,
  onSelect,
}: {
  lane: TruthMapModel["lanes"][number];
  onSelect: (id: string) => void;
}) {
  const Icon = LANE_ICONS[lane.id] ?? LANE_ICONS.evidence;
  const color = STATE_COLOR[lane.state];
  const n = lane.findingIds.length;
  const first = lane.findingIds[0];

  return (
    <button
      type="button"
      disabled={!first}
      onClick={() => first && onSelect(first)}
      data-shoot={`lane-row-${lane.id}`}
      data-state={lane.state}
      title={lane.checkpoints.map((c) => `${c.label}: ${c.detail}`).join("\n")}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors enabled:hover:bg-white/[0.035] disabled:cursor-default"
      style={{ border: "1px solid var(--i-border)", background: "var(--i-panel)" }}
    >
      <IconHolder tone={lane.supplied ? color : "var(--i-reality)"} size={24} filled={lane.supplied}>
        <Icon size={14} />
      </IconHolder>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px]" style={{ color: lane.supplied ? "var(--i-text)" : "var(--i-text-faint)" }}>
          {lane.label}
        </span>
        {/* THE STATE IN WORDS, not only in the icon's colour — and where a
            specific checkpoint is what failed, its NAME rather than a
            generic word. "Owner known" says what to go and fix; "missing"
            only says that something is. */}
        <span className="block truncate text-[9.5px]" style={{ color: lane.supplied ? color : "var(--i-reality)" }}>
          {!lane.supplied ? "Not supplied" : (worstCheckpoint(lane)?.label ?? STATE_WORD[lane.state])}
        </span>
      </span>
      {n > 0 && (
        <span className="i-readout text-[12px]" style={{ color }}>
          {n}
        </span>
      )}
    </button>
  );
}

/** The checkpoint responsible for a lane's state — the first one whose own
    state matches it. Null when the lane is clean, in which case the lane
    shows its state word instead. */
function worstCheckpoint(lane: TruthMapModel["lanes"][number]) {
  if (lane.state === "verified") return null;
  return lane.checkpoints.find((c) => c.state === lane.state) ?? null;
}

const STATE_WORD: Record<string, string> = {
  verified: "Aligned",
  drift: "Drift",
  conflict: "Conflict",
  missing: "Missing",
};

function noteFor(label: string, state: string): string {
  const verb =
    state === "verified" ? "aligned" : state === "drift" ? "drift detected" : state === "conflict" ? "conflict" : "not supplied";
  return `Comparing ${label}… ${verb}`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Filtering hides CALLOUTS, never lanes — the field keeps its shape so the
    map does not appear to change structure when you narrow the list.
    "Handled" is a real view of real rows, not an empty state: those findings
    exist, and they are drawn collapsed into the aligned band. */
function filterFindings(model: TruthMapModel, filter: Filter): TruthMapModel {
  const findings = model.findings.filter((f) => {
    switch (filter) {
      case "all":
        return !f.handled;
      case "handled":
        return f.handled;
      case "critical":
        return !f.handled && f.tier === "critical";
      case "human":
        return !f.handled && f.needsHuman;
    }
  });
  return { ...model, findings };
}

async function dispatchAction(
  id: ActionId,
  findingId: string,
  text: string
): Promise<{ ok: boolean; message: string }> {
  // Every write goes through mutateReality so the rest of the suite learns
  // that persisted truth moved — Decisions and Forecast are looking at the
  // same project and must not keep showing the previous world.
  switch (id) {
    case "open_decision": {
      const res = await mutateReality(`/api/findings/${findingId}/open-decision`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; note?: string };
      return res.ok
        ? { ok: true, message: body.note ?? "Decision opened." }
        : { ok: false, message: body.error ?? "The decision could not be opened." };
    }
    case "add_missing_work": {
      // PREVIEW FIRST, ALWAYS. An unconfirmed POST returns the payload
      // rather than filing anything — the route is built to fail safe.
      const res = await fetch(`/api/findings/${findingId}/ticket`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        preview?: { title?: string };
      };
      if (body.preview) {
        return {
          ok: false,
          message: `Preview ready — "${body.preview.title}". Filing to Linear needs explicit confirmation, which lands with the ticket-confirmation tranche.`,
        };
      }
      return { ok: false, message: body.error ?? "The ticket preview could not be composed." };
    }
    case "record_resolution": {
      const res = await mutateReality(`/api/findings/${findingId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return res.ok
        ? { ok: true, message: "Recorded. The finding is resolved." }
        : { ok: false, message: body.error ?? "That could not be recorded." };
    }
    case "reject": {
      const res = await mutateReality(`/api/findings/${findingId}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return res.ok
        ? { ok: true, message: "Dismissed with your reason." }
        : { ok: false, message: body.error ?? "A reason is required to dismiss a finding." };
    }
    default:
      return { ok: false, message: "That action is not wired up." };
  }
}
