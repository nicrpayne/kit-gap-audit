// EVENT-DENSE PLAYBACK.
//
// The naive scheme — one calendar day per fixed slice of wall clock — is
// what makes most timeline players unwatchable. A project is mostly quiet.
// Play it at a constant rate and you spend most of the runtime staring at
// an empty grid, then miss three events that land on the same afternoon.
//
// So wall-clock velocity varies while the DATE AXIS DOES NOT. The playhead
// is always at its true absolute position; what changes is how fast it
// travels between positions. Quiet stretches are crossed quickly, the
// approach to an event decelerates, an event is dwelt on long enough to
// read, and several events on one day are sequenced rather than collapsed.
//
// The whole schedule is computed ONCE from the real dates, as a list of
// segments. That is deliberate: it makes the choreography a pure function
// of the data, testable without a browser and without a clock, and it means
// playback cannot drift from the timeline it is describing.

export interface PlayableEvent {
  id: string;
  /** Epoch ms. The real, stored timestamp. */
  t: number;
}

export interface PlaybackSegment {
  /** Playhead date at the start / end of this segment, epoch ms. */
  fromT: number;
  toT: number;
  /** Wall-clock milliseconds this segment should take at 1x. */
  durationMs: number;
  /** Events that become crossed exactly at the END of this segment. */
  arriving: string[];
  /** True for a dwell: the playhead does not move, it rests on an event. */
  dwell: boolean;
}

export interface PlaybackPlan {
  segments: PlaybackSegment[];
  /** Total wall-clock ms at 1x. */
  totalMs: number;
  startT: number;
  endT: number;
}

/** Wall-clock budget for one traversal, at 1x. Tuned so a two-month
    history reads in well under a minute without feeling rushed. */
const TRAVEL_MS_PER_EVENT_GAP = 900;
const MIN_TRAVEL_MS = 260;
const MAX_TRAVEL_MS = 1700;
/** How long the playhead rests on an event so it can be read. */
const DWELL_MS = 620;
/** Events closer together than this are treated as the same moment and
    sequenced as one group with a shared arrival. */
const SAME_MOMENT_MS = 6 * 3600 * 1000;

/**
 * Build the schedule.
 *
 * `endT` is the hard stop — in practice NOW. Events after it are not
 * included: automatic playback tells the story THEN → NOW and does not
 * play through plans as though they had happened.
 */
export function buildPlaybackPlan(
  events: PlayableEvent[],
  startT: number,
  endT: number
): PlaybackPlan {
  const inRange = events
    .filter((e) => e.t >= startT && e.t <= endT)
    .sort((a, b) => a.t - b.t);

  // Group events that share a moment, so three things on one afternoon
  // arrive together rather than producing three indistinguishable dwells.
  const groups: { t: number; ids: string[] }[] = [];
  for (const e of inRange) {
    const last = groups[groups.length - 1];
    if (last && e.t - last.t <= SAME_MOMENT_MS) last.ids.push(e.id);
    else groups.push({ t: e.t, ids: [e.id] });
  }

  const segments: PlaybackSegment[] = [];
  let cursor = startT;

  // Longest quiet stretch sets the scale, so "quick" is relative to this
  // project's own rhythm rather than an absolute constant.
  const gaps = groups.map((g, i) => g.t - (i === 0 ? startT : groups[i - 1].t));
  const maxGap = Math.max(1, ...gaps);

  for (const g of groups) {
    const gap = g.t - cursor;
    if (gap > 0) {
      // Sub-linear in the gap: a gap ten times longer takes only about
      // three times as long to cross. That is what kills the dead air.
      const ratio = Math.sqrt(gap / maxGap);
      const travel = Math.min(MAX_TRAVEL_MS, Math.max(MIN_TRAVEL_MS, TRAVEL_MS_PER_EVENT_GAP * ratio));
      segments.push({ fromT: cursor, toT: g.t, durationMs: travel, arriving: g.ids, dwell: false });
    } else {
      segments.push({ fromT: cursor, toT: g.t, durationMs: 0, arriving: g.ids, dwell: false });
    }
    // Rest, so the eye can land. Several events at one moment earn a
    // little more time, but sub-linearly — ten events is not ten dwells.
    segments.push({
      fromT: g.t,
      toT: g.t,
      durationMs: DWELL_MS * (1 + Math.log2(g.ids.length + 1) - 1),
      arriving: [],
      dwell: true,
    });
    cursor = g.t;
  }

  // The run home to NOW. Always present, so playback ends at the boundary
  // rather than on top of the last event.
  if (cursor < endT) {
    segments.push({ fromT: cursor, toT: endT, durationMs: 900, arriving: [], dwell: false });
  }

  return {
    segments,
    totalMs: segments.reduce((t, s) => t + s.durationMs, 0),
    startT,
    endT,
  };
}

/**
 * Where the playhead is, and what has been crossed, after `elapsedMs` of
 * wall clock at 1x.
 *
 * Pure: same inputs, same answer, no clock read. The component multiplies
 * elapsed by the speed setting before calling — 0.5x/1x/2x scale the
 * choreography rather than reshaping it.
 */
export function playheadAt(plan: PlaybackPlan, elapsedMs: number): { t: number; crossed: Set<string>; done: boolean } {
  const crossed = new Set<string>();
  let remaining = elapsedMs;

  for (const seg of plan.segments) {
    if (remaining >= seg.durationMs) {
      remaining -= seg.durationMs;
      for (const id of seg.arriving) crossed.add(id);
      continue;
    }
    // Mid-segment. Linear within the segment; the pacing lives in how long
    // each segment is, not in an easing curve, so the playhead never
    // appears to move backwards or stall unpredictably.
    const p = seg.durationMs === 0 ? 1 : remaining / seg.durationMs;
    return { t: seg.fromT + (seg.toT - seg.fromT) * p, crossed, done: false };
  }

  return { t: plan.endT, crossed, done: true };
}

/** Everything at or before `t`. Used for scrubbing, where there is no
    elapsed clock — only a position. */
export function crossedAt(events: PlayableEvent[], t: number): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (e.t <= t) out.add(e.id);
  return out;
}
