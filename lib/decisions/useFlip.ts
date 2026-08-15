"use client";

// OBJECT CONTINUITY.
//
// A decision is one physical object that changes SEATING: unseated in the
// candidate bay, seated in the open bank, inserted into a socket in the
// delivery circuit, latched into memory. Rendering that as one card
// disappearing and a different card appearing elsewhere throws the whole
// metaphor away -- the eye has no reason to believe it is the same thing.
//
// So this is a FLIP: before the browser paints, compare each registered
// element's new box against the box it had last time. If it moved, put it
// back with a transform, then release the transform on the next frame and
// let CSS carry it to its new home.
//
// Deliberately generic and id-keyed rather than tied to Decision at all.
// It knows nothing about gates, banks or scenarios; it only knows that an
// element with a stable identity used to be somewhere else.

import { useLayoutEffect, useRef } from "react";

const MOVED_ENOUGH = 4; // px — ignore sub-pixel reflow noise

export function useFlip(deps: unknown[]) {
  const boxes = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const reduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-flip-id]"));
    const next = new Map<string, DOMRect>();

    for (const el of els) {
      const id = el.dataset.flipId!;
      const now = el.getBoundingClientRect();
      next.set(id, now);
      if (reduced) continue;

      const before = boxes.current.get(id);
      if (!before) continue; // first sighting: it did not travel, it arrived
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (Math.abs(dx) < MOVED_ENOUGH && Math.abs(dy) < MOVED_ENOUGH) continue;

      // Put it back where it was, with no transition, then let it go.
      el.classList.remove("dc-flip");
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // Force a style flush so the browser does not coalesce the two
      // writes into a single no-op frame.
      void el.offsetWidth;
      el.classList.add("dc-flip");
      el.style.transform = "";
    }

    boxes.current = next;
    // deps are the data generations that can move a module between bays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
