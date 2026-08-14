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
// RELEASE BOUNDARY: this release promotes exactly three instruments --
// Portfolio (already an instrument in production), plus Forecast and Scope.
// Every other destination keeps its production Workbench surface until its
// own instrument has been designed and accepted. Timeline is deliberately
// absent from this list: production presents it through the Nav's separate
// "Coming next" group, and it should not appear here as a peer of finished
// instruments until it is one.

export const INSTRUMENT_ROUTES = ["/portfolio", "/forecast", "/scope"] as const;

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
  { href: "/", label: "Dashboard" },
  { href: "/audit", label: "Audit" },
  { href: "/decisions", label: "Decisions" },
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
  { href: "/reports", label: "Reports" },
  { href: "/scopes", label: "Scopes settings" },
];

export function destinationFor(pathname: string): ShellDestination | undefined {
  return DESTINATIONS.find((d) => d.href === pathname);
}
