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
  // A PASSAGE IS A QUOTATION, AND SIGNAL'S OWN. Luminous neutral rather than
  // faint grey: the evidence sector is 156 of the field's 407 seats, and at
  // --i-text-faint the entire substrate of the project read as dust. Silver
  // is still quieter than any claim and now legible as a population.
  passage: "var(--i-silver)",
  source: "var(--i-source)",
  // SOURCE ARTIFACTS ARE HUBS, AND THE FIELD SHOULD SAY SO. They are the
  // anchor points the whole evidence sector hangs off — 45 of them carrying
  // 156 passages and cited by 141 external objects — and at --i-text-faint
  // that entire structure was invisible. Same cyan family as Reality, a step
  // deeper: "where knowledge came from" reads as Signal's own material,
  // never as Reality itself. Shape still says which KIND of artifact.
  transcript: "var(--i-source)",
  notion_page: "var(--i-source)",
  figma_artifact: "var(--i-source)",
  // EXTERNAL INTELLIGENCE NOW CARRIES ITS PRODUCER'S TYPE AS COLOUR — see
  // INTEL_COLOR and the amendment written above it. This entry is the
  // fallback for an object whose type Signal does not recognise; the live
  // value comes from `intelColor`.
  //
  // The three channels that carry EXTERNALITY are unchanged and still do all
  // the boundary work: the shard glyph, the broken stroke, and a seat outside
  // the record's edge. Hue was never one of them.
  intel: "var(--i-slate)",
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
/**
 * THE PRODUCER'S TYPES, IN COLOUR.
 *
 * A blind production audit scored every external population at 0/5 for "can
 * you tell what this is without reading the label". 161 objects in one grey
 * is a scatter plot, not an instrument — and the objects are not
 * interchangeable: a Risk and a Commitment are opposite kinds of news about
 * the same project.
 *
 * THIS IS A DELIBERATE AMENDMENT to the field's older rule that "colour means
 * state, not category". That rule was written when the whole field was
 * Signal's own record, where the categories are already carried by shape and
 * by sector, and the only thing left to say was how bad something was. It
 * does not survive a population of 161 external claims of eight different
 * types occupying one band: there, TYPE IS THE STATE — a risk being a risk is
 * the actionable fact about it.
 *
 * What the amendment does NOT do:
 *   · Findings keep their state colours. Severity still means severity.
 *   · Reality keeps its cyan. Nothing else may take it.
 *   · Trust is untouched. attested / inferred / external stays on the stroke,
 *     because a hue that meant both identity and trust would mean neither.
 *   · Selection stays luminance, scale and glow. No new hue is spent on it.
 *
 * Unrecognised types fall to slate rather than to a new colour: the producer
 * may add a type tomorrow, and an instrument that invents a hue for something
 * it does not understand is claiming to understand it.
 */
const INTEL_COLOR: Record<string, string> = {
  risk: "var(--i-coral)",
  decision: "var(--i-violet)",
  dependency: "var(--i-amber)",
  commitment: "var(--i-mint)",
  // Open questions are drawn hollow as well as indigo — see NODE_SHAPE. An
  // unknown is the one population whose whole content is that it has no
  // content yet, and an empty outline says that before any hue does.
  unknown: "var(--i-cool)",
  observation: "var(--i-slate)",
  availability_observation: "var(--i-slate)",
  climate_evidence: "var(--i-slate)",
};

/**
 * THE NAME A HUMAN WOULD USE.
 *
 * `label` is the canonical thing the node projects, and for two populations
 * that is an identifier rather than a name:
 *
 *   a passage       `hermes-ev:2026-07-30_KE-Teams-…-seg018`
 *   a package source `ke://source/transcript/2026-08-19_KE-User-Interview-…`
 *
 * 156 passages and 45 artifacts labelled like that is a field of accession
 * numbers. The quote and the meeting name are both already on the node; they
 * were simply never the thing drawn.
 *
 * The identifier is not lost — it is exact, it is what you check against the
 * producer, and it is one disclosure away in Technical details. This is about
 * which of the two is in the reading path.
 */
export function fieldLabel(attrs: Record<string, unknown>): string {
  if (attrs.kind === "passage" && typeof attrs.excerpt === "string" && attrs.excerpt.trim()) {
    return `“${attrs.excerpt.replace(/^["“”']+|["“”']+$/g, "").trim()}”`;
  }
  if (
    attrs.kind === "source" ||
    attrs.kind === "transcript" ||
    attrs.kind === "notion_page" ||
    attrs.kind === "figma_artifact"
  ) {
    return humanizeRef(String(attrs.label ?? ""));
  }
  return String(attrs.label ?? "");
}

/**
 * A producer's source ref, read as a meeting rather than as a URI.
 *
 *   ke://source/transcript/2026-08-19_KE-User-Interview-Follow-Up
 *     →  2026-08-19 · KE User Interview Follow Up
 *
 * The date is kept intact — its hyphens are part of it, and a transcript's
 * date is half of how anyone identifies it. Only the underscore-separated
 * name is unpicked.
 */
export function humanizeRef(ref: string): string {
  if (!ref.includes("/") && !ref.includes("_")) return ref;
  const seg = ref.split("/").filter(Boolean).pop() ?? ref;
  const parts = seg.split("_");
  const head = parts[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(head) && parts.length > 1) {
    return `${head} · ${parts.slice(1).join(" ").replace(/-/g, " ")}`;
  }
  return seg.replace(/_+/g, " ");
}

export function intelColor(type: unknown): string {
  return INTEL_COLOR[normalizeIntelType(type)] ?? "var(--i-slate)";
}

/** The producer writes `availability_observation`, `AvailabilityObservation`
    and `availability observation` for the same thing. One reading, here. */
export function normalizeIntelType(type: unknown): string {
  return String(type ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Whether this external type is drawn as an empty outline. */
export function intelIsHollow(type: unknown): boolean {
  return normalizeIntelType(type) === "unknown";
}

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
  // A passage that nobody has cited and nothing was extracted into is still a
  // passage; it takes the same silver. Emptiness is carried by the web, not
  // by hue.
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
    // Superseded history keeps a single muted grey whatever it once was: it
    // is no longer a live claim of any kind, and colouring it by type would
    // put the past on equal footing with the present.
    if (attrs.isCurrent === false) return "var(--i-text-faint)";
    return intelColor(attrs.intelligenceType);
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

// ── FUNCTIONAL LUMINANCE ───────────────────────────────────────────────
//
// Law 4: glow is not polish here, it is the hierarchy. `TIER.focus` used to
// be one number for "everything the selection touches", which meant a
// Finding's amber neighbour, the passage that grounds it and a `related_to`
// claim from the producer all arrived at exactly the same brightness. The eye
// was given eleven equally-bright things and no order to read them in.
//
// Five steps, and the gaps between them are chosen to be legible rather than
// even: SEMANTIC has to look like the answer, TEMPORAL like a distinct kind
// of answer, PROVENANCE like the footnote it is, and CONTEXTUAL like
// something that is present rather than something you are being shown.
//
// UNRELATED IS DELIBERATELY BRIGHTER THAN THE OLD `dimmed` 0.1. That is only
// affordable because unrelated marks are now also SOFTENED — optical depth
// carries the separation that opacity alone used to have to carry, so the
// field can stay legible as a map while asking the eye to read only the local
// world. Dimming to near-black bought attention by destroying orientation.
export const FOCUS_TIER = {
  anchor: 1,
  semantic: 0.94,
  temporal: 0.88,
  provenance: 0.7,
  /** Present, reachable, listed in the inspector — and never competing. */
  contextual: 0.3,
  /** Everything the selection does not touch. Softened, not extinguished. */
  unrelated: 0.24,
  /** A latent mark that the selection does not touch. Below `unrelated`,
      because a thing with no name on it must never outrank a real node that
      has been pushed back. */
  unrelatedLatent: 0.14,
} as const;

export type FocusTierName = keyof typeof FOCUS_TIER;

/**
 * How loud a woken edge is, by class.
 *
 * PROVENANCE IS QUIETER THAN THE MEANING IT SUPPORTS. A finding with nine
 * citations should not read as nine equal statements about the project — the
 * citations are how it is known, drawn as a filament, and the one `depends_on`
 * is what it means.
 */
export const FOCUS_EDGE = {
  semantic: 0.95,
  temporal: 0.95,
  provenance: 0.62,
  /** `related_to` at its own endpoint: a hairline. Visible if looked for,
      invisible if not. */
  contextual: 0.16,
} as const;

// ── OPTICAL DEPTH ──────────────────────────────────────────────────────
//
// Three depths, addressed by CSS class rather than by an inline filter so the
// browser sees one rule for four hundred elements instead of four hundred
// distinct filter chains. See `.sg-depth-*` in app/globals.css.
//
//   0  sharp      the selection, its semantic and temporal neighbours, and
//                 the provenance route. Everything the reader is being asked
//                 to READ.
//   1  soft       unrelated marks and unrelated structure. Still exactly
//                 where they were, still the right colour and size — the map
//                 survives, the invitation to read it does not.
//   2  softer     unrelated LABELS, which is where blur does its real work:
//                 text is what the eye tries hardest to resolve, so text is
//                 what has to stop asking.
/**
 * THE CALM-STATE WEB, AS LITERAL OPACITIES.
 *
 * "Very faint, label-free, visually subordinate, still clearly present" is
 * four constraints and they fight. These are where they settle:
 *
 * A STRAND is one real relationship, so it may be read. 0.3 on a hairline is
 * legible if you look at it and invisible if you are looking at something
 * else, which is the definition of subordinate.
 *
 * A SHEAF FILAMENT is one three-hundred-and-fifty-fourth of a mesh. It is
 * drawn at a tenth of a strand because it is not there to be read — it is
 * there to ACCUMULATE. Where twenty-six passages converge on one artifact the
 * overlapping filaments sum into something the eye reads as a stem; where
 * nothing converges there is almost nothing on screen. The density IS the
 * information, and that only works if a single filament is nearly nothing.
 *
 * Both recede further the moment something is selected, because then the
 * field has a subject and the web is its context.
 */
export const WEB = {
  strand: 0.3,
  strandFocused: 0.09,
  sheaf: 0.14,
  sheafFocused: 0.045,
} as const;

export type Depth = 0 | 1 | 2;

/**
 * THE SAME SOFTENING, IN PIXELS.
 *
 * The SVG renderer reaches optical depth through a CSS class, because one
 * compiled rule shared by four hundred elements is far cheaper than four
 * hundred inline filter chains. A canvas has no stylesheet to reach, so it
 * needs the numbers themselves.
 *
 * THESE MUST TRACK `.sg-depth-*` IN app/globals.css. They are stated here
 * rather than read from the stylesheet because a painter that queried CSS per
 * frame would be paying a style recalculation for a constant.
 */
export const DEPTH_BLUR_PX: Record<Depth, number> = {
  0: 0,
  1: 0.5,
  2: 1.15,
};

export const DEPTH_CLASS: Record<Depth, string | undefined> = {
  0: undefined,
  1: "sg-depth-1",
  2: "sg-depth-2",
};

/**
 * ZOOM THRESHOLDS — explicit, not "labels scale with k".
 *
 * The reference reveals detail in steps as the camera closes, which is what
 * makes a dense field readable at every distance. Scaling text continuously
 * would just produce unreadably small labels at far zoom instead of no
 * labels, which is worse.
 */
export const ZOOM = {
  /** Below this: project shape only — regions, constellation shells, counts. */
  far: 0.95,
  /** Below this: constellation level — hubs, groups, representative names. */
  medium: 1.6,
  /** Below this: named objects. Above: evidence, verbatim. */
  near: 2.6,
} as const;

/**
 * FOUR TIERS, AND WHAT EACH ONE IS FOR.
 *
 * ZOOM REVEALS IDENTITY, NOT TRUTH. The entity and its truth status never
 * change; what changes is how much of itself it is showing.
 *
 *   far     the whole project. Regions, constellation shells and their
 *           counts, the structural web. No individual names — at 407 nodes
 *           that is not a map, it is a wall of text.
 *   medium  the constellations. Hubs and groups form; each group names a
 *           couple of representatives so the reader learns what KIND of
 *           thing lives in it without reading four hundred labels.
 *   near    the named objects. Every risk, decision, commitment, unknown,
 *           observation, transcript and finding carries its short human
 *           name. This is where a selection's framing lands.
 *   close   the evidence. Passages carry their quote, checkpoints their
 *           assertion, relationships their verb.
 *
 * A THIRD TIER WAS ADDED HERE, and the reason is the whole tranche: with
 * three tiers, external objects went from unlabelled mass straight to a
 * hundred labels, and passages from mass to a hundred quotes. There was no
 * step at which you could read "what kinds of knowledge live here" — the
 * question the middle of the ladder exists to answer.
 */
export type ZoomLevel = "far" | "medium" | "near" | "close";

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
  /** medium → near */
  enterNear: ZOOM.medium * (1 + ZOOM_BAND),
  /** near → medium */
  exitNear: ZOOM.medium * (1 - ZOOM_BAND),
  /** near → close */
  enterClose: ZOOM.near * (1 + ZOOM_BAND),
  /** close → near */
  exitClose: ZOOM.near * (1 - ZOOM_BAND),
} as const;

/** The tiers in order, outermost first. Used wherever a comparison needs to
    know which of two tiers is closer in. */
export const ZOOM_ORDER: ZoomLevel[] = ["far", "medium", "near", "close"];

export function atLeast(level: ZoomLevel, min: ZoomLevel): boolean {
  return ZOOM_ORDER.indexOf(level) >= ZOOM_ORDER.indexOf(min);
}

/** The tier a camera starting from nothing sits at. Bare thresholds, because
    with no previous tier there is nothing to be sticky about. */
export function zoomLevel(k: number): ZoomLevel {
  if (k < ZOOM.far) return "far";
  if (k < ZOOM.medium) return "medium";
  if (k < ZOOM.near) return "near";
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
  // Each case asks only whether the camera has cleared a gate in the
  // direction it is travelling; anything inside a band keeps the tier it is
  // already in. Written out per tier rather than as a loop because the
  // asymmetry IS the hysteresis, and a loop hides it.
  const upFrom = (base: ZoomLevel): ZoomLevel => {
    if (k >= ZOOM_GATES.enterClose) return "close";
    if (k >= ZOOM_GATES.enterNear) return "near";
    if (k >= ZOOM_GATES.enterMedium) return "medium";
    return base;
  };
  switch (from) {
    case "far":
      return upFrom("far");
    case "medium":
      if (k >= ZOOM_GATES.enterNear) return upFrom("medium");
      return k <= ZOOM_GATES.exitMedium ? "far" : "medium";
    case "near":
      if (k >= ZOOM_GATES.enterClose) return "close";
      if (k <= ZOOM_GATES.exitMedium) return "far";
      return k <= ZOOM_GATES.exitNear ? "medium" : "near";
    case "close":
      if (k <= ZOOM_GATES.exitMedium) return "far";
      if (k <= ZOOM_GATES.exitNear) return "medium";
      return k <= ZOOM_GATES.exitClose ? "near" : "close";
  }
}

/** Which kinds carry a visible label at each level. Reality and cluster
    pucks always label — they are the map's legend. */
const LABELLED_AT: Record<ZoomLevel, NodeKind[]> = {
  // THE PROJECT'S OWN LEGEND, AND NOTHING ELSE. Regions and Reality. The
  // constellation shells carry their own names and counts at this tier, and
  // they are not nodes, so they are not in this table.
  far: ["reality", "lane"],
  // THE CONSTELLATION TIER. Hubs and structure: what KINDS of knowledge live
  // where. Source artifacts label here because a source IS the hub of its
  // constellation — "2026-08-06 · KE Backlog Refinement" is the name of the
  // shape you are looking at, not detail inside it. Each group also names a
  // couple of representative members; see `representatives`.
  medium: [
    "reality",
    "lane",
    "dependency",
    "decision",
    "feature",
    "scope",
    "intelligence",
    "requirement",
    "person",
    "source",
    "transcript",
    "notion_page",
    "figma_artifact",
  ],
  // THE NAMED-OBJECT TIER, and where a selection's framing lands. Every
  // external claim, every work item, every finding carries its short human
  // name. This is the answer to the gray-dot test: zoom toward any real
  // information-rich mark and by this tier it has told you what it is.
  near: [
    "reality",
    "lane",
    "dependency",
    "decision",
    "decisionGate",
    "feature",
    "scope",
    "intelligence",
    "requirement",
    "person",
    "source",
    "transcript",
    "notion_page",
    "figma_artifact",
    "work",
    "finding",
    "intel",
  ],
  // THE EVIDENCE TIER. Passages arrive last and carry their quote — 156 of
  // them, each a sentence, and printing those at any wider tier buries the
  // structure they belong to. Checkpoints join here for the same reason: they
  // are Signal's own computed assertions, the finest grain the field holds.
  close: [
    "reality",
    "lane",
    "dependency",
    "decision",
    "decisionGate",
    "feature",
    "scope",
    "intelligence",
    "requirement",
    "person",
    "source",
    "transcript",
    "notion_page",
    "figma_artifact",
    "work",
    "finding",
    "intel",
    "passage",
    "checkpoint",
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
  near: { scale: 0.64, opacity: 0.66, minPx: 2.7 },
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
 * TWO WAYS TO STOP BEING A MARK, AND THEY MEAN DIFFERENT THINGS.
 *
 * `opened` is the reader's own act — the core slice, plus any cluster,
 * source or group they have expanded. It is a decision, it persists, and it
 * holds at every zoom: expanding a cluster you are looking at from across
 * the field must still show you what is in it.
 *
 * `resolved` is DISTANCE. This is the tranche's primary law — ZOOM REVEALS
 * IDENTITY — and the rule it replaces was the opposite one: "zoom governs
 * the step from formed to named and never the step from latent to formed".
 * Measured against that rule, the real corpus at 300% was 392 nameless dots
 * with two labels on the whole field. You could go as close as you liked and
 * the field never told you what anything was, which is the gray-dot failure
 * with extra steps.
 *
 * So from the NEAR tier inward, a mark that is actually on screen becomes
 * itself. The caller decides what "on screen" means, because it owns the
 * viewport; this function only knows that a resolved node is no longer dust.
 *
 * WHAT RESOLUTION IS NOT: it is not opening. A resolved node does not join
 * `openedNow`, so it wakes NO EDGES — going closer must not turn the field
 * into the hairball that the whole layout refuses. And it is not a licence to
 * print: naming is still gated by the tier's own vocabulary here, and then by
 * the renderer's collision-and-budget pass, which is what keeps 156 passages
 * from stacking into a smear.
 */
export function identityOf(kind: NodeKind, opened: boolean, level: ZoomLevel, resolved = false): Identity {
  if (!opened && !resolved) return "latent";
  return labelsFor(level).has(kind) ? "named" : "formed";
}

/** The tier from which distance alone resolves a mark into itself. Below it
    the marks are population and the shells are the subject. */
export const RESOLVE_AT: ZoomLevel = "near";

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
