"use client";

// THE STORY READOUT — what the instrument just read off the score.
//
// Playback had no words. A mark brightened, a band stepped, and you were
// left to work out which of the four projects had just changed and by how
// much. The score can show WHERE something happened; only a readout can say
// WHAT it was, and the transport is where an instrument keeps its metadata.
//
// It reads as a STANZA PER PROJECT, not a list of mixed events:
//
//     JUN 30
//     JSA                 PLATFORM
//     Build kickoff       SEP 18 → SEP 22 · 4d later
//
// The moment's date is stated once, at the top, because every stanza shares
// it. Under it the eye reads down two things only — whose it was, and what
// it was — which is what makes the whole display legible in well under a
// second whether one project moved or four did.
//
// It is not a toast: nothing floats over the work, nothing has to be
// dismissed, and it occupies a reserved slot of fixed height, so its content
// changing never moves a control or resizes the score. When nothing is
// happening it does not go blank and it does not invent a sentence — it
// holds the last real change, dimmed, and says so.
//
// Every word comes from a stored field or a subtraction between two stored
// dates. See lib/timeline/moment.ts for why that is the whole rule.

import type { Moment, Stanza } from "@/lib/timeline/moment";
import { stanzasOf } from "@/lib/timeline/moment";
import { fmtDay } from "@/lib/timeline/geometry";

/** How many projects are spelled out before the rest become a count. Three
    at the bay's width leaves each stanza room for a full forecast movement
    without truncating "12d earlier" off the end. */
const SPELLED = 3;

function StanzaBlock({ stanza, laneName, live }: { stanza: Stanza; laneName: string; live: boolean }) {
  const dim = live ? 1 : 0.62;
  return (
    <div className="min-w-0" data-shoot={`stanza-${stanza.scopeId}`} data-kind={stanza.kind}>
      {/* WHOSE. Always first, always the same size and colour, so the row of
          project names reads as one line across the display. */}
      <div
        className="text-[7.5px] uppercase tracking-[0.17em] truncate"
        style={{ color: "var(--i-violet)", opacity: dim }}
      >
        {laneName}
      </div>
      {/* WHAT. One line, in the instrument's own words. */}
      {stanza.kind === "forecast" ? (
        <div className="flex items-baseline gap-1 mt-[3px] min-w-0" data-shoot="beat-forecast">
          <span className="i-readout text-[10px] shrink-0" style={{ color: "var(--i-text-faint)", opacity: dim }}>
            {fmtDay(new Date(stanza.fromLikely!).getTime())}
          </span>
          <span className="text-[9px] shrink-0" style={{ color: "var(--i-text-faint)", opacity: dim }}>→</span>
          <span className="i-readout text-[12px] shrink-0" style={{ color: "var(--i-violet)", opacity: dim }}>
            {fmtDay(new Date(stanza.toLikely!).getTime())}
          </span>
          {stanza.days !== 0 && (
            <>
              <span className="text-[9px] shrink-0" style={{ color: "var(--i-text-faint)", opacity: dim }}>·</span>
              {/* EXPLICIT, ALWAYS. "3d" alone is a magnitude with no
                  direction, and direction is the entire meaning. */}
              <span
                className="text-[8.5px] shrink-0"
                style={{ color: stanza.days! > 0 ? "var(--i-red)" : "var(--i-mint)", opacity: dim }}
              >
                {Math.abs(stanza.days!)}d {stanza.days! > 0 ? "later" : "earlier"}
              </span>
            </>
          )}
          {stanza.extra > 0 && (
            <span className="text-[8px] shrink-0" style={{ color: "var(--i-text-faint)", opacity: dim }}>
              +{stanza.extra}
            </span>
          )}
        </div>
      ) : (
        <div
          className="text-[11.5px] leading-none mt-[4px] truncate"
          style={{ color: "var(--i-text)", opacity: dim }}
          data-shoot="beat-event"
        >
          {stanza.kind === "events" ? `${stanza.count} events` : stanza.title}
        </div>
      )}
    </div>
  );
}

export default function NowPlaying({
  moment, laneNames, playing, live, reducedMotion,
}: {
  moment: Moment | null;
  laneNames: Record<string, string>;
  playing: boolean;
  /** True while this is what the playhead JUST struck; false while it is the
      last real change, held through a quiet stretch. */
  live: boolean;
  reducedMotion: boolean;
}) {
  const stanzas = moment ? stanzasOf(moment) : [];
  const shown = stanzas.slice(0, SPELLED);
  const rest = stanzas.length - shown.length;

  return (
    <div
      data-shoot="now-playing"
      data-live={moment && live ? true : undefined}
      data-holding={moment && !live ? true : undefined}
      data-beats={moment ? moment.beats.length : 0}
      data-stanzas={stanzas.length}
      // min-w-[112px] is the width at which the quiet state can still say
      // "Nothing at the playhead" without slicing a word. Below it the block
      // was rendering as a clipped fragment; the standalone Timeline gives
      // this ~379px, so the floor only ever binds inside a narrow embed.
      className="flex-1 min-w-[112px] self-stretch my-1.5 rounded-lg flex flex-col justify-center px-3.5 overflow-hidden"
      style={{
        background: "var(--i-recess)",
        border: `1px solid ${moment && live ? "rgba(155,140,250,0.5)" : "#1c2227"}`,
        boxShadow: moment && live
          ? "inset 0 2px 8px rgba(0,0,0,0.7), 0 0 0 1px rgba(155,140,250,0.14)"
          : "inset 0 2px 8px rgba(0,0,0,0.7)",
        // The border is the only thing that moves. Nothing resizes, so the
        // controls either side of this never shift under the pointer.
        transition: reducedMotion ? undefined : "border-color 260ms ease, box-shadow 260ms ease",
      }}
    >
      {moment ? (
        <>
          <div className="flex items-baseline gap-2 min-w-0">
            {/* QUIET TIME IS STILL TIME. Through a stretch where nothing
                happens the display does not blank and does not invent a
                sentence: it keeps the last REAL change, dimmed, and labels
                it as such. The transport's time bar is what shows that the
                playhead is still moving. */}
            {!live && (
              <span
                className="text-[7.5px] uppercase tracking-[0.18em] shrink-0"
                style={{ color: "var(--i-text-faint)" }}
                data-shoot="now-playing-holding"
              >
                Last change
              </span>
            )}
            <span
              className="i-readout text-[10.5px] leading-none"
              data-shoot="now-playing-date"
              style={{ color: live ? "var(--i-violet)" : "var(--i-text-faint)" }}
            >
              {fmtDay(moment.t)}
            </span>
            {rest > 0 && (
              <span className="text-[7.5px] shrink-0" style={{ color: "var(--i-text-faint)" }} data-shoot="now-playing-more">
                +{rest} more
              </span>
            )}
          </div>
          <div
            className="grid gap-x-7 mt-[6px] min-w-0"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, shown.length)}, minmax(0, 1fr))`,
              animation: reducedMotion ? undefined : "tl-readout 200ms cubic-bezier(0.22,0.61,0.36,1)",
            }}
          >
            {shown.map((st) => (
              <StanzaBlock key={st.scopeId} stanza={st} laneName={laneNames[st.scopeId] ?? ""} live={live} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-[8.5px] uppercase tracking-[0.16em]" style={{ color: "var(--i-text-faint)" }}>
          {playing ? "Playing" : "Nothing at the playhead"}
        </div>
      )}
    </div>
  );
}
