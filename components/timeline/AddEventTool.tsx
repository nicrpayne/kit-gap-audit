"use client";

// ADD / EDIT A LANDMARK.
//
// Deliberately six fields. The pull toward a task tracker is strong here —
// an owner, a status, a percent complete, subtasks — and every one of them
// would turn the score into Jira with a horizontal axis. A landmark is a
// moment with a name.
//
// The one field that carries real weight is STATE. It is asked explicitly,
// never inferred from the date, because "planned" and "occurred" are
// different claims about the world and only the person adding it knows
// which one they mean.

import { useEffect, useState } from "react";
import type { TimelineLane, TimelineEntry } from "@/lib/timeline/entries";

const KINDS = ["event", "milestone", "kickoff", "delivery", "phase"] as const;

interface Props {
  lanes: TimelineLane[];
  editing: TimelineEntry | null;
  defaultScopeId: string | null;
  defaultDate: number;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    scopeId: string; title: string; date: string; endDate: string | null;
    temporalState: "occurred" | "planned"; kind: string; note: string | null;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export default function AddEventTool({ lanes, editing, defaultScopeId, defaultDate, onClose, onSave, onDelete }: Props) {
  const [scopeId, setScopeId] = useState(editing?.scopeId ?? defaultScopeId ?? lanes[0]?.scopeId ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(isoDay(editing ? new Date(editing.date).getTime() : defaultDate));
  const [endDate, setEndDate] = useState(editing?.endDate ? isoDay(new Date(editing.endDate).getTime()) : "");
  const [state, setState] = useState<"occurred" | "planned">(editing?.temporalState ?? "occurred");
  const [kind, setKind] = useState<string>(
    editing ? String((editing.detail as { landmarkKind?: string }).landmarkKind ?? "event") : "event"
  );
  const [note, setNote] = useState(
    editing ? String((editing.detail as { note?: string | null }).note ?? "") : ""
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const field = {
    background: "var(--i-void)",
    border: "1px solid var(--i-border-strong)",
    color: "var(--i-text)",
  } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        data-shoot="add-event-tool"
        className="rounded-lg overflow-hidden"
        style={{ width: 460, background: "var(--i-panel)", border: "1px solid var(--i-border-strong)", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}
      >
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--i-border)" }}>
          <div className="i-label">{editing ? "Edit landmark" : "Add event"}</div>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">Project</label>
            <select
              value={scopeId} onChange={(e) => setScopeId(e.target.value)} data-shoot="event-scope"
              className="mt-1 w-full rounded px-2 py-1.5 text-[11px]" style={field}
            >
              {lanes.map((l) => <option key={l.scopeId} value={l.scopeId}>{l.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">
              What happened / what is planned?
            </label>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)} autoFocus data-shoot="event-title"
              placeholder="Electric kickoff"
              className="mt-1 w-full rounded px-2 py-1.5 text-[11px]" style={field}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">When</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-shoot="event-date"
                className="mt-1 w-full rounded px-2 py-1.5 text-[11px]" style={field} />
            </div>
            <div className="flex-1">
              <label className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">End (optional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-shoot="event-end"
                className="mt-1 w-full rounded px-2 py-1.5 text-[11px]" style={field} />
            </div>
          </div>

          <div>
            <label className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">State</label>
            <div className="mt-1 flex rounded overflow-hidden" style={{ border: "1px solid var(--i-border-strong)" }}>
              {(["occurred", "planned"] as const).map((s) => (
                <button
                  key={s} onClick={() => setState(s)} data-shoot={`event-state-${s}`}
                  className="flex-1 py-1.5 text-[10px] uppercase tracking-[0.12em] transition-colors"
                  style={{
                    background: state === s ? (s === "planned" ? "var(--i-panel-raised)" : "var(--i-signal)") : "var(--i-void)",
                    color: state === s ? (s === "planned" ? "var(--i-text)" : "var(--i-void)") : "var(--i-text-faint)",
                    borderRight: s === "occurred" ? "1px solid var(--i-border-strong)" : undefined,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[9px] text-[var(--i-text-faint)]">
              Stored as stated. A planned landmark stays planned after its date passes — it becomes overdue, not history.
            </p>
          </div>

          <div>
            <label className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">Kind</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} data-shoot="event-kind"
              className="mt-1 w-full rounded px-2 py-1.5 text-[11px]" style={field}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} data-shoot="event-note"
              className="mt-1 w-full rounded px-2 py-1.5 text-[11px] resize-none" style={field} />
          </div>

          {err && <div className="text-[10px]" style={{ color: "var(--i-red)" }}>{err}</div>}
        </div>

        <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: "1px solid var(--i-border)" }}>
          {editing && onDelete && (
            <button
              onClick={async () => { setBusy(true); try { await onDelete(editing.id); } finally { setBusy(false); } }}
              data-shoot="event-delete" disabled={busy}
              className="rounded px-3 py-1.5 text-[10px] disabled:opacity-40"
              style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-red)" }}
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded px-3 py-1.5 text-[10px] text-[var(--i-text-soft)]"
            style={{ border: "1px solid var(--i-border-strong)" }}>
            Cancel
          </button>
          <button
            data-shoot="event-save"
            disabled={busy || !title.trim() || !date || !scopeId}
            onClick={async () => {
              setErr(null); setBusy(true);
              try {
                await onSave({
                  id: editing?.id,
                  scopeId,
                  title: title.trim(),
                  date: new Date(`${date}T12:00:00Z`).toISOString(),
                  endDate: endDate ? new Date(`${endDate}T12:00:00Z`).toISOString() : null,
                  temporalState: state,
                  kind,
                  note: note.trim() || null,
                });
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Could not save");
              } finally {
                setBusy(false);
              }
            }}
            className="rounded px-4 py-1.5 text-[10px] font-medium disabled:opacity-35 hover:brightness-110"
            style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
