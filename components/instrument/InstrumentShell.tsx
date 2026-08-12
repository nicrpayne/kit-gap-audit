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

export default function InstrumentShell({
  scopes = [],
  onSelectScope,
  stateBar,
  children,
}: {
  scopes?: CommandScope[];
  onSelectScope?: (scopeId: string) => void;
  /** The instrument's own Reality/Scenario strip, if it has scenario state. */
  stateBar?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [railHidden, setRailHidden] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const dest = destinationFor(pathname);

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
