// THE SIGNAL GRAPH'S VISUAL LANGUAGE.
//
// No new palette. Every value resolves to an `--i-*` token that already means
// this elsewhere in Signal, so the graph reads as a Signal instrument rather
// than as a differently-themed page.
//
// TWO CHANNELS, DELIBERATELY SEPARATE:
//
//   SHAPE says WHAT KIND of thing this is.
//   COLOUR says WHAT STATE it is in.
//
// Keeping them apart is what stops the field turning into a rainbow. A work
// item and a finding are different shapes whatever colour they happen to be;
// a conflicted dependency and a conflicted finding share a colour without
// being confusable. It is also the accessibility floor: kind survives without
// colour, and state is always also written in the inspector.

import type { NodeKind } from "@/lib/audit/graph";

export type NodeShape = "core" | "disc" | "diamond" | "hex" | "chip" | "pin" | "dot" | "doc" | "tablet" | "figure" | "speech" | "page" | "frame" | "shard";

/** Shape per kind. Never varies with state. */
export const NODE_SHAPE: Record<NodeKind, NodeShape> = {
  reality: "core",
  scope: "chip",
  // A TABLET: square-shouldered, upright, ruled across. Deliberately not the
  // chip a Scope or Feature uses, not the pin a finding uses, not the page a
  // source uses and not the dot a passage uses — a requirement must be
  // tellable from all four at a glance, because the whole point of the node
  // is that it is NOT the source it came from. The rule across it reads as
  // "a statement", which is what this is.
  requirement: "tablet",
  // A FIGURE: a head over a shoulder arc. The one glyph on this field that is
  // literal, because a person is the one thing here that is not an
  // abstraction — and it has to be tellable at a glance from the disc, dot
  // and chip it shares a sector with. No portraits: Signal plans capacity, it
  // is not a directory.
  person: "figure",
  lane: "disc",
  decision: "diamond",
  decisionGate: "diamond",
  dependency: "hex",
  finding: "pin",
  feature: "chip",
  work: "dot",
  intelligence: "disc",
  passage: "dot",
  // SOURCE ARTIFACTS: one layer of the world, four shapes.
  //
  // "Source" is a role, not a thing. A meeting, a written page and a design
  // frame answer completely different questions — what was said, what was
  // written down, what was drawn — and drawing all three as the same document
  // icon makes the reader open each one to find out which it is.
  source: "doc",
  /** A speech bubble: something someone said. */
  transcript: "speech",
  /** A page with ruled lines: something written down. */
  notion_page: "page",
  /** A frame with a corner handle: something drawn. */
  figma_artifact: "frame",
  // A SHARD: an upward triangle drawn with a BROKEN stroke.
  //
  // The broken stroke is the point, and it is the same grammar the external
  // edges use — everything on this field that Signal has not corroborated is
  // drawn with a stroke that does not close. Learn it once on an edge and it
  // reads on a node. Solid means Signal holds this; broken means somebody
  // else says so.
  //
  // ONE SHAPE FOR ALL NINE INTELLIGENCE TYPES, deliberately. Nine glyphs on a
  // field that already carries thirteen would exhaust the shape channel to
  // encode a producer's taxonomy — and the type is already legible from the
  // SECTOR the object sits in, from its label, and from the inspector. Shape
  // says what kind of thing this is on Signal's field, and every one of them
  // is the same kind of thing: an external claim.
  intel: "shard",
  checkpoint: "dot",
};

/**
 * Resting colour per kind, for nodes whose kind does NOT carry a state.
 *
 * Execution and provenance are deliberately muted: they are the substrate the
 * project is made of, not the thing Audit is pointing at. The eye should find
 * a critical finding before it finds a ticket.
 */
export const KIND_COLOR: Record<NodeKind, string> = {
  reality: "var(--i-signal)",
  scope: "var(--i-signal)",
  // Mint: already the token for "seated and accepted" elsewhere in Signal,
  // and cool enough to sit quietly beside Reality without competing with the
  // amber and red that carry disagreement. A requirement is structure, not an
  // alarm.
  requirement: "var(--i-mint)",
  // Violet already means "a human is involved" on this field — it is what a
  // finding turns when only a person can settle it. A person node is the
  // literal case of that.
  person: "var(--i-violet)",
  lane: "var(--i-text-soft)",
  decision: "var(--i-violet)",
  decisionGate: "var(--i-violet)",
  dependency: "var(--i-red)",
  finding: "var(--i-amber)",
  // Features are the one structural layer with an identity of its own, and
  // --i-cool already exists in the token set for exactly this register.
  feature: "var(--i-cool)",
  work: "var(--i-text-soft)",
  intelligence: "var(--i-violet)",
  passage: "var(--i-text-faint)",
  source: "var(--i-text-faint)",
  // Provenance stays muted whatever its kind. These are the substrate the
  // project is made of, not the thing Audit is pointing at — the eye should
  // still find a critical finding before it finds a Notion page.
  transcript: "var(--i-text-faint)",
  notion_page: "var(--i-text-faint)",
  figma_artifact: "var(--i-text-faint)",
  // EXTERNAL INTELLIGENCE IS QUIET, AND THAT IS THE POINT. It gets no hue of
  // its own: a hundred coloured marks in the outer band would out-shout the
  // findings, and the field's first rule is that the eye finds a critical
  // finding before it finds anything else. Externality is carried by shape,
  // by the broken stroke, and by sitting outside the record's edge — three
  // channels, none of them colour, because colour here means STATE.
  intel: "var(--i-text-soft)",
  checkpoint: "var(--i-text-faint)",
};

export const STATE_COLOR: Record<string, string> = {
  verified: "var(--i-signal)",
  drift: "var(--i-amber)",
  conflict: "var(--i-red)",
  missing: "var(--i-reality)",
};

export const HUMAN_COLOR = "var(--i-violet)";
export const CONFIRMED_COLOR = "var(--i-mint)";

/** The colour a node is drawn in: state where the kind carries one, its kind
    colour otherwise. Human judgement outranks state on a finding, because
    "only a person can settle this" changes what you do next. */
export function nodeColor(attrs: Record<string, unknown>): string {
  const kind = attrs.kind as NodeKind;
  if (kind === "finding") {
    if (attrs.handled) return CONFIRMED_COLOR;
    if (attrs.needsHuman) return HUMAN_COLOR;
    return STATE_COLOR[attrs.state as string] ?? "var(--i-amber)";
  }
  // A source artifact the Scope DECLARES but which supplied no evidence takes
  // the grey the field already uses for an unsupplied lane. Same fact, same
  // colour: Signal is pointed at this and is working from nothing out of it.
  if (kind === "source" || kind === "transcript" || kind === "notion_page" || kind === "figma_artifact") {
    return attrs.supplied === false ? "var(--i-reality)" : KIND_COLOR[kind];
  }
  if (kind === "lane" || kind === "dependency") {
    if (attrs.supplied === false) return "var(--i-reality)";
    return STATE_COLOR[attrs.state as string] ?? KIND_COLOR[kind];
  }
  // A SYNTHETIC PERSON IS NOT A VERIFIED HUMAN. `Person.synthetic` marks a
  // unit generated to stand in for a legacy flat team-capacity number nobody
  // attested, so it takes the same grey the field already uses for "nothing
  // is supplying this" rather than the violet that means a named human.
  if (kind === "person") {
    return attrs.synthetic ? "var(--i-reality)" : "var(--i-violet)";
  }
  // THE ONE STATE AN EXTERNAL OBJECT HAS IS WHETHER IT IS STILL THE HEAD.
  //
  // Read from the producer's own `isCurrent` and NEVER derived from `status`
  // — the corpus contains objects that are `open` and superseded, and a
  // renderer inferring currentness from status would draw those as live.
  if (kind === "intel") {
    return attrs.isCurrent === false ? "var(--i-text-faint)" : "var(--i-text-soft)";
  }
  if (kind === "work") {
    // Completed work recedes: it is no longer part of what remains.
    return attrs.stateType === "completed" || attrs.stateType === "canceled"
      ? "var(--i-text-faint)"
      : "var(--i-text-soft)";
  }
  return KIND_COLOR[kind] ?? "var(--i-text-soft)";
}

/**
 * THE THREE CONTRAST TIERS, as literal opacities.
 *
 * Same principle the Truth Map established: keep the information, reduce
 * simultaneous salience. These are the numbers that rule is made of.
 */
export const TIER = {
  /** Rings, sector guides, cluster gutters. */
  structure: 0.15,
  /** Ordinary nodes and attested edges at rest. */
  rest: 0.72,
  /** Inferred edges at rest — present, but clearly weaker evidence. */
  inferredRest: 0.26,
  /** Attested edges at rest. */
  attestedRest: 0.42,
  /**
   * External edges at rest — quieter than inferred, and deliberately so.
   *
   * `inferred` is Signal's own reading of Signal's own data; `external` is a
   * third party's claim that Signal has not checked. The weaker of the two is
   * the one Signal did not make.
   */
  externalRest: 0.2,
  /** Selected node, its neighbourhood, its edges. */
  focus: 1,
  /** Everything unrelated once something is selected. */
  dimmed: 0.1,
  /** Unrelated during Evidence Solo — harder, but never invisible: losing
      orientation is worse than losing contrast. */
  soloDimmed: 0.06,
  /**
   * A latent mark while something else is being explained.
   *
   * Quieter than `dimmed`, and that ordering is the point: a mark with no
   * name on it must never be louder than a real node that has been pushed
   * back. Fixed rather than a multiple of the latent opacity, which at close
   * zoom put the dust ahead of the dimmed field.
   */
  latentDimmed: 0.08,
} as const;

/**
 * ZOOM THRESHOLDS — explicit, not "labels scale with k".
 *
 * The reference reveals detail in steps as the camera closes, which is what
 * makes a dense field readable at every distance. Scaling text continuously
 * would just produce unreadably small labels at far zoom instead of no
 * labels, which is worse.
 */
export const ZOOM = {
  /** Below this: project shape only. */
  far: 1.05,
  /** Below this: delivery structure. Above: source-level detail. */
  medium: 2.1,
} as const;

export type ZoomLevel = "far" | "medium" | "close";

/**
 * HYSTERESIS — THE DEADBAND EITHER SIDE OF EACH THRESHOLD.
 *
 * Measured before this existed: parked at k≈2.14 and wobbling the trackpad,
 * the tier flipped 23 times in 24 events, and every close-only label —
 * findings, gates, checkpoints — strobed with it. A bare threshold is a
 * coin toss for any camera resting on it, and a camera resting on a
 * threshold is the normal case, because that is where the detail you were
 * looking for appeared.
 *
 * So a tier is entered and left at DIFFERENT scales. Going up you must
 * clear the threshold by 9%; coming down you must fall 9% below it. Inside
 * the band, whichever tier you are already in wins.
 *
 * 9% is chosen against the wheel's own step size: `exp(-deltaY * 0.0016)`
 * makes one notch of a mouse wheel (deltaY ≈ 100) a 17% change, so a
 * deliberate scroll still crosses in a single notch, while trackpad noise
 * (deltaY ≈ 4–14, under 2.3%) cannot cross at all. The band is wide enough
 * to be quiet and narrow enough to be invisible.
 *
 * THIS IS NOT A DEBOUNCE. The camera stays perfectly continuous — nothing
 * is delayed, dropped or smoothed. Only the discrete tier is sticky.
 */
export const ZOOM_BAND = 0.09;

export const ZOOM_GATES = {
  /** far → medium */
  enterMedium: ZOOM.far * (1 + ZOOM_BAND),
  /** medium → far */
  exitMedium: ZOOM.far * (1 - ZOOM_BAND),
  /** medium → close */
  enterClose: ZOOM.medium * (1 + ZOOM_BAND),
  /** close → medium */
  exitClose: ZOOM.medium * (1 - ZOOM_BAND),
} as const;

/** The tier a camera starting from nothing sits at. Bare thresholds, because
    with no previous tier there is nothing to be sticky about. */
export function zoomLevel(k: number): ZoomLevel {
  if (k < ZOOM.far) return "far";
  if (k < ZOOM.medium) return "medium";
  return "close";
}

/**
 * The tier to show next, given the one currently showing.
 *
 * Idempotent: applying it twice with the same `k` gives the same answer, so
 * it is safe to call during render and safe under React's double-invocation
 * in development.
 *
 * A single large step still jumps tiers — far straight to close is reachable
 * — so hysteresis never makes the zoom feel sticky, only stable.
 */
export function nextZoomLevel(k: number, from: ZoomLevel): ZoomLevel {
  switch (from) {
    case "far":
      if (k >= ZOOM_GATES.enterClose) return "close";
      return k >= ZOOM_GATES.enterMedium ? "medium" : "far";
    case "medium":
      if (k >= ZOOM_GATES.enterClose) return "close";
      return k <= ZOOM_GATES.exitMedium ? "far" : "medium";
    case "close":
      if (k <= ZOOM_GATES.exitMedium) return "far";
      return k <= ZOOM_GATES.exitClose ? "medium" : "close";
  }
}

/** Which kinds carry a visible label at each level. Reality and cluster
    pucks always label — they are the map's legend. */
const LABELLED_AT: Record<ZoomLevel, NodeKind[]> = {
  far: ["reality", "lane"],
  // Work, passages and sources join at medium because expanding a cluster
  // flies the camera to exactly this zoom. They are only ever FORMED when
  // their cluster has been opened, so this cannot crowd the resting field —
  // it means that if you went and opened something, you can read it. Before
  // this, expanding Linear at its own fly-to produced fourteen unlabelled
  // grey dots, which is the reveal failing at the moment it should land.
  medium: [
    "reality",
    "lane",
    "dependency",
    "decision",
    "feature",
    "scope",
    "intelligence",
    "work",
    "passage",
    "source",
    "transcript",
    "notion_page",
    "figma_artifact",
    "person",
    // A requirement is project structure, so its identity belongs with the
    // delivery structure tier rather than with source detail. At far zoom it
    // is mass; here it is nameable; at close the inspector carries the full
    // statement.
    "requirement",
  ],
  close: [
    "reality",
    "lane",
    "dependency",
    "decision",
    "decisionGate",
    "feature",
    "scope",
    "intelligence",
    "work",
    "passage",
    "source",
    "finding",
    "checkpoint",
    "requirement",
    "person",
    "transcript",
    "notion_page",
    "figma_artifact",
    // CLOSE ONLY, and this one is a density decision rather than an
    // importance one. Work and passages join at MEDIUM because expanding
    // their cluster flies the camera to exactly that zoom and fourteen
    // unlabelled dots is a reveal that failed. External intelligence is an
    // order of magnitude denser — the real JSA corpus puts around a hundred
    // objects in one sector — and a hundred labels at medium is not a reveal,
    // it is a wall of text over the band it is trying to describe. At medium
    // the band forms and you can see its shape and its size; at close you
    // read it; and search reaches any single object at any zoom.
    "intel",
  ],
};

export function labelsFor(level: ZoomLevel): Set<NodeKind> {
  return new Set(LABELLED_AT[level]);
}

/**
 * PRESENCE — THE SECOND CHANNEL, AND THE ONE THAT WAS MISSING.
 *
 * Measured before this was written (`scripts/audit-density-measure.ts`): on
 * the largest Scope, 41 of 65 real nodes were not drawn AT ALL in the resting
 * field, and zooming in changed that number by zero. Expansion was the only
 * thing that mounted a node, so "+14" did not reveal fourteen things — it
 * conjured them.
 *
 * So a node now has THREE degrees of presence rather than two of labelling:
 *
 *   latent   A real node at its real seat, drawn as a mark. No name, no
 *            edges, no hit target. This is what "all those dots" are.
 *   formed   Its actual shape and size, focusable, wired into the edge graph.
 *   named    Formed, and carrying its label.
 *
 * Expansion moves a node from latent to formed IN PLACE — it was already on
 * screen, at that exact seat, the whole time. Nothing enters the world; it
 * only becomes itself. Zoom does the same thing continuously to the latent
 * marks: dust at far, differentiated dots at medium, distinct objects at
 * close.
 *
 * THE RULE THAT KEEPS THIS HONEST: every mark is one real graph node. There
 * are no aggregate blobs, no density particles, no decorative orbits. A
 * cluster's "+N" is a label on visible mass, not a substitute for it, and a
 * proof asserts N equals the number of latent nodes actually drawn there.
 */
export type Identity = "latent" | "formed" | "named";

/**
 * How much of itself a latent mark shows at each zoom.
 *
 * `minPx` is a floor in SCREEN pixels, not world units: a checkpoint scaled
 * to 34% is a third of a pixel at far zoom, which is not "subtle", it is
 * absent. The floor is what makes the outer rim read as mass at every
 * distance, and it is why the marks converge to uniform dust when you pull
 * back — at that range they genuinely are just population.
 */
export const LATENT: Record<ZoomLevel, { scale: number; opacity: number; minPx: number }> = {
  far: { scale: 0.42, opacity: 0.52, minPx: 2.4 },
  medium: { scale: 0.56, opacity: 0.62, minPx: 2.6 },
  close: { scale: 0.7, opacity: 0.7, minPx: 2.8 },
};

/** Latent radius in world units, floored so the mark survives far zoom. */
export function latentRadius(r: number, level: ZoomLevel, k: number): number {
  const t = LATENT[level];
  return Math.max(r * t.scale, t.minPx / k);
}

/**
 * What a node is showing right now.
 *
 * `opened` is the renderer's own visibility rule — the core slice, plus any
 * cluster the user has expanded. Zoom governs the step from formed to named
 * and never the step from latent to formed: expanding a cluster you are
 * looking at from a distance must still show you what is in it.
 */
export function identityOf(kind: NodeKind, opened: boolean, level: ZoomLevel): Identity {
  if (!opened) return "latent";
  return labelsFor(level).has(kind) ? "named" : "formed";
}

/**
 * Edges that are membership, not relationship.
 *
 * The prior tranche measured 74 of these. They say "this belongs to that
 * cluster", which the layout already says by POSITION — drawing them too is
 * how a graph becomes a hairball. Never rendered.
 *
 * `belongs_to` joined them once the count was measurable. A requirement
 * belongs to the Scope, and the model ring it sits in contains nothing but
 * requirements and the Scope chip — so position states it exactly as it
 * states cluster membership. With two requirements the edges were cheap;
 * measured at 47 they are a starburst converging on Reality's doorstep,
 * saying something the geometry already said. Same relation class, same
 * rule, and the edge still exists in the graph, in the export, and in the
 * inspector — it is simply not a stroke.
 */
export const MEMBERSHIP_RELS = new Set(["attests", "belongs_to"]);

/** Human-readable relation names for the inspector's connection list. */
export const REL_LABEL: Record<string, string> = {
  supports: "supports",
  concerns: "concerns",
  missing_from: "missing from",
  evidenced_by: "evidenced by",
  extracted_from: "extracted from",
  linked_to: "linked to",
  depends_on: "depends on",
  blocks: "blocks",
  resolves: "resolves",
  implements: "implements",
  supersedes: "supersedes",
  attests: "belongs to",
  allocated_to: "allocated to",
  // The producer's OWN relation name is printed where there is one — this is
  // the fallback for an edge that somehow lost it, and it is deliberately
  // vague rather than guessing.
  intel_relation: "external relation",
  cites: "cites",
};

export const KIND_LABEL: Record<NodeKind, string> = {
  reality: "Reality",
  scope: "Project",
  lane: "Cluster",
  checkpoint: "Checkpoint",
  finding: "Finding",
  work: "Work item",
  feature: "Feature",
  decision: "Decision",
  decisionGate: "Gate",
  dependency: "Dependency",
  intelligence: "Intelligence package",
  passage: "Evidence passage",
  source: "Source",
  requirement: "Requirement",
  person: "Person",
  transcript: "Transcript",
  notion_page: "Notion page",
  figma_artifact: "Figma artifact",
  intel: "External intelligence",
};
