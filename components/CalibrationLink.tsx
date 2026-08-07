"use client";

import { useState } from "react";

export interface CalibrationData {
  available: boolean;
  reportCount: number;
  spanDays: number;
}

// Stub for the eventual "how past forecasts held up" feature (design
// brief #8) -- not worth building the real comparison yet since there
// isn't enough Report history stored for it to say anything meaningful.
// The affordance exists now so the hook is discoverable, but it's
// honest about not being real yet either way: "not enough history" when
// the threshold isn't met, and "not built yet" (not a fabricated
// number) once it is.
export default function CalibrationLink({ calibration }: { calibration: CalibrationData }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:underline"
      >
        See how past forecasts held up
      </button>
      {open && (
        <p className="mt-1.5 text-[11px] text-[var(--color-ink-soft)]">
          {calibration.available
            ? `There's enough history now (${calibration.reportCount} reports over ${calibration.spanDays} days) -- this comparison isn't built yet.`
            : `Not enough history yet: ${calibration.reportCount} of 4 reports needed, ${calibration.spanDays} of 28 days.`}
        </p>
      )}
    </div>
  );
}
