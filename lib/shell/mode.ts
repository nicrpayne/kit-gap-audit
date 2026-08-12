// WHICH ROUTES ARE INSTRUMENTS, AND WHAT EACH ONE OWNS.
//
// The suite is one delivery model operated through several specialised
// instruments. The `owns` line below is not documentation decoration -- it is
// the one-job test, kept next to the route so a new surface cannot quietly
// grow into someone else's territory. If two entries could claim the same
// control, one of them is wrong.
//
// Instrument Mode is a PRESENTATION switch only: the Workbench nav stands
// down on these routes and they own the viewport. The route table itself is
// unchanged.

export interface ShellDestination {
  href: string;
  label: string;
  /** The one sentence this instrument is allowed to be about. */
  owns: string;
  /** Verb pairing from the product principle -- shown in the rail tooltip. */
  verb: string;
  group: "operate" | "model" | "investigate" | "communicate";
}

export const DESTINATIONS: ShellDestination[] = [
  {
    href: "/overview",
    label: "Overview",
    owns: "What is happening with this project right now",
    verb: "Conduct the project",
    group: "operate",
  },
  {
    href: "/forecast",
    label: "Forecast",
    owns: "The synthesized delivery consequence of everything we believe",
    verb: "Where do we land",
    group: "operate",
  },
  {
    href: "/scope",
    label: "Scope",
    owns: "What we are actually shipping, and what we are not",
    verb: "Play what ships",
    group: "model",
  },
  {
    href: "/timeline",
    label: "Timeline",
    owns: "How this delivery fits together over time",
    verb: "Play the sequence",
    group: "model",
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    owns: "People, allocation and the portfolio-wide switching assumption",
    verb: "Play the people",
    group: "model",
  },
  {
    href: "/audit",
    label: "Intelligence",
    owns: "What the machine thinks we are missing, wrong about, or unsure of",
    verb: "Challenge the model",
    group: "investigate",
  },
  {
    href: "/decisions",
    label: "Decisions",
    owns: "What choices must be made, and what they change",
    verb: "Play the choices",
    group: "investigate",
  },
  {
    href: "/reports",
    label: "Reports",
    owns: "How the current model gets communicated to other people",
    verb: "Communicate the model",
    group: "communicate",
  },
];

// Every suite route runs in Instrument Mode. Sub-routes that are genuinely
// Workbench reading surfaces (an individual audit's findings list, the audit
// intake form, scope settings) deliberately stay light.
const INSTRUMENT_EXACT = new Set(DESTINATIONS.map((d) => d.href));

export function isInstrumentRoute(pathname: string): boolean {
  return INSTRUMENT_EXACT.has(pathname);
}

export function destinationFor(pathname: string): ShellDestination | undefined {
  return DESTINATIONS.find((d) => d.href === pathname);
}
