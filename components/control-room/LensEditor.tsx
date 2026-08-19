"use client";

// CHOOSING HOW TO INSPECT THE PROJECT.
//
// A lens is a question. Picking one turns on the surfaces that answer it
// and turns off the ones that do not — that is the whole idea, and it is
// why the lenses are listed by their question rather than by their contents.
//
// This dialog edits a VIEW PREFERENCE in this browser and nothing else. It
// never writes to the project, never touches a Scenario, and says so on its
// own face — because a control that hides "Capacity" sitting next to
// controls that change capacity has to be unambiguous about which it is.

import {
  LENSES,
  SURFACES,
  type LensId,
  type SurfaceGroup,
  type SurfaceId,
  type Workspace,
  visibleSurfaces,
} from "@/lib/control-room/lenses";

const GROUPS: SurfaceGroup[] = ["Field", "Reading", "Rail", "Surfaces"];

const GROUP_NOTE: Record<SurfaceGroup, string> = {
  Field: "The centre of gravity.",
  Reading: "The strip across the top.",
  Rail: "The column on the right.",
  Surfaces: "The row along the bottom.",
};

export default function LensEditor({
  workspace,
  onToggle,
  onLens,
  onReset,
  onClose,
}: {
  workspace: Workspace;
  onToggle: (id: SurfaceId) => void;
  onLens: (id: LensId) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const visible = visibleSurfaces(workspace);

  return (
    <div
      data-shoot="cr-lens-editor"
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(6, 9, 11, 0.74)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-[600px] flex-col overflow-hidden rounded-xl"
        style={{ background: "var(--i-panel)", border: "1px solid var(--i-border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex shrink-0 items-baseline justify-between gap-4 px-5 py-4"
          style={{ borderBottom: "1px solid var(--i-border)" }}
        >
          <div>
            <h2 className="text-[14px] font-medium tracking-tight" style={{ color: "var(--i-text)" }}>
              Lenses
            </h2>
            <p className="pt-1 text-[11px]" style={{ color: "var(--i-text-faint)" }}>
              One project, inspected different ways. Saved in this browser only — changes nothing about the project.
            </p>
          </div>
          <button
            data-shoot="cr-lens-editor-close"
            onClick={onClose}
            className="shrink-0 rounded px-2.5 py-1 text-[11px]"
            style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
          >
            Done
          </button>
        </header>

        <div className="i-noscrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-1.5 pb-5">
            {LENSES.map((l) => {
              const on = workspace.lens === l.id;
              return (
                <button
                  key={l.id}
                  data-shoot={`cr-lens-${l.id}`}
                  data-on={on}
                  onClick={() => onLens(l.id)}
                  className="flex items-baseline gap-3 rounded-lg px-3 py-2 text-left transition-colors"
                  style={{
                    background: on ? "var(--i-panel-raised)" : "transparent",
                    border: `1px solid ${on ? "var(--i-border-strong)" : "var(--i-border)"}`,
                  }}
                >
                  <span
                    className="w-[74px] shrink-0 text-[12px]"
                    style={{ color: on ? "var(--i-text)" : "var(--i-text-soft)" }}
                  >
                    {l.label}
                  </span>
                  <span className="min-w-0 text-[11px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
                    {l.question}
                  </span>
                </button>
              );
            })}
          </div>

          {GROUPS.map((g) => (
            <div key={g} className="pb-4">
              <div className="flex items-baseline gap-2 pb-1.5">
                <p className="i-label" style={{ color: "var(--i-text-soft)" }}>
                  {g}
                </p>
                <p className="text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
                  {GROUP_NOTE[g]}
                </p>
              </div>
              <div className="flex flex-col gap-0.5">
                {SURFACES.filter((s) => s.group === g).map((s) => {
                  const on = visible.has(s.id);
                  return (
                    <button
                      key={s.id}
                      data-shoot={`cr-surface-${s.id}`}
                      data-on={on}
                      onClick={() => onToggle(s.id)}
                      className="flex items-start gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--i-panel-raised)]"
                    >
                      <span
                        aria-hidden
                        className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] text-[9px]"
                        style={{
                          background: on ? "var(--i-signal)" : "transparent",
                          border: `1px solid ${on ? "var(--i-signal)" : "var(--i-border-strong)"}`,
                          color: "var(--i-void)",
                        }}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span className="min-w-0">
                        <span
                          className="block text-[12px]"
                          style={{ color: on ? "var(--i-text)" : "var(--i-text-faint)" }}
                        >
                          {s.label}
                        </span>
                        <span className="block text-[10.5px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
                          {s.note}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <footer
          className="flex shrink-0 items-center justify-between gap-4 px-5 py-3"
          style={{ borderTop: "1px solid var(--i-border)" }}
        >
          <span className="text-[10.5px]" style={{ color: "var(--i-text-faint)" }}>
            {visible.size} of {SURFACES.length} surfaces shown
          </span>
          <button
            data-shoot="cr-reset-workspace"
            onClick={onReset}
            className="rounded px-2.5 py-1 text-[11px]"
            style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
          >
            Reset workspace
          </button>
        </footer>
      </div>
    </div>
  );
}
