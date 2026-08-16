"use client";

// LAYERS — the one control that lets the surface stay quiet.
//
// It is presentation only. Nothing here changes what Timeline knows: every
// entry stays in the projection, stays crossable by playback, and stays in
// the data whether or not it is drawn. A layer decides what the FIRST GLANCE
// carries, which is a different question from what is true.
//
// Deliberately not a settings panel. Seven checkboxes, two presets, one
// line of explanation each — a control you can understand without reading
// anything, which is the whole point of the pass it belongs to.

import { useEffect, useRef, useState } from "react";
import { LAYERS, STORY_LAYERS, ALL_LAYERS, isStoryDefault, isEverything, type LayerState } from "@/lib/timeline/story";

export default function LayersControl({
  value, onChange,
}: {
  value: LayerState;
  onChange: (next: LayerState) => void;
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

  const story = isStoryDefault(value);
  const everything = isEverything(value);
  const onCount = LAYERS.filter((l) => value[l.key]).length;

  return (
    <div ref={host} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        data-shoot="layers-toggle"
        aria-expanded={open}
        className="rounded-md px-2.5 py-2 text-[10px] hover:brightness-125 transition-[filter]"
        style={{
          background: open ? "var(--i-panel-raised)" : "linear-gradient(180deg, #262f35 0%, #131a1e 100%)",
          border: `1px solid ${open ? "var(--i-text-faint)" : "var(--i-border-strong)"}`,
          color: "var(--i-text-soft)",
        }}
      >
        Layers{story ? "" : everything ? " · all" : ` · ${onCount}`}
      </button>

      {open && (
        <div
          data-shoot="layers-panel"
          className="absolute right-0 mt-2 rounded-lg overflow-hidden z-50"
          style={{
            width: 268,
            background: "linear-gradient(180deg, var(--i-panel) 0%, #12171a 100%)",
            border: "1px solid var(--i-border-strong)",
            boxShadow: "0 20px 48px rgba(0,0,0,0.72)",
          }}
        >
          <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--i-border)", background: "var(--i-recess)" }}>
            <div className="i-label">Layers</div>
            <div className="text-[9px] text-[var(--i-text-faint)] mt-1">
              What the score draws. Nothing is deleted — playback and the data are unchanged.
            </div>
          </div>

          <div className="p-2 flex gap-1.5" style={{ borderBottom: "1px solid var(--i-border)" }}>
            {[
              { label: "Story", on: story, next: STORY_LAYERS, shoot: "layers-story" },
              { label: "Everything", on: everything, next: ALL_LAYERS, shoot: "layers-everything" },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => onChange({ ...preset.next })}
                data-shoot={preset.shoot}
                className="flex-1 rounded px-2 py-1.5 text-[10px] transition-colors"
                style={{
                  background: preset.on ? "var(--i-violet)" : "var(--i-panel-raised)",
                  color: preset.on ? "var(--i-void)" : "var(--i-text-soft)",
                  border: `1px solid ${preset.on ? "var(--i-violet)" : "var(--i-border-strong)"}`,
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="py-1">
            {LAYERS.map((l) => {
              const on = value[l.key];
              return (
                <button
                  key={l.key}
                  onClick={() => onChange({ ...value, [l.key]: !on })}
                  data-shoot={`layer-${l.key}`}
                  data-on={on || undefined}
                  className="w-full flex items-start gap-2.5 px-3 py-[7px] text-left hover:brightness-125 transition-[filter]"
                >
                  <span
                    className="mt-[2px] shrink-0 rounded-[3px] flex items-center justify-center"
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
                  <span className="min-w-0">
                    <span className="block text-[11px] leading-none text-[var(--i-text)]">{l.label}</span>
                    <span className="block text-[9px] text-[var(--i-text-faint)] mt-1">{l.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
