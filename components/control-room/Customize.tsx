"use client";

// CHOOSING WHAT TO LOOK AT.
//
// This dialog edits a VIEW PREFERENCE in this browser and nothing else. It
// never writes to the project, never touches a Scenario, and the page says
// so on its face — because a control that hides "Capacity" sitting next to
// controls that change capacity has to be unambiguous about which it is.

import { PANELS, PRESETS, type PanelGroup, type PanelId, type Workspace, visiblePanels } from "@/lib/control-room/workspace";

const GROUPS: PanelGroup[] = ["Summary", "Centre", "Rail", "Lenses"];

const GROUP_NOTE: Record<PanelGroup, string> = {
  Summary: "The five questions across the top.",
  Centre: "The large surface in the middle.",
  Rail: "The column on the right.",
  Lenses: "The row along the bottom.",
};

export default function Customize({
  workspace,
  onToggle,
  onPreset,
  onReset,
  onClose,
}: {
  workspace: Workspace;
  onToggle: (id: PanelId) => void;
  onPreset: (id: Workspace["preset"]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const visible = visiblePanels(workspace);

  return (
    <div
      data-shoot="cr-customize"
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(6, 9, 11, 0.72)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-[560px] flex-col overflow-hidden rounded-xl"
        style={{ background: "var(--i-panel)", border: "1px solid var(--i-border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex shrink-0 items-baseline justify-between gap-4 px-5 py-4"
          style={{ borderBottom: "1px solid var(--i-border)" }}
        >
          <div>
            <h2 className="text-[14px] font-medium tracking-tight" style={{ color: "var(--i-text)" }}>
              Customize workspace
            </h2>
            <p className="pt-1 text-[11px]" style={{ color: "var(--i-text-faint)" }}>
              Saved in this browser only. Changes nothing about the project.
            </p>
          </div>
          <button
            data-shoot="cr-customize-close"
            onClick={onClose}
            className="rounded px-2.5 py-1 text-[11px]"
            style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
          >
            Done
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="i-label pb-2" style={{ color: "var(--i-text-soft)" }}>
            Preset
          </p>
          <div className="grid grid-cols-2 gap-2 pb-5">
            {PRESETS.map((p) => {
              const on = workspace.preset === p.id;
              return (
                <button
                  key={p.id}
                  data-shoot={`cr-preset-${p.id}`}
                  data-on={on}
                  onClick={() => onPreset(p.id)}
                  className="rounded-lg px-3 py-2 text-left transition-colors"
                  style={{
                    background: on ? "var(--i-panel-raised)" : "transparent",
                    border: `1px solid ${on ? "var(--i-border-strong)" : "var(--i-border)"}`,
                  }}
                >
                  <span className="block text-[12px]" style={{ color: on ? "var(--i-text)" : "var(--i-text-soft)" }}>
                    {p.label}
                  </span>
                  <span className="block pt-0.5 text-[10.5px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
                    {p.note}
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
                {PANELS.filter((p) => p.group === g).map((p) => {
                  const on = visible.has(p.id);
                  return (
                    <button
                      key={p.id}
                      data-shoot={`cr-toggle-${p.id}`}
                      data-on={on}
                      onClick={() => onToggle(p.id)}
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
                        <span className="block text-[12px]" style={{ color: on ? "var(--i-text)" : "var(--i-text-faint)" }}>
                          {p.label}
                        </span>
                        <span className="block text-[10.5px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
                          {p.note}
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
            {visible.size} of {PANELS.length} panels shown
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
