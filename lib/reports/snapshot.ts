// WHAT A STORED REPORT IS, SAID ONCE.
//
// A Report is an immutable historical snapshot. The Reports surface used to
// present one in a frame that read as current, next to an unqualified "Copy
// to clipboard" — so QA could copy a JSA forecast of Sep 1, generated 5 Aug,
// while the live forecast said Oct 9, and paste it into an email with
// nothing marking it as five weeks old.
//
// The provenance line is composed here and used by BOTH the on-screen
// banner and the copied text, for the same reason the ticket payload is
// shared: what a person reads and what they send must not be able to drift.
//
// Nothing here regenerates or mutates a report. It describes one.

export interface SnapshotContext {
  /** When the stored report was generated. */
  generatedAt: Date;
  /** The landing date this report asserted at that time. */
  snapshotLikelyDate: Date;
  /** The live forecast's landing date, if it could be resolved at all. */
  liveLikelyDate: Date | null;
  /** Why the live forecast is unavailable, when it is. */
  liveUnavailableReason?: string | null;
}

export interface SnapshotVerdict {
  /** Whole days between the snapshot's date and the live one. Positive means
      the live forecast is LATER than this report claimed. */
  deltaDays: number | null;
  /** True when the live forecast has moved enough to mislead a reader. */
  stale: boolean;
  /** One sentence, suitable for a banner or the top of copied text. */
  line: string;
}

/** A week. Below this the snapshot and the live forecast are telling the
    same story; above it, sending the snapshot without saying so misleads.
    Deliberately a named constant rather than a literal buried in a
    comparison — it is a product judgement, and it should be arguable. */
export const STALE_AFTER_DAYS = 7;

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function describeSnapshot(ctx: SnapshotContext): SnapshotVerdict {
  const generated = fmt(ctx.generatedAt);
  const snapshot = fmt(ctx.snapshotLikelyDate);

  // No live forecast to compare against. Say that plainly rather than
  // letting silence imply the snapshot is current.
  if (!ctx.liveLikelyDate) {
    return {
      deltaDays: null,
      stale: false,
      line:
        `Historical snapshot generated ${generated}, forecasting ${snapshot}. ` +
        `The current forecast could not be resolved${
          ctx.liveUnavailableReason ? ` (${ctx.liveUnavailableReason})` : ""
        }, so this may no longer be accurate.`,
    };
  }

  const deltaDays = Math.round(
    (ctx.liveLikelyDate.getTime() - ctx.snapshotLikelyDate.getTime()) / 86400000
  );
  const live = fmt(ctx.liveLikelyDate);

  if (deltaDays === 0) {
    return {
      deltaDays: 0,
      stale: false,
      line: `Historical snapshot generated ${generated}, forecasting ${snapshot}. The current forecast still says ${live}.`,
    };
  }

  const direction = deltaDays > 0 ? "later" : "earlier";
  const magnitude = Math.abs(deltaDays);
  return {
    deltaDays,
    stale: magnitude >= STALE_AFTER_DAYS,
    line:
      `Historical snapshot generated ${generated}, forecasting ${snapshot}. ` +
      `The current forecast is ${live} — ${magnitude} day${magnitude === 1 ? "" : "s"} ${direction}.`,
  };
}

/** The copied text. The provenance goes ABOVE the report body, because a
    reader who stops after the first line must still have been told. */
export function withSnapshotProvenance(markdown: string, verdict: SnapshotVerdict): string {
  return [`> **HISTORICAL SNAPSHOT.** ${verdict.line}`, "", markdown].join("\n");
}
