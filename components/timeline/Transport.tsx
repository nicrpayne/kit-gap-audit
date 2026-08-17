"use client";

// THE TRANSPORT.
//
// The mockup's transport bar is the most physical thing in the picture,
// and reproducing that FEELING is the brief. Reproducing its CONTROLS is
// not: it shows BPM, a 4/4 time signature and undo/redo, none of which
// mean anything to a timeline. A tempo readout on a project history is
// cosplay — it looks like a DAW without doing anything a DAW does.
//
// So every control here maps to a real Timeline function, and the tactility
// comes from material and layout rather than from borrowed vocabulary.
// There is no undo/redo because Timeline has no edit stack to undo.

import { fmtFull } from "@/lib/timeline/geometry";
import type { Moment } from "@/lib/timeline/moment";
import NowPlaying from "./NowPlaying";

export type Speed = 0.5 | 1 | 2;

interface Props {
  playing: boolean;
  playheadT: number;
  nowT: number;
  atNow: boolean;
  speed: Speed;
  scaleLabel: string;
  zoomPct: number;
  crossedCount: number;
  totalPast: number;
  /** What the playhead is standing in, already reduced to facts. */
  moment: Moment | null;
  laneNames: Record<string, string>;
  reducedMotion: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToBeginning: () => void;
  onToNow: () => void;
  onSpeed: (s: Speed) => void;
  onZoom: (pct: number) => void;
  onScale: (s: "week" | "month" | "quarter") => void;
}

// A BAY. The transport is not a row of buttons -- it is grouped equipment,
// and the grouping is what makes it readable at a glance: motion here,
// speed there, scale there, zoom at the end.
const Bay = ({ label, children, grow = false }: { label?: string; children: React.ReactNode; grow?: boolean }) => (
  <div
    className={`flex flex-col justify-center gap-1.5 px-3 py-2 rounded-lg ${grow ? "flex-1 min-w-0" : ""}`}
    style={{
      background: "linear-gradient(180deg, #12171a 0%, #0c1013 100%)",
      border: "1px solid var(--i-border)",
      boxShadow: "inset 0 1px 0 rgba(243,240,230,0.035), 0 1px 2px rgba(0,0,0,0.5)",
    }}
  >
    {label && <div className="text-[7.5px] uppercase tracking-[0.18em] text-[var(--i-text-faint)]">{label}</div>}
    {children}
  </div>
);

const Btn = ({
  onClick, title, shoot, children, primary = false, disabled = false, lit = false,
}: {
  onClick: () => void; title: string; shoot: string; children: React.ReactNode;
  primary?: boolean; disabled?: boolean; lit?: boolean;
}) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    data-shoot={shoot}
    disabled={disabled}
    className="flex items-center justify-center rounded-md transition-[filter,border-color,box-shadow] hover:brightness-125 disabled:opacity-25 disabled:cursor-default"
    style={{
      width: primary ? 62 : 38,
      height: primary ? 62 : 38,
      background: primary
        ? lit
          ? "linear-gradient(180deg, #b6a9ff 0%, var(--i-violet) 100%)"
          : "linear-gradient(180deg, var(--i-violet) 0%, #6f5fd4 100%)"
        : "linear-gradient(180deg, #262f35 0%, #131a1e 100%)",
      border: `1px solid ${primary ? "#cabfff" : "var(--i-border-strong)"}`,
      borderTopColor: primary ? "#e0d8ff" : "#434d55",
      color: primary ? "var(--i-void)" : "var(--i-text)",
      boxShadow: primary
        ? `0 0 0 1px rgba(155,140,250,0.35), 0 0 ${lit ? 22 : 12}px rgba(155,140,250,${lit ? 0.5 : 0.28}), 0 4px 12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.4)`
        : "0 2px 5px rgba(0,0,0,0.65), inset 0 1px 0 rgba(243,240,230,0.09)",
    }}
  >
    {children}
  </button>
);

export default function Transport({
  playing, playheadT, nowT, atNow, speed, scaleLabel, zoomPct, crossedCount, totalPast,
  moment, laneNames, reducedMotion,
  onPlayPause, onPrev, onNext, onToBeginning, onToNow, onSpeed, onZoom, onScale,
}: Props) {
  return (
    <div
      className="shrink-0 flex items-stretch gap-2.5 px-3 py-2.5"
      style={{
        height: 96,
        borderTop: "1px solid var(--i-border-strong)",
        background: "linear-gradient(180deg, #1a2126 0%, #0e1316 42%, var(--i-void) 100%)",
        boxShadow: "inset 0 1px 0 rgba(243,240,230,0.06)",
      }}
      data-shoot="transport"
    >
      {/* PLAY — the signature control, and the biggest object down here */}
      <div
        className="flex items-center justify-center px-3 rounded-lg"
        style={{
          background: "linear-gradient(180deg, #12171a 0%, #0c1013 100%)",
          border: "1px solid var(--i-border)",
          boxShadow: "inset 0 1px 0 rgba(243,240,230,0.035)",
        }}
      >
        <Btn onClick={onPlayPause} title={playing ? "Pause" : "Play the project"} shoot="play" primary lit={playing}>
          {playing ? (
            <svg width="19" height="19" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.6" height="12" rx="1" /><rect x="8.4" y="1" width="3.6" height="12" rx="1" /></svg>
          ) : (
            <svg width="19" height="19" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5 L12.5 7 L3 12.5 Z" /></svg>
          )}
        </Btn>
      </div>

      <Bay label="Transport">
      <div className="flex items-center gap-1.5">
        <Btn onClick={onToBeginning} title="Jump to earliest event" shoot="to-beginning">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="2" height="10" rx="0.8" /><path d="M11 1.5 L11 10.5 L4 6 Z" /></svg>
        </Btn>
        <Btn onClick={onPrev} title="Previous event" shoot="prev-event">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M10 1.5 L10 10.5 L3 6 Z" /></svg>
        </Btn>
        <Btn onClick={onNext} title="Next event" shoot="next-event">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1.5 L2 10.5 L9 6 Z" /></svg>
        </Btn>
        <Btn onClick={onToNow} title="Return to now" shoot="to-now" disabled={atNow}>
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="6" r="4.4" /><path d="M6 3.4 V6 L7.8 7.2" /></svg>
        </Btn>
      </div>
      </Bay>

      {/* THE READOUT. The date under the needle, cut into the chassis. */}
      <div
        className="flex flex-col justify-center px-4 rounded-lg"
        data-shoot="playhead-readout"
        style={{
          background: "var(--i-recess)",
          border: "1px solid #1c2227",
          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.7)",
          minWidth: 232,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[7.5px] uppercase tracking-[0.18em] text-[var(--i-text-faint)]">Playhead</span>
          <span
            className="h-[5px] w-[5px] rounded-full"
            style={{
              background: playing ? "var(--i-violet)" : atNow ? "var(--i-signal)" : "var(--i-text-faint)",
              boxShadow: playing ? "0 0 7px var(--i-violet)" : undefined,
            }}
          />
          <span className="text-[7.5px] uppercase tracking-[0.14em]" style={{ color: playing ? "var(--i-violet)" : "var(--i-text-faint)" }}>
            {playing ? "playing" : atNow ? "at now" : "held"}
          </span>
        </div>
        <div
          className="i-readout text-[23px] leading-none mt-1.5"
          data-shoot="playhead-date"
          style={{ color: atNow ? "var(--i-signal)" : "var(--i-violet)" }}
        >
          {fmtFull(playheadT)}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-[3px] flex-1 rounded-full overflow-hidden" style={{ background: "#070a0c" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${totalPast === 0 ? 0 : (crossedCount / totalPast) * 100}%`,
                background: "var(--i-violet)",
                transition: "width 160ms linear",
              }}
            />
          </div>
          <span className="i-readout text-[9.5px] text-[var(--i-text-soft)]" data-shoot="crossed-count">
            {crossedCount}<span className="text-[8px] text-[var(--i-text-faint)]">/{totalPast}</span>
          </span>
        </div>
      </div>

      {/* THE STORY READOUT. What the instrument just read off the score,
          in the dead space that was already sitting between the playhead
          date and the speed controls. Reserved, so it never pushes a
          control sideways when it has something to say. */}
      <NowPlaying
        moment={moment}
        laneNames={laneNames}
        playing={playing}
        reducedMotion={reducedMotion}
      />

      {/* SPEED — scales the choreography, not the axis */}
      <Bay label="Playback">
        <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--i-border-strong)" }}>
          {([0.5, 1, 2] as Speed[]).map((s) => (
            <button
              key={s}
              onClick={() => onSpeed(s)}
              data-shoot={`speed-${s}`}
              className="px-3 py-[7px] text-[10.5px] tabular-nums transition-colors"
              style={{
                background: speed === s ? "var(--i-violet)" : "var(--i-panel-raised)",
                color: speed === s ? "var(--i-void)" : "var(--i-text-soft)",
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </Bay>

      {/* SNAP — the grid the axis is read against */}
      <Bay label="Snap">
        <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--i-border-strong)" }}>
          {(["week", "month", "quarter"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onScale(s)}
              data-shoot={`scale-${s}`}
              className="px-3 py-[7px] text-[10.5px] uppercase tracking-[0.08em] transition-colors"
              style={{
                background: scaleLabel === s ? "var(--i-violet)" : "var(--i-panel-raised)",
                color: scaleLabel === s ? "var(--i-void)" : "var(--i-text-soft)",
              }}
            >
              {s.slice(0, 1)}
            </button>
          ))}
        </div>
      </Bay>

      {/* ZOOM */}
      <Bay label="Zoom">
        <div className="flex items-center gap-2" style={{ width: 168 }}>
          <span className="text-[11px] text-[var(--i-text-faint)]">−</span>
          <input
            type="range" min={0} max={100} step={1} value={zoomPct}
            onChange={(e) => onZoom(Number(e.target.value))}
            data-shoot="zoom"
            aria-label="Zoom the time axis"
            className="timeline-zoom flex-1"
          />
          <span className="text-[11px] text-[var(--i-text-faint)]">+</span>
        </div>
      </Bay>
    </div>
  );
}
