// Which routes present as INSTRUMENT MODE rather than the Workbench.
//
// This is a PRESENTATION switch only -- it changes what chrome a route
// wears, never the route table, the nav's information architecture, or
// what any page can reach. The Workbench (audit, decisions, reports,
// scopes, configuration) keeps its light editorial language; an Instrument
// route owns the whole viewport in the dark simulation language, because
// simulating is a different job from reading and shouldn't be performed
// through a letterbox. See docs/DESIGN-NORTH-STAR.md.
//
// Both the Workbench Nav (which stands down on these routes) and the
// Instrument's own rail (which reproduces the same destinations in a
// compact form) read this one list, so the two can never disagree about
// where the boundary is.

export const INSTRUMENT_ROUTES = ["/portfolio"] as const;

export function isInstrumentRoute(pathname: string): boolean {
  return INSTRUMENT_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

// The full destination list, shared by the Workbench nav and the Instrument
// rail so the two can never drift. The rail draws its own icon per href
// (see InstrumentRail); nothing visual lives here.
export interface ShellDestination {
  href: string;
  label: string;
  instrument?: boolean;
}

export const DESTINATIONS: ShellDestination[] = [
  { href: "/", label: "Dashboard" },
  { href: "/audit", label: "Audit" },
  { href: "/decisions", label: "Decisions" },
  { href: "/forecast", label: "Forecast" },
  { href: "/portfolio", label: "Portfolio", instrument: true },
  { href: "/reports", label: "Reports" },
  { href: "/scopes", label: "Scopes settings" },
];
