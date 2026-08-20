"use client";

// SIGNAL'S ONLY NAVIGATION: a 92px labelled rail. Icon over label, in the
// approved Master Control Room treatment — wide enough to name every
// destination, narrow enough that navigation is never the second-largest
// object on a simulation surface.
//
// The reasoning is about visual weight, not about features. Navigation on a
// simulation surface is a thing you use for two seconds and then stop
// looking at, so it must not be the second-largest object on screen while
// you are reading a forecast. It used to have a 256px cream-and-green twin
// for the reading surfaces; that shell is retired, and this rail now serves
// every user-facing route from the one list in lib/shell/mode.ts.
//
// Hidden entirely (the "⌘\" / chevron state) the simulation owns the full
// viewport, which is what you want when screen-sharing a scenario.

import Link from "next/link";
import { DESTINATIONS, type ShellDestination } from "@/lib/shell/mode";

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
  "/dashboard": (
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
  // Orbit: a body with something in orbit around it — what waits on what.
  "/orbit": (
    <>
      <circle cx="7" cy="7" r="2.4" fill="currentColor" stroke="none" />
      <ellipse cx="7" cy="7" rx="6" ry="3.1" fill="none" strokeWidth="1.1" transform="rotate(-28 7 7)" />
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

function RailIcon({ href, size = 14 }: { href: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" stroke="currentColor" aria-hidden>
      {ICONS[href] ?? <circle cx="7" cy="7" r="4" />}
    </svg>
  );
}

/** The tree, minus the destinations that are reachable but not looking for
    a leader's glance. Parents keep their children so the rail can show the
    grouping rather than flattening it into peers. */
const RAIL_DESTINATIONS = DESTINATIONS.filter((d) => !d.secondary);

const isOn = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

/** One rail entry. `muted` is the child treatment: narrower, smaller icon,
    one step quieter — enough that the eye reads a group without the rail
    needing a second colour or a box drawn round it. */
function RailLink({ d, active, muted }: { d: ShellDestination; active: boolean; muted: boolean }) {
  return (
    <Link
      href={d.href}
      title={d.question ?? (d.verb ? `${d.label} — ${d.verb}` : d.label)}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center rounded-[8px] px-1 transition-colors hover:text-[var(--i-text)] ${
        muted ? "w-[70px] gap-[3px] px-0 py-[6px]" : "w-[76px] gap-[5px] py-[9px]"
      }`}
      style={{
        background: active ? "var(--i-signal-soft)" : "transparent",
        color: active ? "var(--i-signal)" : muted ? "var(--i-text-faint)" : "var(--i-text-soft)",
      }}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
          style={{ background: "var(--i-signal)", width: 2, height: muted ? 18 : 26 }}
        />
      )}
      <RailIcon href={d.href} size={muted ? 12 : 14} />
      <span className={`w-full truncate text-center leading-none ${muted ? "text-[9px]" : "text-[9.5px]"}`}>
        {d.label}
      </span>
    </Link>
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
      data-shoot="instrument-rail"
      className="i-noscrollbar flex shrink-0 flex-col items-center gap-[3px] overflow-y-auto pb-3 pt-4"
      style={{ width: 92, background: "var(--i-panel)", borderRight: "1px solid var(--i-border)" }}
    >
      {/* Signal's mark, and the way home. Home is the Control Room now, not
          a dashboard behind the instruments — the mark is an entrance
          rather than an exit. */}
      <Link
        href="/"
        title="Signal — Control Room"
        aria-label="Signal home"
        className="mb-3 flex h-[44px] w-[44px] items-center justify-center rounded-[10px] text-[16px] font-semibold transition-colors"
        style={{
          background: "var(--i-panel-raised)",
          border: "1px solid var(--i-border-strong)",
          color: "var(--i-signal)",
        }}
      >
        S
      </Link>

      {/* THE RAIL IS THE WHOLE NAVIGATION, so it has to carry the grouping
          as well as the destinations. Portfolio's children are INSET under
          it against a spine rather than listed as peers — same relationship
          the tree describes, drawn in 92px of instrument rather than in a
          disclosure. Settings and the old Workbench dashboard stay out:
          they are reachable, they are not what a leader is looking for
          mid-simulation. */}
      {RAIL_DESTINATIONS.map((d) => {
        const active = isOn(pathname, d.href);
        const inGroup = active || (d.children ?? []).some((c) => isOn(pathname, c.href));
        return (
          <div
            key={`${d.href}:${d.label}`}
            className="flex w-full flex-col items-center gap-[3px]"
            // The spine tells a sighted reader that these three belong to
            // Portfolio. role=group carries the same fact to everyone else.
            {...(d.children ? { role: "group" as const, "aria-label": d.label } : {})}
          >
            {/* A PARENT IS STILL A DESTINATION. Portfolio was briefly a
                non-clickable heading, to avoid two <a href="/portfolio">
                once Capacity was listed as a child of the same route. That
                traded one problem for a worse one: the row looks exactly
                like every other rail entry, so clicking it and getting
                nothing reads as a broken app. The duplicate is gone from
                the destination list instead (see lib/shell/mode.ts) and the
                parent behaves like what it looks like. */}
            <RailLink d={d} active={active} muted={false} />
            {d.children && (
              <div
                className="mb-[3px] flex flex-col items-center gap-[2px] pl-[4px]"
                style={{
                  borderLeft: `1px solid ${inGroup ? "var(--i-signal)" : "var(--i-border)"}`,
                  opacity: inGroup ? 1 : 0.82,
                }}
              >
                {d.children.map((c) => (
                  <RailLink key={`${d.href}:${c.href}:${c.label}`} d={c} active={isOn(pathname, c.href)} muted />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex-1" />

      <button
        onClick={onOpenCommand}
        title="Command menu (⌘K)"
        aria-label="Open command menu"
        className="flex w-[76px] flex-col items-center gap-[5px] rounded-[8px] py-[9px] text-[var(--i-text-faint)] transition-colors hover:text-[var(--i-text)]"
      >
        <span className="text-[12px] leading-none">⌘K</span>
        <span className="text-[9.5px] leading-none">Search</span>
      </button>
      <button
        onClick={onToggle}
        title="Hide navigation (⌘\)"
        aria-label="Hide navigation"
        className="flex w-[76px] flex-col items-center gap-[5px] rounded-[8px] py-[9px] text-[var(--i-text-faint)] transition-colors hover:text-[var(--i-text)]"
      >
        <span className="text-[12px] leading-none">‹</span>
        <span className="text-[9.5px] leading-none">Collapse</span>
      </button>
    </nav>
  );
}
