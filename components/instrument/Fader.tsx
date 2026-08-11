"use client";

// A real channel fader. The Instrument's one grabbable primitive -- every
// instance of it is wired to a variable the simulation actually reads, and
// nothing that is merely computed is ever rendered with it (computed values
// get <Meter>, which is visibly recessed and has no cap; see Meter.tsx).
//
// Interaction contract, in the spirit of a professional plug-in:
//   - press anywhere on the slot to jump there, then keep dragging
//   - Shift while dragging = fine (quarter-rate) adjustment
//   - Up/Down/Left/Right = one step, PageUp/PageDown = five, Home/End = ends
//   - Shift + arrow = fine step
//   - double-click = back to the reference value (usually Reality's)
//   - the exact numeric value is always on screen, never only on the cap
// It is a real ARIA slider, so it is operable and announced without a
// pointer; the visual cap is decoration over genuine semantics, not a
// substitute for them.

import { useCallback, useEffect, useRef, useState } from "react";

interface FaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fineStep?: number;
  /** Double-click target; also drawn as a notch on the slot. */
  resetValue?: number;
  onChange: (value: number) => void;
  /** Rendered numeric value, e.g. (v) => `${v.toFixed(1)} FTE`. */
  format: (value: number) => string;
  /** Screen-reader phrasing; falls back to format(). */
  formatAria?: (value: number) => string;
  accent?: string;
  disabled?: boolean;
  /** Caption under the value, e.g. "Reality 2.6". */
  sub?: string;
  /** Colour for `sub`; defaults to the faint text tone. */
  subTone?: string;
  height?: number;
  dataShoot?: string;
}

// Snaps to multiples of `step` anchored at ZERO, not at `min`. Anchoring at
// min made the reachable grid depend on the floor -- with min 0.1 and step
// 0.5 a capacity fader could only land on 9.6 / 10.1 / 10.6, so "set this
// scope to exactly 7 FTE" was unreachable and every readout looked wrong by
// a decimal. Clamping still respects min/max.
function quantize(v: number, step: number, min: number, max: number): number {
  const snapped = Math.round(v / step) * step;
  return Math.min(max, Math.max(min, parseFloat(snapped.toFixed(6))));
}

export default function Fader({
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
  disabled = false,
  sub,
  subTone,
  height = 82,
  dataShoot,
}: FaderProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Drag origin, so Shift can scale movement rather than teleporting the
  // cap to the cursor -- absolute tracking alone makes fine adjustment
  // impossible on a short throw.
  const origin = useRef<{ y: number; value: number } | null>(null);
  const shiftHeld = useRef(false);

  const range = max - min;
  const pct = range === 0 ? 0 : (value - min) / range;
  const changed = resetValue !== undefined && Math.abs(value - resetValue) > 1e-6;

  const commit = useCallback(
    (next: number, fine: boolean) => {
      onChange(quantize(next, fine ? (fineStep ?? step / 4) : step, min, max));
    },
    [onChange, step, fineStep, min, max]
  );

  const valueFromClientY = useCallback(
    (clientY: number): number => {
      const el = slotRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const t = 1 - (clientY - rect.top) / rect.height; // bottom = min
      return min + t * range;
    },
    [value, min, range]
  );

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    shiftHeld.current = e.shiftKey;
    const jumped = valueFromClientY(e.clientY);
    origin.current = { y: e.clientY, value: jumped };
    commit(jumped, e.shiftKey);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || disabled || !origin.current || !slotRef.current) return;
    const rect = slotRef.current.getBoundingClientRect();
    const fine = e.shiftKey;
    // Re-anchor when the modifier is toggled mid-drag so the cap doesn't
    // leap on the frame Shift goes down or up.
    if (fine !== shiftHeld.current) {
      shiftHeld.current = fine;
      origin.current = { y: e.clientY, value };
    }
    const dy = origin.current.y - e.clientY;
    const scale = fine ? 0.25 : 1;
    commit(origin.current.value + (dy / rect.height) * range * scale, fine);
  }

  function endDrag(e: React.PointerEvent) {
    if (!dragging) return;
    setDragging(false);
    origin.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    const s = e.shiftKey ? (fineStep ?? step / 4) : step;
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

  // A drag that ends outside the window still has to release cleanly.
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

  const TICKS = 9;

  return (
    <div className="flex flex-col items-center select-none" style={{ width: 84 }}>
      <div className="i-label mb-2 text-center leading-tight" style={{ maxWidth: 84 }}>
        {label}
      </div>

      <div
        className="i-fader relative flex justify-center"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={parseFloat(value.toFixed(3))}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={(formatAria ?? format)(value)}
        aria-disabled={disabled || undefined}
        aria-orientation="vertical"
        data-dragging={dragging}
        data-shoot={dataShoot}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => resetValue !== undefined && !disabled && onChange(resetValue)}
        style={{ height, width: 46, opacity: disabled ? 0.35 : 1, cursor: disabled ? "not-allowed" : undefined }}
      >
        {/* Travel ticks -- the throw is readable at a glance, and they mark
            the axis the cap moves along. */}
        <div className="absolute inset-y-0 left-0 w-2 flex flex-col justify-between py-[5px]" aria-hidden>
          {Array.from({ length: TICKS }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 1,
                width: i % 4 === 0 ? 7 : 4,
                background: i % 4 === 0 ? "var(--i-border-strong)" : "var(--i-border)",
              }}
            />
          ))}
        </div>
        <div className="absolute inset-y-0 right-0 w-2 flex flex-col items-end justify-between py-[5px]" aria-hidden>
          {Array.from({ length: TICKS }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 1,
                width: i % 4 === 0 ? 7 : 4,
                background: i % 4 === 0 ? "var(--i-border-strong)" : "var(--i-border)",
              }}
            />
          ))}
        </div>

        {/* The slot the cap is cut into */}
        <div ref={slotRef} className="i-slot relative" style={{ width: 8, height: "100%" }} aria-hidden>
          {/* Travel already used, lit in the accent -- the only lit part of
              a control, so "how far have I pushed this" reads instantly. */}
          <div
            className="absolute left-0 right-0 bottom-0 rounded-full transition-[height] duration-150 ease-out"
            style={{
              height: `${pct * 100}%`,
              background: changed ? accent : "var(--i-reality)",
              opacity: changed ? 0.85 : 0.5,
            }}
          />
          {resetValue !== undefined && (
            <div
              className="absolute -left-1 -right-1"
              style={{
                bottom: `${((resetValue - min) / (range || 1)) * 100}%`,
                height: 1,
                background: "var(--i-text-faint)",
                opacity: 0.9,
              }}
            />
          )}
        </div>

        {/* Cap */}
        <div
          className="i-cap absolute transition-[bottom] duration-150 ease-out"
          style={{ bottom: `calc(${pct * 100}% - 7px)`, width: 30, height: 14 }}
          aria-hidden
        >
          <div className="absolute inset-x-[6px] top-[4px] h-[1px]" style={{ background: "rgba(0,0,0,0.5)" }} />
          <div className="absolute inset-x-[6px] top-[6px] h-[1px]" style={{ background: "rgba(255,255,255,0.13)" }} />
          <div className="absolute inset-x-[6px] top-[8px] h-[1px]" style={{ background: "rgba(0,0,0,0.5)" }} />
        </div>
      </div>

      <div
        className="i-readout mt-2.5 text-[13px] leading-none text-center"
        style={{ color: changed ? accent : "var(--i-text)" }}
      >
        {format(value)}
      </div>
      {sub && (
        <div
          className="mt-1 text-[9.5px] text-center leading-tight"
          style={{ color: subTone ?? "var(--i-text-faint)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
