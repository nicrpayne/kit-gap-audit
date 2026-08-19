"use client";

// The Instrument's own navigation: a 48px icon rail that replaces the
// Workbench's 256px sidebar for the duration of Instrument Mode, and can be
// hidden outright.
//
// The reasoning is about visual weight, not about features. Navigation on a
// simulation surface is a thing you use for two seconds and then stop
// looking at, so it must not be the second-largest object on screen while
// you are reading a forecast. Every Workbench destination is still here, in
// the same order, from the same list (lib/shell/mode.ts) -- this is a change
// of presentation, not of information architecture.
//
// Hidden entirely (the "⌘\" / chevron state) the simulation owns the full
// viewport, which is what you want when screen-sharing a scenario.

import Link from "next/link";
import { DESTINATIONS } from "@/lib/shell/mode";

// Drawn rather than typed. A 14px text glyph is at the mercy of whatever
// font resolves it, and the two most important marks here (Portfolio and
// Reports) collapse into near-identical blocks in most fallbacks. These are
// six shapes that stay distinct at 14px -- and Portfolio's is a miniature of
// the Forecast Field itself, so the mark for the Instrument depicts the
// Instrument.
const ICONS: Record<string, React.ReactNode> = {
  // A dial with its needle: the surface that reads the whole project and
  // points you at the part that needs you.
  "/control-room": (
    <>
      <circle cx="7" cy="7" r="5.4" fill="none" strokeWidth="1.3" />
      <line x1="7" y1="7" x2="10.2" y2="4.4" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7" cy="7" r="1.1" strokeWidth="0" />
    </>
  ),
  "/overview": (
    <>
      <rect x="1.4" y="1.4" width="5.6" height="7" rx="1.2" fill="none" strokeWidth="1.3" />
      <rect x="8.4" y="1.4" width="4.2" height="4.2" rx="1.2" fill="none" strokeWidth="1.3" />
      <rect x="8.4" y="7" width="4.2" height="5.6" rx="1.2" fill="none" strokeWidth="1.3" />
      <rect x="1.4" y="9.8" width="5.6" height="2.8" rx="1.2" fill="none" strokeWidth="1.3" />
    </>
  ),
  "/scope": (
    <>
      <rect x="1.4" y="2" width="11.2" height="3.4" rx="1.7" fill="none" strokeWidth="1.3" />
      <circle cx="9.8" cy="3.7" r="1.1" strokeWidth="0" />
      <rect x="1.4" y="8.6" width="11.2" height="3.4" rx="1.7" fill="none" strokeWidth="1.3" />
      <circle cx="4.2" cy="10.3" r="1.1" strokeWidth="0" />
    </>
  ),
  "/timeline": (
    <>
      <line x1="1.6" y1="3.4" x2="12.4" y2="3.4" strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
      <line x1="1.6" y1="7" x2="12.4" y2="7" strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
      <line x1="1.6" y1="10.6" x2="12.4" y2="10.6" strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
      <rect x="2.4" y="2.4" width="5" height="2" rx="1" strokeWidth="0" />
      <rect x="5.4" y="6" width="6" height="2" rx="1" strokeWidth="0" />
      <rect x="3.4" y="9.6" width="4" height="2" rx="1" strokeWidth="0" />
    </>
  ),
  "/": (
    <>
      <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" />
      <rect x="8" y="1.5" width="4.5" height="4.5" rx="1" />
      <rect x="1.5" y="8" width="4.5" height="4.5" rx="1" />
      <rect x="8" y="8" width="4.5" height="4.5" rx="1" />
    </>
  ),
  "/audit": (
    <>
      <circle cx="6.2" cy="6.2" r="4.4" fill="none" strokeWidth="1.4" />
      <line x1="9.5" y1="9.5" x2="12.6" y2="12.6" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  "/decisions": <path d="M7 1.2 12.8 7 7 12.8 1.2 7Z" fill="none" strokeWidth="1.4" strokeLinejoin="round" />,
  "/forecast": (
    <>
      <polyline points="1.4,10.6 5,6.6 8,8.6 12.6,3.2" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12.6" cy="3.2" r="1.5" strokeWidth="0" />
    </>
  ),
  "/portfolio": (
    <>
      <rect x="1.4" y="2.2" width="7.2" height="2.6" rx="1.3" />
      <rect x="4.6" y="5.8" width="8" height="2.6" rx="1.3" />
      <rect x="2.6" y="9.4" width="6" height="2.6" rx="1.3" />
    </>
  ),
  "/reports": (
    <>
      <rect x="2.2" y="1.4" width="9.6" height="11.2" rx="1.4" fill="none" strokeWidth="1.3" />
      <line x1="4.6" y1="4.6" x2="9.4" y2="4.6" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="4.6" y1="7" x2="9.4" y2="7" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="4.6" y1="9.4" x2="7.4" y2="9.4" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  "/scopes": (
    <>
      <line x1="2" y1="4" x2="12" y2="4" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="2" y1="10" x2="12" y2="10" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="9" cy="4" r="1.9" strokeWidth="1.3" fill="var(--i-panel)" />
      <circle cx="5" cy="10" r="1.9" strokeWidth="1.3" fill="var(--i-panel)" />
    </>
  ),
};

function RailIcon({ href }: { href: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" stroke="currentColor" aria-hidden>
      {ICONS[href] ?? <circle cx="7" cy="7" r="4" />}
    </svg>
  );
}

export default function InstrumentRail({
  pathname,
  hidden,
  onToggle,
  onOpenCommand,
}: {
  pathname: string;
  hidden: boolean;
  onToggle: () => void;
  onOpenCommand: () => void;
}) {
  if (hidden) {
    return (
      <button
        onClick={onToggle}
        title="Show navigation (⌘\)"
        aria-label="Show navigation"
        className="absolute left-0 top-0 z-20 h-9 w-6 flex items-center justify-center text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
        style={{ background: "var(--i-panel)", borderRight: "1px solid var(--i-border)", borderBottom: "1px solid var(--i-border)" }}
      >
        ›
      </button>
    );
  }

  return (
    <nav
      aria-label="Sections"
      className="shrink-0 flex flex-col items-center py-3 gap-1"
      style={{ width: 48, background: "var(--i-panel)", borderRight: "1px solid var(--i-border)" }}
    >
      {/* Back to the Workbench. The mark is the exit, and says so on hover. */}
      <Link
        href="/"
        title="Dashboard"
        className="group relative h-8 w-8 rounded-md flex items-center justify-center text-[13px] font-semibold mb-2 transition-colors"
        style={{ background: "var(--i-panel-raised)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
      >
        K
        <RailTip>Dashboard</RailTip>
      </Link>

      {DESTINATIONS.map((d) => {
        const active = d.href === "/" ? pathname === "/" : pathname === d.href || pathname.startsWith(d.href + "/");
        return (
          <Link
            key={d.href}
            href={d.href}
            title={d.label}
            aria-current={active ? "page" : undefined}
            className="group relative h-8 w-8 rounded-md flex items-center justify-center transition-colors hover:text-[var(--i-text)]"
            style={{
              background: active ? "var(--i-violet-soft)" : "transparent",
              color: active ? "var(--i-violet)" : "var(--i-text-soft)",
            }}
          >
            <RailIcon href={d.href} />
            <span className="sr-only">{d.label}</span>
            <RailTip>{d.verb ? `${d.label} — ${d.verb}` : d.label}</RailTip>
          </Link>
        );
      })}

      <div className="flex-1" />

      <button
        onClick={onOpenCommand}
        title="Command menu (⌘K)"
        aria-label="Open command menu"
        className="group relative h-8 w-8 rounded-md flex items-center justify-center text-[11px] text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
      >
        ⌘K
        <RailTip>Command menu</RailTip>
      </button>
      <button
        onClick={onToggle}
        title="Hide navigation (⌘\)"
        aria-label="Hide navigation"
        className="group relative h-8 w-8 rounded-md flex items-center justify-center text-[var(--i-text-faint)] hover:text-[var(--i-text)] transition-colors"
      >
        ‹
        <RailTip>Hide navigation</RailTip>
      </button>
    </nav>
  );
}

function RailTip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded px-2 py-1 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity z-30"
      style={{ background: "var(--i-void)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
    >
      {children}
    </span>
  );
}
