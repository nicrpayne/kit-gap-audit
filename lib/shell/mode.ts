// SIGNAL HAS ONE SHELL.
//
// There used to be two: a cream-and-green Workbench (dashboard, audit,
// reports, settings) and a dark Instrument (control room, forecast, scope,
// portfolio, timeline, decisions). A route declared which chrome it wore,
// and the two navigations stood down for each other. That split made sense
// while the instruments were an experiment opened from inside a product;
// it stopped making sense the moment the instruments BECAME the product.
//
// The Workbench shell is retired. Every user-facing route now renders
// inside InstrumentShell -- same rail, same header treatment, same dark
// surfaces, same typography -- so moving from Audit to Forecast feels like
// moving between rooms of one building rather than between two products.
// The legacy pages kept their functionality; only their chrome changed.
//
// This file is the single source of truth for where a person can go. The
// rail and the command menu both read it, so they cannot drift apart.

/** The full destination list. The rail draws its own icon per href (see
    InstrumentRail); nothing visual lives here. */
export interface ShellDestination {
  href: string;
  label: string;
  /** The one sentence this destination is allowed to be about. Shown in the
      identity strip at the top of every surface. */
  owns?: string;
  /** Verb pairing from the product principle -- shown in the rail tooltip. */
  verb?: string;
  /** THE QUESTION A LEADER ARRIVES WITH. The nav is organised around these
      rather than around the tables underneath, because nobody opens this
      app thinking "I need to inspect Scope" -- they think "why is my launch
      moving?". */
  question?: string;
  /** Destinations that belong UNDER this one. Operational planning is one
      idea with several instruments, not several peers competing for the
      same glance. */
  children?: ShellDestination[];
  /** Kept reachable, deliberately absent from the primary nav. */
  secondary?: boolean;
}

// ORGANISED AROUND WHAT A LEADER IS ASKING.
//
// The order is the order the questions get asked in a real review: what is
// happening, what are we missing, what is unresolved, where do we land, how
// do the pieces interact, how did we get here, how do we tell people.
//
// Portfolio is a PARENT rather than a peer. Scope and dependencies are not
// separate concerns a leader holds in mind -- they are the reasons a
// portfolio moves, and they belong underneath it.
//
// Route names are untouched. This is information architecture, not a
// migration: every href below already existed.
export const DESTINATIONS: ShellDestination[] = [
  {
    href: "/control-room",
    label: "Control Room",
    question: "What is happening right now?",
    owns: "What deserves attention right now, and where to go and look",
    verb: "Where do I look",
  },
  {
    href: "/audit",
    label: "Audit",
    question: "What are we missing?",
    owns: "What the plan does not yet account for, and where it came from",
    verb: "Find the gap",
  },
  {
    href: "/decisions",
    label: "Decisions",
    question: "What choices are unresolved?",
    owns: "Which choices are unresolved, and which are actually holding delivery",
    verb: "Release the gate",
  },
  {
    href: "/forecast",
    label: "Forecast",
    question: "Where are we likely to land?",
    owns: "The synthesized delivery consequence of everything we believe",
    verb: "Where do we land",
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    question: "How do projects, people, and dependencies interact?",
    owns: "People, allocation and the portfolio-wide switching assumption",
    verb: "Play the people",
    // PORTFOLIO'S CHILDREN. The brief asked for Overview, Scope, Capacity
    // and Dependencies. Overview and Capacity are the same room: /portfolio
    // owns people, allocation and switching, which IS the capacity picture,
    // and listing it twice would be two doors into one place. The parent row
    // is the overview; Capacity names what you find there.
    children: [
      {
        href: "/portfolio",
        label: "Capacity",
        question: "Who is on what, and what does switching cost?",
        owns: "People, allocation and the portfolio-wide switching assumption",
      },
      {
        href: "/scope",
        label: "Scope",
        question: "What are we actually shipping?",
        owns: "What we are actually shipping, and what we are not",
        verb: "Play what ships",
      },
      {
        href: "/orbit",
        label: "Dependencies",
        question: "What is waiting on what?",
        owns: "What waits on what, and what a delay upstream costs downstream",
      },
    ],
  },
  {
    href: "/timeline",
    label: "Timeline",
    question: "How did we get here?",
    owns: "The project's relationship with time -- what happened, when, and what we believed then",
    verb: "Play the project",
  },
  {
    href: "/reports",
    label: "Reports",
    question: "How do we communicate status?",
    owns: "One shareable statement of where the project stands and what changed",
    verb: "Tell the story",
  },
  // Reachable, deliberately not competing for a leader's glance. Both wear
  // the same shell as everything else -- "secondary" is about attention,
  // not about being a different product.
  {
    href: "/scopes",
    label: "Scopes settings",
    question: "Which Linear work belongs to which project?",
    owns: "The mapping from a KIT module to the Linear work that represents it",
    secondary: true,
  },
  {
    href: "/dashboard",
    label: "Workbench dashboard",
    question: "The pre-Signal summary, kept for reference",
    owns: "The original at-a-glance counts, kept while anything still links to them",
    secondary: true,
  },
];

/** Every destination, parents and children alike, flattened once. The rail
    and the command menu both want the reachable set rather than the tree. */
export const ALL_DESTINATIONS: ShellDestination[] = DESTINATIONS.flatMap((d) =>
  d.children ? [d, ...d.children] : [d]
);

/** Which destination a path belongs to. Exact match first, then the nearest
    ancestor — so /audit/new and /audit/<id> are still Audit rather than
    falling through to a nameless surface. Longest prefix wins, and the
    boundary is a path SEGMENT, so /scopes never resolves to /scope.

    Where a parent and a child share a href (Portfolio and Capacity, by
    design) the parent is listed first and therefore answers. */
export function destinationFor(pathname: string): ShellDestination | undefined {
  const exact = ALL_DESTINATIONS.find((d) => d.href === pathname);
  if (exact) return exact;
  return ALL_DESTINATIONS.filter((d) => pathname.startsWith(d.href + "/")).sort(
    (a, b) => b.href.length - a.href.length
  )[0];
}
