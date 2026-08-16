"use client";

// WHICH PROJECTS THIS TIMELINE SHOWS.
//
// PRESENTATION ONLY, and the distinction matters more here than anywhere
// else on the surface, because the same gesture means two very different
// things in ordinary speech:
//
//   "take iTrack off my Timeline"       -> a view. This control.
//   "iTrack isn't in this release"      -> product composition. SCOPE owns
//                                          that, and Timeline must not
//                                          quietly do it on Scope's behalf.
//
// So hiding a lane here removes nothing: the Scope still exists, still
// forecasts, still gates whatever it gated, and still appears the moment
// it is shown again. Nothing about Reality can be changed from this menu,
// which is exactly why it is safe to make it one click.

import { useEffect, useRef, useState } from "react";
import type { TimelineLane } from "@/lib/timeline/entries";

export interface LaneView {
  hidden: string[];
  /** Scope ids in display order. Ids absent from this list fall to the end
      in their natural (Scope-created) order, so a new project appears
      rather than silently vanishing behind a stale ordering. */
  order: string[];
}

export const EMPTY_LANE_VIEW: LaneView = { hidden: [], order: [] };

/** Apply a view to the projection's lanes. Pure, and the only place the
    two arrays are interpreted. */
export function applyLaneView<T extends { scopeId: string }>(lanes: T[], view: LaneView): T[] {
  const rank = new Map(view.order.map((id, i) => [id, i]));
  const hidden = new Set(view.hidden);
  return lanes
    .filter((l) => !hidden.has(l.scopeId))
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const ra = rank.get(a.l.scopeId) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.l.scopeId) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.i - b.i;
    })
    .map(({ l }) => l);
}

export default function LanesControl({
  lanes, value, onChange,
}: {
  lanes: TimelineLane[];
  value: LaneView;
  onChange: (next: LaneView) => void;
}) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (host.current && !host.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ordered = applyLaneView(lanes, { hidden: [], order: value.order });
  const hidden = new Set(value.hidden);
  const shown = lanes.length - hidden.size;

  const move = (scopeId: string, dir: -1 | 1) => {
    const ids = ordered.map((l) => l.scopeId);
    const i = ids.indexOf(scopeId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onChange({ ...value, order: ids });
  };

  return (
    <div ref={host} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        data-shoot="lanes-toggle"
        aria-expanded={open}
        className="rounded-md px-2.5 py-2 text-[10px] hover:brightness-125 transition-[filter]"
        style={{
          background: open ? "var(--i-panel-raised)" : "linear-gradient(180deg, #262f35 0%, #131a1e 100%)",
          border: `1px solid ${open ? "var(--i-text-faint)" : "var(--i-border-strong)"}`,
          color: "var(--i-text-soft)",
        }}
      >
        Projects{hidden.size > 0 ? ` · ${shown}/${lanes.length}` : ""}
      </button>

      {open && (
        <div
          data-shoot="lanes-panel"
          className="absolute right-0 mt-2 rounded-lg overflow-hidden z-50"
          style={{
            width: 284,
            background: "linear-gradient(180deg, var(--i-panel) 0%, #12171a 100%)",
            border: "1px solid var(--i-border-strong)",
            boxShadow: "0 20px 48px rgba(0,0,0,0.72)",
          }}
        >
          <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--i-border)", background: "var(--i-recess)" }}>
            <div className="i-label">Projects on this timeline</div>
            <div className="text-[9px] text-[var(--i-text-faint)] mt-1">
              A view, not the release. Hiding a project here changes nothing in Scope,
              Forecast or Portfolio.
            </div>
          </div>

          <div className="py-1 max-h-[340px] overflow-y-auto">
            {ordered.map((lane, i) => {
              const on = !hidden.has(lane.scopeId);
              return (
                <div key={lane.scopeId} className="flex items-center gap-1 px-2 py-[5px]" data-shoot={`lane-row-${lane.scopeId}`}>
                  <button
                    onClick={() =>
                      onChange({
                        ...value,
                        hidden: on ? [...value.hidden, lane.scopeId] : value.hidden.filter((h) => h !== lane.scopeId),
                        order: value.order.length ? value.order : ordered.map((l) => l.scopeId),
                      })
                    }
                    data-shoot={`lane-visible-${lane.scopeId}`}
                    data-on={on || undefined}
                    className="flex-1 min-w-0 flex items-center gap-2.5 text-left hover:brightness-125 transition-[filter] px-1 py-0.5"
                  >
                    <span
                      className="shrink-0 rounded-[3px] flex items-center justify-center"
                      style={{
                        width: 13, height: 13,
                        background: on ? "var(--i-violet)" : "var(--i-void)",
                        border: `1px solid ${on ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                      }}
                    >
                      {on && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="var(--i-void)" strokeWidth="1.7">
                          <path d="M1.5 4.2 L3.2 6 L6.6 2.2" />
                        </svg>
                      )}
                    </span>
                    <span
                      className="text-[11px] truncate"
                      style={{ color: on ? "var(--i-text)" : "var(--i-text-faint)" }}
                    >
                      {lane.name}
                    </span>
                  </button>
                  <div className="shrink-0 flex">
                    {([-1, 1] as const).map((dir) => (
                      <button
                        key={dir}
                        onClick={() => move(lane.scopeId, dir)}
                        disabled={dir === -1 ? i === 0 : i === ordered.length - 1}
                        data-shoot={`lane-${dir === -1 ? "up" : "down"}-${lane.scopeId}`}
                        className="px-1 py-1 disabled:opacity-20 hover:brightness-150 transition-[filter]"
                        title={dir === -1 ? "Move up" : "Move down"}
                      >
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="var(--i-text-soft)" strokeWidth="1.4">
                          {dir === -1 ? <path d="M2 6.5 L5 3.5 L8 6.5" /> : <path d="M2 3.5 L5 6.5 L8 3.5" />}
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {(hidden.size > 0 || value.order.length > 0) && (
            <button
              onClick={() => onChange(EMPTY_LANE_VIEW)}
              data-shoot="lanes-reset"
              className="w-full px-3 py-2 text-[10px] text-left hover:brightness-125"
              style={{ borderTop: "1px solid var(--i-border)", color: "var(--i-text-soft)" }}
            >
              Show every project, in Scope&rsquo;s order
            </button>
          )}
        </div>
      )}
    </div>
  );
}
