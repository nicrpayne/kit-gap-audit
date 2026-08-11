"use client";

// A real rotary control. Same contract as <Fader> -- it is raised, it is
// grabbable, and it writes a variable the simulation reads -- but the form
// suits a different kind of parameter: a bounded scalar with no natural
// "position along a timeline" meaning, where a fader's linear travel
// implies an ordering the value doesn't really have.
//
// Interaction is vertical-drag (the professional-plugin convention: drag up
// to increase, which stays usable no matter where on the knob you grabbed,
// unlike true radial tracking which jumps if you press near the centre):
//   - drag up/down to change
//   - Shift while dragging = fine
//   - Up/Right / Down/Left = one step, Shift = fine step
//   - PageUp/PageDown = five steps, Home/End = ends
//   - double-click = back to the reference value
// Real ARIA slider semantics; the drawn dial is decoration over genuine
// keyboard-operable state, never a substitute for it.

import { useCallback, useEffect, useRef, useState } from "react";

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fineStep?: number;
  resetValue?: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  formatAria?: (value: number) => string;
  accent?: string;
  size?: number;
  /** Pixels of vertical drag to travel the full range. */
  throwPx?: number;
  dataShoot?: string;
}

const START_DEG = 150;
const SWEEP_DEG = 240;

// Multiples of `step` anchored at zero -- see the same note in Fader.tsx.
function quantize(v: number, step: number, min: number, max: number): number {
  const snapped = Math.round(v / step) * step;
  return Math.min(max, Math.max(min, parseFloat(snapped.toFixed(6))));
}

export default function Knob({
  label,
  value,
  min,
  max,
  step,
  fineStep,
  resetValue,
  onChange,
  format,
  formatAria,
  accent = "var(--i-violet)",
  size = 62,
  throwPx = 170,
  dataShoot,
}: KnobProps) {
  const [dragging, setDragging] = useState(false);
  const origin = useRef<{ y: number; value: number } | null>(null);
  const shiftHeld = useRef(false);

  const range = max - min;
  const t = range === 0 ? 0 : (value - min) / range;
  const changed = resetValue !== undefined && Math.abs(value - resetValue) > 1e-6;

  const commit = useCallback(
    (next: number, fine: boolean) => onChange(quantize(next, fine ? (fineStep ?? step / 5) : step, min, max)),
    [onChange, step, fineStep, min, max]
  );

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    shiftHeld.current = e.shiftKey;
    origin.current = { y: e.clientY, value };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !origin.current) return;
    const fine = e.shiftKey;
    // Re-anchor when the modifier toggles mid-drag so the dial doesn't leap
    // on the frame Shift goes down or up.
    if (fine !== shiftHeld.current) {
      shiftHeld.current = fine;
      origin.current = { y: e.clientY, value };
    }
    const dy = origin.current.y - e.clientY;
    commit(origin.current.value + (dy / throwPx) * range * (fine ? 0.25 : 1), fine);
  }

  function endDrag(e: React.PointerEvent) {
    if (!dragging) return;
    setDragging(false);
    origin.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const s = e.shiftKey ? (fineStep ?? step / 5) : step;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = value + s;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = value - s;
        break;
      case "PageUp":
        next = value + s * 5;
        break;
      case "PageDown":
        next = value - s * 5;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      case "Escape":
        if (resetValue !== undefined) next = resetValue;
        break;
    }
    if (next === null) return;
    e.preventDefault();
    onChange(quantize(next, s, min, max));
  }

  useEffect(() => {
    if (!dragging) return;
    const stop = () => {
      setDragging(false);
      origin.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging]);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 7;
  const toXY = (deg: number, radius: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)] as const;
  };
  const arc = (fromDeg: number, toDeg: number, radius: number) => {
    const [x1, y1] = toXY(fromDeg, radius);
    const [x2, y2] = toXY(toDeg, radius);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${Math.abs(toDeg - fromDeg) > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const valueDeg = START_DEG + SWEEP_DEG * t;
  const [px, py] = toXY(valueDeg, r - 9);
  const [pxi, pyi] = toXY(valueDeg, r - 19);

  return (
    <div className="flex flex-col items-center select-none" style={{ width: 92 }}>
      <div className="i-label mb-1.5 text-center leading-tight">{label}</div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={parseFloat(value.toFixed(3))}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={(formatAria ?? format)(value)}
        aria-orientation="vertical"
        data-dragging={dragging}
        data-shoot={dataShoot}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => resetValue !== undefined && onChange(resetValue)}
        className="i-knob relative rounded-full"
        style={{ width: size, height: size, cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
      >
        <svg width={size} height={size} aria-hidden className="block">
          {/* Travel ticks around the dial -- the range is readable at rest */}
          {Array.from({ length: 11 }).map((_, i) => {
            const deg = START_DEG + (SWEEP_DEG * i) / 10;
            const major = i % 5 === 0;
            const [x1, y1] = toXY(deg, r + 1);
            const [x2, y2] = toXY(deg, r + (major ? 5 : 3.5));
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={major ? "var(--i-border-strong)" : "var(--i-border)"}
                strokeWidth={1}
              />
            );
          })}
          <path d={arc(START_DEG, START_DEG + SWEEP_DEG, r)} fill="none" stroke="#171d22" strokeWidth={3.5} strokeLinecap="round" />
          {t > 0.001 && (
            <path
              d={arc(START_DEG, valueDeg, r)}
              fill="none"
              stroke={changed ? accent : "var(--i-reality)"}
              strokeWidth={3.5}
              strokeLinecap="round"
            />
          )}
          {resetValue !== undefined && (() => {
            const deg = START_DEG + SWEEP_DEG * ((resetValue - min) / (range || 1));
            const [x1, y1] = toXY(deg, r + 1);
            const [x2, y2] = toXY(deg, r + 6);
            return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--i-text-faint)" strokeWidth={1.5} />;
          })()}
          {/* Dial body */}
          <circle cx={cx} cy={cy} r={r - 6} fill="url(#knobBody)" stroke="#4a545c" strokeWidth={1} />
          <defs>
            <linearGradient id="knobBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#454f57" />
              <stop offset="55%" stopColor="#2b3339" />
              <stop offset="100%" stopColor="#222a2f" />
            </linearGradient>
          </defs>
          {/* Pointer line -- the one part that moves */}
          <line
            x1={pxi}
            y1={pyi}
            x2={px}
            y2={py}
            stroke={changed ? accent : "var(--i-text)"}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div
        className="i-readout mt-2 text-[14px] leading-none"
        style={{ color: changed ? accent : "var(--i-text)" }}
      >
        {format(value)}
      </div>
    </div>
  );
}
