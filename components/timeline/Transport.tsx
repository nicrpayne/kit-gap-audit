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
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToBeginning: () => void;
  onToNow: () => void;
  onSpeed: (s: Speed) => void;
  onZoom: (pct: number) => void;
  onScale: (s: "week" | "month" | "quarter") => void;
}

const Btn = ({
  onClick, title, shoot, children, primary = false, disabled = false,
}: {
  onClick: () => void; title: string; shoot: string; children: React.ReactNode; primary?: boolean; disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    data-shoot={shoot}
    disabled={disabled}
    className="flex items-center justify-center rounded-md transition-[filter,border-color] hover:brightness-125 disabled:opacity-30 disabled:cursor-default"
    style={{
      width: primary ? 46 : 34,
      height: primary ? 46 : 34,
      background: primary
        ? "linear-gradient(180deg, var(--i-violet) 0%, #7c6ce0 100%)"
        : "linear-gradient(180deg, var(--i-panel-raised) 0%, #12171a 100%)",
      border: `1px solid ${primary ? "var(--i-violet)" : "var(--i-border-strong)"}`,
      color: primary ? "var(--i-void)" : "var(--i-text)",
      boxShadow: primary
        ? "0 0 0 1px var(--i-violet-soft), 0 3px 10px rgba(0,0,0,0.6)"
        : "0 1px 3px rgba(0,0,0,0.6), inset 0 1px 0 rgba(243,240,230,0.07)",
    }}
  >
    {children}
  </button>
);

export default function Transport({
  playing, playheadT, nowT, atNow, speed, scaleLabel, zoomPct, crossedCount, totalPast,
  onPlayPause, onPrev, onNext, onToBeginning, onToNow, onSpeed, onZoom, onScale,
}: Props) {
  return (
    <div
      className="shrink-0 flex items-center gap-4 px-4"
      style={{
        height: 74,
        borderTop: "1px solid var(--i-border)",
        background: "linear-gradient(180deg, #12171a 0%, var(--i-void) 100%)",
      }}
      data-shoot="transport"
    >
      {/* PLAY — the signature control */}
      <Btn onClick={onPlayPause} title={playing ? "Pause" : "Play the project"} shoot="play" primary>
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.6" height="12" rx="1" /><rect x="8.4" y="1" width="3.6" height="12" rx="1" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5 L12.5 7 L3 12.5 Z" /></svg>
        )}
      </Btn>

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
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="6" r="4.4" /><path d="M6 3.4 V6 L7.8 7.2" /></svg>
        </Btn>
      </div>

      {/* PLAYHEAD DATE — the readout that matters most */}
      <div className="pl-3" style={{ borderLeft: "1px solid var(--i-border)" }}>
        <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--i-text-faint)]">Playhead</div>
        <div className="i-readout text-[18px] leading-none mt-1" data-shoot="playhead-date" style={{ color: atNow ? "var(--i-mint)" : "var(--i-violet)" }}>
          {fmtFull(playheadT)}
        </div>
      </div>

      {/* how much of the story has unfolded */}
      <div className="pl-3" style={{ borderLeft: "1px solid var(--i-border)" }}>
        <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--i-text-faint)]">Crossed</div>
        <div className="i-readout text-[13px] leading-none mt-1.5 text-[var(--i-text)]" data-shoot="crossed-count">
          {crossedCount}<span className="text-[9px] text-[var(--i-text-faint)]"> / {totalPast}</span>
        </div>
      </div>

      <div className="flex-1" />

      {/* SPEED — scales the choreography, not the axis */}
      <div className="flex flex-col items-start">
        <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--i-text-faint)] mb-1">Playback</div>
        <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--i-border-strong)" }}>
          {([0.5, 1, 2] as Speed[]).map((s) => (
            <button
              key={s}
              onClick={() => onSpeed(s)}
              data-shoot={`speed-${s}`}
              className="px-2.5 py-1 text-[10px] tabular-nums transition-colors"
              style={{
                background: speed === s ? "var(--i-violet)" : "var(--i-panel-raised)",
                color: speed === s ? "var(--i-void)" : "var(--i-text-soft)",
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* SNAP — the grid the axis is read against */}
      <div className="flex flex-col items-start">
        <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--i-text-faint)] mb-1">Snap</div>
        <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--i-border-strong)" }}>
          {(["week", "month", "quarter"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onScale(s)}
              data-shoot={`scale-${s}`}
              className="px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] transition-colors"
              style={{
                background: scaleLabel === s ? "var(--i-violet)" : "var(--i-panel-raised)",
                color: scaleLabel === s ? "var(--i-void)" : "var(--i-text-soft)",
              }}
            >
              {s.slice(0, 1)}
            </button>
          ))}
        </div>
      </div>

      {/* ZOOM */}
      <div className="flex flex-col items-start" style={{ width: 172 }}>
        <div className="text-[8px] uppercase tracking-[0.16em] text-[var(--i-text-faint)] mb-1">Zoom</div>
        <div className="flex items-center gap-2 w-full">
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
      </div>
    </div>
  );
}
