"use client";

// THE CHANNEL FADER — a direct-manipulation control.
//
// It replaces a rotated `<input type="range">`. That input was styled
// `width: 100%` inside a 30px-wide box and then rotated -90deg, so the
// 30px WIDTH became the vertical travel: seventeen usable pixels for a
// 0–6 FTE range, 2.8px per person, centred as a 30px band inside a 187px
// slot the eye reads as the whole control. At either end of the throw the
// lit cap sat ~78px outside the live element, so grabbing the fader you
// can see missed the fader that exists. That is why it "could not be
// lowered" and why it felt stuck: most of the gesture landed on the
// channel behind it.
//
// The law this control obeys:
//
//   THE CONTROL OBEYS FIRST.
//   THE MODEL EXPLAINS THE CONSEQUENCE SECOND.
//   REALITY COMMIT ENFORCES CONSERVATION THIRD.
//
// So the value the hand asks for is the value the fader holds, whether or
// not the portfolio contains the people to satisfy it. A request beyond
// the pool is a Scenario worth seeing, not an input to be rejected — the
// tension rail reports the shortfall, and Reality commit is what refuses.
//
// Geometry rules, learned from the failure above:
//   - the hit area IS the drawn slot, one element, no rotation
//   - the track rect is measured ONCE per drag and cached, so a rail
//     appearing elsewhere can never move the coordinate system under the
//     pointer mid-gesture
//   - pointer capture on pointerdown, so the drag survives leaving the strip
//
// Detents are whole people, because that is the unit the plan is written
// in. Alt/Option drops to halves for the real 0.5 allocations. Nothing
// lands on 3.2 by accident.

import { useCallback, useEffect, useRef, useState } from "react";

/** Whole people normally; halves when the precision modifier is held. */
export const DETENT = 1;
export const FINE_DETENT = 0.5;

interface Props {
  scopeId: string;
  label: string;
  /** The REQUESTED allocation — what the hand asked for, not what the pool could give. */
  value: number;
  max: number;
  accent: string;
  changed: boolean;
  /** Portion of `value` the portfolio cannot currently staff. */
  required: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const snap = (v: number, detent: number, max: number) =>
  Math.min(max, Math.max(0, parseFloat((Math.round(v / detent) * detent).toFixed(4))));

export default function ChannelFader({
  scopeId,
  label,
  value,
  max,
  accent,
  changed,
  required,
  onChange,
  disabled = false,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Measured once at pointerdown. Everything during the drag is resolved
  // against this, never against a live getBoundingClientRect() — that is
  // the difference between a stable control and one that slides away when
  // something else on the page changes height.
  const rect = useRef<{ top: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fine, setFine] = useState(false);
  // Pressing the control has to focus it, or the arrow keys would not work
  // after a drag -- but a ring drawn around the whole throw because a mouse
  // touched it is noise. Track where the focus came from and only ring it
  // for the keyboard, which is who the ring is for.
  const [pointerFocus, setPointerFocus] = useState(false);

  const shown = Math.min(value, max);
  const pct = max <= 0 ? 0 : (shown / max) * 100;
  const shortfallPct = max <= 0 ? 0 : (Math.min(required, shown) / max) * 100;

  const valueAt = useCallback(
    (clientY: number, precise: boolean) => {
      const r = rect.current;
      if (!r || r.height <= 0) return value;
      const t = 1 - (clientY - r.top) / r.height; // bottom of the slot = 0
      return snap(t * max, precise ? FINE_DETENT : DETENT, max);
    },
    [value, max]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation(); // pressing the fader is not selecting the channel
    const el = trackRef.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    rect.current = { top: b.top, height: b.height };
    (e.currentTarget as HTMLElement).focus();
    setPointerFocus(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setFine(e.altKey);
    onChange(valueAt(e.clientY, e.altKey));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || disabled || !rect.current) return;
    e.preventDefault();
    if (e.altKey !== fine) setFine(e.altKey);
    const next = valueAt(e.clientY, e.altKey);
    if (Math.abs(next - value) > 1e-9) onChange(next);
  };

  const end = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    rect.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // A drag released outside the window still has to let go.
  useEffect(() => {
    if (!dragging) return;
    const stop = () => {
      setDragging(false);
      rect.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    const d = e.altKey ? FINE_DETENT : DETENT;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = value + d;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = value - d;
        break;
      case "PageUp":
        next = value + d * 5;
        break;
      case "PageDown":
        next = value - d * 5;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = max;
        break;
    }
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(snap(next, d, max));
  }

  // Every whole person is a labelled, reachable position. Past a dozen the
  // labels thin out so the column stays readable, but the detent grid does
  // not change — the scale is a display property, not the model.
  const labelEvery = max > 12 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = max; v >= 0; v -= 1) ticks.push(v);

  return (
    <div className="flex-1 flex items-stretch justify-center gap-1.5 px-2.5 py-2.5">
      {/* THE SCALE — whole people, every one of them */}
      <div className="relative shrink-0" style={{ width: 13 }} aria-hidden>
        {ticks.map((v) => (
          <div
            key={v}
            className="absolute right-0 flex items-center gap-[3px]"
            style={{ bottom: `calc(${(v / max) * 100}% - 4px)` }}
          >
            {v % labelEvery === 0 && (
              <span
                className="text-[7.5px] tabular-nums leading-none"
                style={{
                  color:
                    Math.abs(shown - v) < 1e-6 ? accent : "var(--i-text-faint)",
                }}
              >
                {v}
              </span>
            )}
            <div
              style={{
                width: 3,
                height: 1,
                background:
                  Math.abs(shown - v) < 1e-6 ? accent : "var(--i-border)",
              }}
            />
          </div>
        ))}
      </div>

      {/* THE TRACK — this element is both what you see and what you grab */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label} allocation in FTE`}
        aria-valuenow={parseFloat(value.toFixed(2))}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={`${value.toFixed(1)} FTE`}
        aria-orientation="vertical"
        aria-disabled={disabled || undefined}
        data-shoot={`fader-${scopeId}`}
        data-dragging={dragging || undefined}
        data-fine={dragging && fine ? true : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => {
          setPointerFocus(false); // the keyboard is driving now; show the ring
          onKeyDown(e);
        }}
        onBlur={() => setPointerFocus(false)}
        onClick={(e) => e.stopPropagation()}
        data-pointer-focus={pointerFocus || undefined}
        className="channel-fader relative outline-none"
        style={{
          width: 30,
          cursor: disabled ? "not-allowed" : "ns-resize",
          touchAction: "none",
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {/* slot cut into the chassis */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            width: 6,
            top: 0,
            bottom: 0,
            background: "var(--i-recess)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)",
            border: "1px solid rgba(0,0,0,0.5)",
          }}
          aria-hidden
        />
        {/* detent ticks inside the slot — the stepped feel, made visible */}
        {ticks.map((v) => (
          <div
            key={v}
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
            style={{
              width: 10,
              height: 1,
              bottom: `${(v / max) * 100}%`,
              background: "rgba(243,240,230,0.07)",
            }}
            aria-hidden
          />
        ))}
        {/* travel used */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
          style={{
            width: 6,
            bottom: 0,
            height: `${pct}%`,
            background: changed ? "var(--i-violet)" : accent,
            opacity: changed ? 0.95 : 0.6,
            transition: dragging ? "none" : "height 200ms cubic-bezier(0.22,0.61,0.36,1)",
          }}
          aria-hidden
        />
        {/* the part of the request the portfolio cannot staff */}
        {required > 1e-6 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
            style={{
              width: 6,
              bottom: `${Math.max(0, pct - shortfallPct)}%`,
              height: `${shortfallPct}%`,
              background:
                "repeating-linear-gradient(45deg, var(--i-red) 0 3px, transparent 3px 6px)",
              transition: dragging ? "none" : "all 200ms cubic-bezier(0.22,0.61,0.36,1)",
            }}
            aria-hidden
          />
        )}
        {/* THE CAP — drawn at the value, inside the element that owns the
            pointer, so what you grab is what you see */}
        <div
          className="absolute left-1/2 pointer-events-none rounded-[3px]"
          style={{
            width: 22,
            height: 13,
            bottom: `calc(${pct}% - 6.5px)`,
            transform: "translateX(-50%)",
            background: "linear-gradient(180deg, var(--i-panel-raised) 0%, #12171a 100%)",
            border: `1px solid ${dragging ? "var(--i-violet)" : changed ? accent : "var(--i-border-strong)"}`,
            boxShadow: dragging
              ? "0 0 0 1px var(--i-violet-soft), 0 2px 6px rgba(0,0,0,0.7)"
              : "0 1px 3px rgba(0,0,0,0.6), inset 0 1px 0 rgba(243,240,230,0.09)",
            transition: dragging ? "none" : "bottom 200ms cubic-bezier(0.22,0.61,0.36,1), border-color 140ms ease",
          }}
          aria-hidden
        >
          <div className="absolute inset-x-[5px] top-[6px] h-[1px]" style={{ background: "rgba(0,0,0,0.55)" }} />
        </div>

        {/* LIVE VALUE — pinned beside the cap while the hand is on it, so
            the number never has to be inferred from track position */}
        {dragging && (
          <div
            data-shoot={`fader-live-${scopeId}`}
            className="absolute z-20 whitespace-nowrap rounded px-1.5 py-1 text-center pointer-events-none"
            style={{
              left: 34,
              bottom: `calc(${pct}% - 13px)`,
              background: "var(--i-void)",
              border: "1px solid var(--i-violet)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
            }}
          >
            <div className="text-[7px] uppercase tracking-[0.12em] text-[var(--i-text-faint)] leading-none">
              {label}
            </div>
            <div
              className="i-readout text-[14px] leading-none mt-[3px]"
              style={{ color: "var(--i-violet)" }}
            >
              {value.toFixed(fine ? 1 : 0)}
              <span className="text-[7.5px] ml-[2px] text-[var(--i-text-faint)]">FTE</span>
            </div>
            {fine && (
              <div className="text-[6.5px] uppercase tracking-[0.1em] text-[var(--i-text-faint)] leading-none mt-[3px]">
                ½ steps
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
