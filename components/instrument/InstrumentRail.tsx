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

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "@/components/instrument/SignalLink";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { DESTINATIONS, type ShellDestination } from "@/lib/shell/mode";
import BuildId from "@/components/instrument/BuildId";

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

// DID THE RACK ARRIVE ALREADY OPEN?
//
// The rail remounts on every navigation — each route mounts its own
// InstrumentShell — so moving Capacity → Scope → Dependencies looked to
// AnimatePresence like the rack appearing for the first time, and it
// replayed the whole entrance on each click. The rack was never actually
// closing; it just kept re-introducing itself.
//
// This module-scoped flag survives client-side navigation (the module stays
// loaded) and says whether the rack was open on the page we came from. If
// it was, the next mount skips its entrance and is simply already there.
//
// Read ONLY on the client. Module state on the server is shared between
// requests, so trusting it during SSR would leak one visitor's navigation
// into another's markup; `typeof window` keeps the server answer a constant
// false, which also means the server and the first client render always
// agree and hydration stays clean.
let rackWasOpen = false;
const arrivedOpen = () => typeof window !== "undefined" && rackWasOpen;

// THE RACK'S PHYSICS. Two springs, both in the vocabulary the instruments
// already speak (see ScopeInstrument / CapabilityTile): the chassis moves
// with authority and does not bounce, the modules inside it are lighter and
// arrive a beat later. Nothing here is decorative easing — the timing is
// what makes opening Portfolio read as a rack sliding out rather than a
// menu unfolding.
const CHASSIS = { type: "spring", stiffness: 380, damping: 34, mass: 0.9 } as const;
const MODULE = { type: "spring", stiffness: 460, damping: 32, mass: 0.6 } as const;

const rackVariants = {
  closed: {
    height: 0,
    opacity: 0,
    transition: { ...CHASSIS, staggerChildren: 0.028, staggerDirection: -1 },
  },
  open: {
    height: "auto",
    opacity: 1,
    transition: { ...CHASSIS, delayChildren: 0.045, staggerChildren: 0.045 },
  },
} as const;

// Children slide down out of the parent rather than fading in place, so the
// eye reads them as coming FROM Portfolio.
const moduleVariants = {
  closed: { opacity: 0, y: -7, transition: MODULE },
  open: { opacity: 1, y: 0, transition: MODULE },
} as const;

/** One rail entry.

    `muted` is the child treatment: narrower, smaller icon, one step
    quieter — enough that the eye reads a nested instrument without the
    rail needing a second colour or a box drawn round it.

    `anchor` is the parent-while-open treatment. It is deliberately NOT the
    active treatment: when you are on /portfolio the active thing is the
    Capacity module inside the rack, and Portfolio is the rack that is
    open. Giving both the filled backplate would say "you are in two places
    at once", so the anchor only lights its icon and label. */
function RailLink({
  d,
  active,
  muted,
  anchor = false,
  expanded,
  onClick,
}: {
  d: ShellDestination;
  active: boolean;
  muted: boolean;
  anchor?: boolean;
  /** Set only on a parent that owns a rack, for assistive tech. */
  expanded?: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const color = active || anchor ? "var(--i-signal)" : muted ? "var(--i-text-faint)" : "var(--i-text-soft)";
  return (
    <Link
      href={d.href}
      title={d.question ?? (d.verb ? `${d.label} — ${d.verb}` : d.label)}
      aria-current={active ? "page" : undefined}
      aria-expanded={expanded}
      onClick={onClick}
      data-rail-entry={d.label}
      className={`relative flex flex-col items-center rounded-[8px] px-1 transition-colors hover:text-[var(--i-text)] ${
        muted ? "w-[66px] gap-[3px] px-0 py-[6px]" : "w-[76px] gap-[5px] py-[9px]"
      }`}
      style={{ background: active ? "var(--i-signal-soft)" : "transparent", color }}
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
  // Racks the user has explicitly shut. Empty by default, so the route
  // decides — this only ever records a deliberate override.
  //
  // It is deliberately NOT persisted. The rail remounts on every
  // navigation (each route mounts its own InstrumentShell), so leaving
  // Portfolio and coming back gives you the open rack again, which is the
  // right default: arriving somewhere should show you what is there.
  // Shutting it is a "not right now", not a preference.
  const [shut, setShut] = useState<ReadonlySet<string>>(() => new Set());

  // Captured once, at mount. `firstMount` is what keeps this honest: it
  // suppresses the entrance only for the mount that navigation caused, so
  // re-opening the rack by hand on the same page still animates properly.
  const firstMount = useRef(true);
  const carriedOpen = firstMount.current && arrivedOpen();
  useEffect(() => {
    firstMount.current = false;
  }, []);

  /** Clicking the parent of an open rack shuts it instead of navigating.
      You are already where the link would take you, so the navigation has
      nothing to do — which is exactly what makes the click free to mean
      something else.

      Only while standing on the parent's OWN route. From inside a module
      (/scope, /orbit) the same click still navigates to Portfolio, because
      collapsing there would hide the row for the page you are looking at. */
  const toggleRack = (
    e: MouseEvent<HTMLAnchorElement>,
    href: string,
    onOwnRoute: boolean,
    childElsewhere: boolean
  ) => {
    // Let the browser have modified clicks: open-in-new-tab must still work.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!onOwnRoute || childElsewhere) return;
    e.preventDefault();
    setShut((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  // Hand the next mount the answer. Runs after every render, so it also
  // records a rack the user shut by hand — leave Portfolio with the rack
  // closed and the rack you come back to will animate open again.
  const anyRackOpen = RAIL_DESTINATIONS.some(
    (d) =>
      Boolean(d.children) &&
      (isOn(pathname, d.href) || (d.children ?? []).some((c) => isOn(pathname, c.href))) &&
      !shut.has(d.href)
  );
  useEffect(() => {
    rackWasOpen = anyRackOpen;
  });

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

      {/* PORTFOLIO IS A MODE, NOT A FOLDER.

          The rail shows seven destinations at rest. Capacity, Scope and
          Dependencies are not among them — they are instruments mounted
          INSIDE Portfolio, and they become available when you open it, the
          way a rack reveals its modules. The sidebar's job is to state the
          product model, not to enumerate every screen that exists.

          The open/closed state is DERIVED FROM THE ROUTE, never stored.
          That is not a shortcut, it is the correct source of truth: a
          refresh, a pasted /scope link, the back button and a click all
          have to agree about whether you are inside Portfolio, and the URL
          is the only thing that already knows. Nothing to persist, nothing
          to get out of sync.

          Settings and the old Workbench dashboard stay out entirely: they
          are reachable, they are not what a leader is looking for
          mid-simulation. */}
      <MotionConfig reducedMotion="user">
        {RAIL_DESTINATIONS.map((d) => {
          const childOn = (d.children ?? []).some((c) => isOn(pathname, c.href));
          const onOwnRoute = isOn(pathname, d.href);
          // A child standing on a route of ITS OWN, as opposed to Capacity,
          // which shares /portfolio with its parent. The distinction is the
          // whole reason the toggle works: on /portfolio a child (Capacity)
          // does hold the route, but you are not somewhere the rack would
          // hide by closing, so the click is free to close it. On /scope
          // you are, so it navigates instead.
          const childElsewhere = (d.children ?? []).some((c) => c.href !== d.href && isOn(pathname, c.href));
          // THE ROUTE PROPOSES, THE USER DISPOSES. Being inside Portfolio is
          // still what opens the rack — that is what makes a pasted /scope
          // link and a refresh land correctly. Shutting it is an explicit
          // act, so it lives in state layered on top rather than replacing
          // the route as the source of truth.
          const open = (onOwnRoute || childOn) && !shut.has(d.href);
          // A parent whose child holds the route is the anchor, not the
          // destination — the filled active plate belongs to the module.
          const active = onOwnRoute && !childOn;
          return (
            <div
              key={`${d.href}:${d.label}`}
              className="flex w-full flex-col items-center gap-[3px]"
              {...(d.children ? { role: "group" as const, "aria-label": d.label } : {})}
            >
              <RailLink
                d={d}
                active={active}
                muted={false}
                anchor={Boolean(d.children) && open}
                expanded={d.children ? open : undefined}
                onClick={d.children ? (e) => toggleRack(e, d.href, onOwnRoute, childElsewhere) : undefined}
              />

              {/* NO initial={false} ON THE AnimatePresence BELOW, deliberately.
                  Each route mounts its own InstrumentShell, so the rail
                  remounts on every navigation — which means every arrival
                  looks like AnimatePresence's first render, and
                  initial={false} would suppress the opening animation every
                  single time rather than just once. Measured with it in
                  place: the rack's height went 0 → 118px in a single frame.

                  The same remount is why LEAVING is instant — navigate to
                  Timeline and the rail unmounts with the page, so no element
                  survives for an exit animation to run on. Shutting the rack
                  by clicking Portfolio is different: it deliberately does
                  not navigate, the rail stays mounted, and AnimatePresence
                  gets to run the exit properly. Measured: 118px → 0 across
                  21 frames. */}
              {d.children && (
                <AnimatePresence>
                  {open && (
                    <motion.div
                      key="rack"
                      data-shoot="rail-rack"
                      data-carried={carriedOpen ? "true" : "false"}
                      variants={rackVariants}
                      // initial={false} on THIS mount only, when the rack
                      // was already open on the page we navigated from:
                      // moving between Capacity, Scope and Dependencies
                      // should leave the rack sitting still, not replay its
                      // entrance three times in a row.
                      initial={carriedOpen ? false : "closed"}
                      animate="open"
                      exit="closed"
                      className="relative w-full overflow-hidden"
                    >
                      <div className="flex flex-col items-center gap-[2px] py-[3px] pl-[10px]">
                        {/* The spine, drawn from the parent downward. It
                            grows rather than appearing, so the rack reads
                            as extending out of Portfolio. */}
                        <motion.span
                          aria-hidden
                          className="absolute left-[15px] top-0 w-px"
                          // transformOrigin: top — the spine grows DOWNWARD
                          // out of Portfolio rather than outward from its
                          // own middle, which is what makes the rack read
                          // as extending from the parent.
                          style={{
                            background: "var(--i-signal)",
                            opacity: 0.5,
                            bottom: 10,
                            transformOrigin: "top",
                          }}
                          // Its own initial rather than a variant, so it
                          // needs the same suppression as the rack — without
                          // this the spine would still draw itself on every
                          // arrival while everything around it sat still.
                          initial={carriedOpen ? false : { scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          exit={{ scaleY: 0 }}
                          transition={CHASSIS}
                        />
                        {d.children.map((c) => (
                          <motion.div
                            key={`${d.href}:${c.href}:${c.label}`}
                            variants={moduleVariants}
                            className="relative"
                          >
                            {/* The short arm from spine to module — the
                                "├" of the tree, drawn rather than typed. */}
                            <span
                              aria-hidden
                              className="absolute top-1/2 h-px"
                              style={{
                                left: -5,
                                width: 5,
                                background: "var(--i-signal)",
                                opacity: isOn(pathname, c.href) ? 0.75 : 0.32,
                              }}
                            />
                            <RailLink d={c} active={isOn(pathname, c.href)} muted />
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          );
        })}
      </MotionConfig>

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

      {/* LAST, SMALLEST, AND IN EVERY SCREENSHOT. The rail is the only chrome
          present on every instrument, so a build marker here is in every
          capture anyone takes without their having to remember it. It is 9px
          and faint on purpose: nobody should look at it while working, only
          find it afterwards. */}
      <BuildId />
    </nav>
  );
}
