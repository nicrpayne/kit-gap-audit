"use client";

// The chrome every instrument wears: the rail, one state strip, the command
// menu, and focus mode. Extracted from Portfolio so the suite cannot drift
// into seven slightly different headers -- the rail is identical everywhere,
// which is what makes these read as sibling instruments rather than as seven
// pages that happen to be dark.

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import InstrumentRail from "@/components/instrument/InstrumentRail";
import CommandMenu, { type CommandScope } from "@/components/instrument/CommandMenu";
import { destinationFor } from "@/lib/shell/mode";

/** Below this, a dense control surface cannot show its controls without
    clipping them — QA found the Timeline still losing playback, snap and
    zoom at 768px, and the Decisions inspector covering the workspace with
    its close button off-screen. Instruments default to requiring it;
    reading surfaces opt out with 0. */
export const INSTRUMENT_MIN_WIDTH = 1024;

export default function InstrumentShell({
  scopes = [],
  onSelectScope,
  stateBar,
  minViewportWidth = INSTRUMENT_MIN_WIDTH,
  children,
}: {
  scopes?: CommandScope[];
  onSelectScope?: (scopeId: string) => void;
  /** The instrument's own Reality/Scenario strip, if it has scenario state. */
  stateBar?: ReactNode;
  /** Narrowest viewport this surface can be honest at. 0 means "any width" —
      the reading surfaces pass that, because prose reflows and a form does
      not have controls to lose. */
  minViewportWidth?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [railHidden, setRailHidden] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const dest = destinationFor(pathname);

  // MEASURED, NOT GUESSED. Starts null so the first client render matches
  // the server's (which cannot know the width) and hydration stays clean;
  // the check only applies once a real measurement exists.
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => setViewportWidth(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const tooNarrow = minViewportWidth > 0 && viewportWidth !== null && viewportWidth < minViewportWidth;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
      if (meta && e.key === "\\") {
        e.preventDefault();
        setRailHidden((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="instrument fixed inset-0 flex overflow-hidden">
      <InstrumentRail
        pathname={pathname}
        hidden={railHidden}
        onToggle={() => setRailHidden((v) => !v)}
        onOpenCommand={() => setCommandOpen(true)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* AN HONEST MESSAGE INSTEAD OF A CLIPPED INSTRUMENT.
            The rail stays mounted beside this, so navigation still works and
            the reading surfaces — which are perfectly usable at this width —
            remain one tap away. Rendering the instrument here is what
            produced the trap: controls existing in a region with no way to
            scroll to them. */}
        {tooNarrow ? (
          <div
            data-shoot="viewport-too-narrow"
            className="flex flex-1 items-center justify-center overflow-y-auto p-8"
            style={{ background: "var(--i-bg)" }}
          >
            <div className="max-w-[34ch] text-center">
              <div className="i-label mb-3" style={{ color: "var(--i-amber)" }}>
                Needs a wider screen
              </div>
              <h2 className="font-display mb-3 text-[22px] leading-tight text-[var(--i-text)]">
                {dest?.label ?? "This instrument"} needs at least {minViewportWidth}px
              </h2>
              <p className="text-[13px] leading-[1.6] text-[var(--i-text-soft)]">
                It is a dense control surface, and at {viewportWidth}px its controls would be cut
                off with no way to reach them. Rather than show you a version you cannot operate,
                it is asking for a larger window.
              </p>
              <p className="mt-3 text-[13px] leading-[1.6] text-[var(--i-text-soft)]">
                Audit, Reports and Settings work at this size — they are in the rail.
              </p>
            </div>
          </div>
        ) : (
          <>
        {stateBar ?? (
          // Surfaces with no scenario state still get an identity strip, so
          // "which instrument am I in and what does it own" is answerable
          // without reading the whole screen.
          <div
            className="shrink-0 flex items-center gap-3 px-4 py-2.5"
            style={{ background: "var(--i-panel)", borderBottom: "1px solid var(--i-border)" }}
          >
            <span className="text-[12px] font-medium text-[var(--i-text)]">{dest?.label ?? "Instrument"}</span>
            {dest && <span className="text-[11px] text-[var(--i-text-faint)] truncate">{dest.owns}</span>}
          </div>
        )}
            {children}
          </>
        )}
      </div>
      <CommandMenu
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        scopes={scopes}
        onSelectScope={onSelectScope ?? (() => {})}
      />
    </div>
  );
}
