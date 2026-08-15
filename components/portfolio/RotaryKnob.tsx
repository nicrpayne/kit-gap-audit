"use client";

// A ROTARY KNOB, the way hardware does it.
//
// Real knobs are not traced in a circle -- you grab one and move your hand,
// and the knob turns. So this drags VERTICALLY (up increases), which is how
// every plugin and every physical desk with a mouse in front of it works,
// and how a hand already expects to hold it. Circular tracing is a thing
// software invented and nobody enjoys.
//
// Underneath it is a real range input: keyboard, screen readers and
// focus-visible all behave, because a div with pointer listeners would have
// thrown all of that away for the sake of a picture. The input is
// transparent and covers the cap; the drawing is what you see.

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  /** Rendered under the cap. The knob shows a value, never a bare angle. */
  display: string;
  size?: number;
  accent?: string;
  shoot?: string;
  onChange: (value: number) => void;
}

// Hardware knobs have a dead zone at the bottom rather than a full circle,
// so the pointer's extremes are unambiguous: 7 o'clock is min, 5 o'clock is
// max, and there is no position that could be either.
const SWEEP = 280;
const START = -140;

export default function RotaryKnob({
  value,
  min,
  max,
  step = 1,
  label,
  display,
  size = 54,
  accent = "var(--i-violet)",
  shoot,
  onChange,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ y: number; value: number } | null>(null);

  const t = (value - min) / (max - min || 1);
  const angle = START + t * SWEEP;

  // 140px of travel covers the whole range -- close enough to a real cap's
  // throw that it feels calibrated, far enough that fine values are
  // reachable without a modifier.
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = { y: e.clientY, value };
      setDragging(true);
    },
    [value]
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const from = dragRef.current;
      if (!from) return;
      const delta = ((from.y - e.clientY) / 140) * (max - min);
      const next = Math.min(max, Math.max(min, from.value + delta));
      onChange(Math.round(next / step) * step);
    };
    const up = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, min, max, step, onChange]);

  const r = size / 2;
  const trackR = r - 3;
  const arc = (from: number, to: number) => {
    const pt = (deg: number) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return [r + trackR * Math.cos(rad), r + trackR * Math.sin(rad)];
    };
    const [x1, y1] = pt(from);
    const [x2, y2] = pt(to);
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${trackR},${trackR} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };

  return (
    <div className="flex flex-col items-center select-none">
      <div className="relative" style={{ width: size, height: size }} data-shoot={shoot}>
        <svg width={size} height={size} className="absolute inset-0" aria-hidden>
          {/* the machined ring the cap sits in */}
          <path d={arc(START, START + SWEEP)} fill="none" stroke="var(--i-recess)" strokeWidth="3" strokeLinecap="round" />
          <path
            d={arc(START, angle)}
            fill="none"
            stroke={accent}
            strokeWidth="3"
            strokeLinecap="round"
            style={{ transition: dragging ? "none" : "d 160ms linear" }}
          />
          {/* the cap: brushed metal catching light from above */}
          <circle
            cx={r}
            cy={r}
            r={trackR - 5}
            fill="url(#knobcap)"
            stroke="var(--i-border-strong)"
            strokeWidth="1"
          />
          <defs>
            <linearGradient id="knobcap" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#232a30" />
              <stop offset="100%" stopColor="#12171a" />
            </linearGradient>
          </defs>
          {/* the pointer line -- the only thing that moves */}
          <line
            x1={r}
            y1={r}
            x2={r + (trackR - 8) * Math.cos(((angle - 90) * Math.PI) / 180)}
            y2={r + (trackR - 8) * Math.sin(((angle - 90) * Math.PI) / 180)}
            stroke={dragging ? accent : "var(--i-text-soft)"}
            strokeWidth="1.8"
            strokeLinecap="round"
            style={{ transition: dragging ? "none" : "all 160ms cubic-bezier(0.22,0.61,0.36,1)" }}
          />
        </svg>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          data-shoot={shoot ? `${shoot}-input` : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={onPointerDown}
          className="rotary-input"
          style={{ cursor: dragging ? "ns-resize" : "grab" }}
        />
      </div>
      <div className="mt-1 i-readout text-[14px] leading-none" style={{ color: dragging ? accent : "var(--i-text)" }}>
        {display}
      </div>
      <div className="mt-1 flex w-full justify-between text-[8px] tabular-nums text-[var(--i-text-faint)]" style={{ maxWidth: size + 8 }}>
        <span>{min}%</span>
        <span>{max}%</span>
      </div>
    </div>
  );
}
