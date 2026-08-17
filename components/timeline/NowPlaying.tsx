"use client";

// THE STORY READOUT — what the instrument just read off the score.
//
// Playback had no words. A mark brightened, a band stepped, and you were
// left to work out which of the four projects had just changed and by how
// much. The score can show WHERE something happened; only a readout can say
// WHAT it was, and the transport is where an instrument keeps its metadata.
//
// So this sits in the transport, beside the playhead date, in the dead
// space that was already there. It is not a toast: nothing floats over the
// work, nothing has to be dismissed, and it occupies a reserved slot so its
// arrival never moves a control out from under the pointer. When there is
// nothing to say it says so quietly and keeps its place.
//
// Every word in it comes from a stored field or a subtraction between two
// stored dates. See lib/timeline/moment.ts for why that is the whole rule.

import type { Moment, Beat } from "@/lib/timeline/moment";
import { fmtDay } from "@/lib/timeline/geometry";
import { FAMILY_COLOR } from "./familyColor";

// HOW MUCH FITS, WITHOUT THE DISPLAY GROWING.
//
// The bay is fixed height and wide, so beats go across before they go down:
// one column while there are one or two, two columns beyond that. Four
// projects reporting in the same week — the case this readout exists for —
// lands as a 2×2 block that is read in one glance, and the alternative
// (stacking four rows) simply did not fit and quietly clipped the last one.
const ROWS = 2;
const spelledFor = (n: number) => (n <= ROWS ? n : ROWS * 2);

function BeatLine({ beat, laneName }: { beat: Beat; laneName: string }) {
  if (beat.kind === "forecast") {
    const later = beat.days > 0;
    return (
      <div className="flex items-baseline gap-1.5 min-w-0" data-shoot="beat-forecast">
        <span
          className="text-[7.5px] uppercase tracking-[0.14em] shrink-0"
          style={{ color: "var(--i-violet)" }}
        >
          {laneName}
        </span>
        <span className="i-readout text-[10px] shrink-0" style={{ color: "var(--i-text-faint)" }}>
          {fmtDay(new Date(beat.fromLikely).getTime())}
        </span>
        <span className="text-[9px] shrink-0" style={{ color: "var(--i-text-faint)" }}>→</span>
        <span className="i-readout text-[12px] shrink-0" style={{ color: "var(--i-violet)" }}>
          {fmtDay(new Date(beat.toLikely).getTime())}
        </span>
        {beat.days !== 0 && (
          <span
            className="text-[8.5px] shrink-0"
            style={{ color: later ? "var(--i-red)" : "var(--i-mint)" }}
          >
            {Math.abs(beat.days)}d {later ? "later" : "earlier"}
          </span>
        )}
      </div>
    );
  }
  const color = FAMILY_COLOR[beat.family] ?? "var(--i-text-soft)";
  return (
    <div className="flex items-baseline gap-1.5 min-w-0" data-shoot="beat-event">
      {/* WHICH PROJECT, ALWAYS. Four projects report in the same week and a
          bare title cannot say whose week it was. Same position and same
          treatment as on a forecast line, so the eye reads down one column
          for the project and one for what happened. */}
      <span
        className="text-[7.5px] uppercase tracking-[0.14em] shrink-0"
        style={{ color: "var(--i-violet)" }}
      >
        {laneName}
      </span>
      <span className="shrink-0 rounded-[1px]" style={{ width: 4, height: 4, background: color }} />
      <span className="text-[11px] leading-none truncate" style={{ color: "var(--i-text)" }}>
        {beat.title}
      </span>
      {/* SAID ONCE. A Report's title IS its kind — "Forecast report /
          FORECAST REPORT" is the same word twice, and the second one is
          the kind of debris that makes a readout look generated. */}
      {beat.label.toLowerCase() !== beat.title.toLowerCase() && (
        <span
          className="text-[7.5px] uppercase tracking-[0.13em] shrink-0"
          style={{ color }}
        >
          {beat.label}
        </span>
      )}
    </div>
  );
}

export default function NowPlaying({
  moment, laneNames, playing, reducedMotion,
}: {
  moment: Moment | null;
  laneNames: Record<string, string>;
  playing: boolean;
  reducedMotion: boolean;
}) {
  const shown = moment ? moment.beats.slice(0, spelledFor(moment.beats.length)) : [];
  const rest = moment ? moment.beats.length - shown.length : 0;
  const twoUp = shown.length > ROWS;

  return (
    <div
      data-shoot="now-playing"
      data-live={moment ? true : undefined}
      data-beats={moment ? moment.beats.length : 0}
      className="flex-1 min-w-0 self-stretch my-1.5 rounded-lg flex flex-col justify-center px-3.5 overflow-hidden"
      style={{
        background: "var(--i-recess)",
        border: `1px solid ${moment ? "rgba(155,140,250,0.5)" : "#1c2227"}`,
        boxShadow: moment
          ? "inset 0 2px 8px rgba(0,0,0,0.7), 0 0 0 1px rgba(155,140,250,0.14)"
          : "inset 0 2px 8px rgba(0,0,0,0.7)",
        // The border is the only thing that moves. Nothing resizes, so the
        // controls either side of this never shift under the pointer.
        transition: reducedMotion ? undefined : "border-color 260ms ease, box-shadow 260ms ease",
      }}
    >
      {moment ? (
        <>
          <div className="flex items-center gap-2 mb-[3px]">
            <span
              className="i-readout text-[10px] leading-none"
              data-shoot="now-playing-date"
              style={{ color: "var(--i-violet)" }}
            >
              {fmtDay(moment.t)}
            </span>
            {moment.beats.length > 1 && (
              <span
                className="text-[7.5px] uppercase tracking-[0.16em]"
                style={{ color: "var(--i-text-faint)" }}
                data-shoot="now-playing-count"
              >
                {/* SAID ONCE, NOT DRAWN N TIMES. Several things landing on
                    one afternoon is itself the fact worth reporting. */}
                {moment.beats.length} changes
              </span>
            )}
            {rest > 0 && (
              // ON THE HEADER LINE, NOT UNDER THE LIST. As a fourth row it
              // was the row that fell off the bottom of the bay — the one
              // piece of text whose whole job is to say something is being
              // left out, itself left out.
              <span className="text-[7.5px]" style={{ color: "var(--i-text-faint)" }} data-shoot="now-playing-more">
                +{rest} more
              </span>
            )}
          </div>
          <div
            className={`grid gap-x-6 gap-y-[2px] min-w-0 ${twoUp ? "grid-cols-2" : "grid-cols-1"}`}
            style={{
              gridAutoFlow: "column",
              gridTemplateRows: `repeat(${Math.min(ROWS, shown.length)}, minmax(0, 1fr))`,
              animation: reducedMotion ? undefined : "tl-readout 200ms cubic-bezier(0.22,0.61,0.36,1)",
            }}
          >
            {shown.map((b) => (
              <BeatLine key={b.id} beat={b} laneName={laneNames[b.scopeId] ?? ""} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-[8.5px] uppercase tracking-[0.16em]" style={{ color: "var(--i-text-faint)" }}>
          {playing ? "Playing · quiet stretch" : "Nothing at the playhead"}
        </div>
      )}
    </div>
  );
}
