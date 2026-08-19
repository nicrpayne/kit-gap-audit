// WHICH ROUTES ARE INSTRUMENTS, AND WHAT EACH ONE OWNS.
//
// This is a PRESENTATION switch only -- it changes what chrome a route
// wears, never the route table, the nav's information architecture, or
// what any page can reach. The Workbench (dashboard, audit, decisions,
// reports, scopes, configuration) keeps its light editorial language; an
// Instrument route owns the whole viewport in the dark simulation language,
// because simulating is a different job from reading and shouldn't be
// performed through a letterbox. See docs/DESIGN-NORTH-STAR.md.
//
// Both the Workbench Nav (which stands down on these routes) and the
// Instrument's own rail (which reproduces the same destinations in a
// compact form) read this one list, so the two can never disagree about
// where the boundary is.
//
// RELEASE BOUNDARY: this release promotes Portfolio (already an instrument
// in production), Forecast, Scope, and now Decisions -- the last built
// against its own approved visual contract rather than inherited from the
// old experimental instrument suite. Every other destination keeps its
// production Workbench surface until its own instrument has been designed
// and accepted. Timeline joins the list here: it was "Coming next" while it
// was a ComingNext stub, and it is now a built instrument with its own
// visual contract, so it takes its place as a peer.

// /orbit is in this list and deliberately NOT in DESTINATIONS below. It is
// a development route for the Orbit foundation pass: it needs the Workbench
// nav to stand down so the wireframe owns the viewport, but it is not an
// approved instrument and must not sit in the rail next to ones that are.
// Reachable by URL only until it has a visual contract of its own.
export const INSTRUMENT_ROUTES = [
  "/control-room",
  "/portfolio",
  "/forecast",
  "/scope",
  "/decisions",
  "/timeline",
  "/orbit",
] as const;

export function isInstrumentRoute(pathname: string): boolean {
  return INSTRUMENT_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

// The full destination list, shared by the Instrument rail and the command
// menu so the two can never drift. The rail draws its own icon per href
// (see InstrumentRail); nothing visual lives here.
export interface ShellDestination {
  href: string;
  label: string;
  /** True where the route wears Instrument chrome rather than the Workbench. */
  instrument?: boolean;
  /** The one sentence this instrument is allowed to be about. Instrument
      routes only -- a Workbench reading surface makes no such claim. */
  owns?: string;
  /** Verb pairing from the product principle -- shown in the rail tooltip. */
  verb?: string;
}

export const DESTINATIONS: ShellDestination[] = [
  {
    href: "/control-room",
    label: "Control Room",
    instrument: true,
    owns: "What deserves attention right now, and where to go and look",
    verb: "Where do I look",
  },
  { href: "/", label: "Dashboard" },
  { href: "/audit", label: "Audit" },
  {
    href: "/decisions",
    label: "Decisions",
    instrument: true,
    owns: "Which choices are unresolved, and which are actually holding delivery",
    verb: "Release the gate",
  },
  {
    href: "/forecast",
    label: "Forecast",
    instrument: true,
    owns: "The synthesized delivery consequence of everything we believe",
    verb: "Where do we land",
  },
  {
    href: "/scope",
    label: "Scope",
    instrument: true,
    owns: "What we are actually shipping, and what we are not",
    verb: "Play what ships",
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    instrument: true,
    owns: "People, allocation and the portfolio-wide switching assumption",
    verb: "Play the people",
  },
  {
    href: "/timeline",
    label: "Timeline",
    instrument: true,
    owns: "The project's relationship with time -- what happened, when, and what we believed then",
    verb: "Play the project",
  },
  { href: "/reports", label: "Reports" },
  { href: "/scopes", label: "Scopes settings" },
];

export function destinationFor(pathname: string): ShellDestination | undefined {
  return DESTINATIONS.find((d) => d.href === pathname);
}
