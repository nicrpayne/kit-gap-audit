// THE READING SURFACE, IN SIGNAL'S LANGUAGE.
//
// Not every destination is an instrument. Audit, Reports and Settings are
// things you READ and fill in, not things you play — they have no scenario
// state, no simulation, nothing to scrub. They used to live in a separate
// cream-and-green Workbench shell for exactly that reason, and the cost was
// that Signal felt like two products stitched together: you could tell
// which half of the app you were in by its colour.
//
// So the distinction survives, but as a TREATMENT inside one shell rather
// than as a second shell. Same rail, same identity strip, same dark
// surfaces, same type — and then a centred measure, generous leading, and a
// title that behaves like a title, because reading long text in a
// full-bleed control surface is unpleasant. An instrument owns the whole
// viewport; a reading surface owns a column in the middle of it.
//
// InstrumentShell is a client component and this is not, which is the point:
// a server page can await Prisma, render its own markup, and hand the
// result down as children without becoming a client component itself.

import type { ReactNode } from "react";
import Link from "@/components/instrument/SignalLink";
import InstrumentShell from "@/components/instrument/InstrumentShell";

export default function SignalSurface({
  eyebrow,
  title,
  lede,
  actions,
  back,
  children,
}: {
  /** The structural micro-label above the title. */
  eyebrow: string;
  title: string;
  /** One or two sentences saying what this surface is for. */
  lede?: ReactNode;
  /** Right-aligned primary action, if the surface has one. */
  actions?: ReactNode;
  /** The way back up, for surfaces that are one level down. */
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    // minViewportWidth={0}: a reading surface has nothing to clip. Prose
    // reflows, the forms are ordinary, and Audit/Reports/Settings are
    // exactly what someone on a phone can still usefully do — so they must
    // NOT inherit the instrument width requirement.
    <InstrumentShell minViewportWidth={0}>
      <div className="i-legacy min-w-0 flex-1 overflow-y-auto" style={{ background: "var(--i-bg)" }}>
        <div className="mx-auto w-full max-w-[900px] px-8 pb-16 pt-9">
          {back && (
            <Link
              href={back.href}
              className="mb-5 inline-flex items-center gap-1.5 text-[11px] text-[var(--i-text-faint)] transition-colors hover:text-[var(--i-signal)]"
            >
              <span aria-hidden>←</span> {back.label}
            </Link>
          )}

          <div className="mb-7 flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="i-label mb-2.5" style={{ color: "var(--i-signal)" }}>
                {eyebrow}
              </div>
              <h1 className="font-display text-[30px] leading-[1.15] text-[var(--i-text)]">{title}</h1>
              {lede && (
                <p className="mt-2.5 max-w-[62ch] text-[13px] leading-[1.65] text-[var(--i-text-soft)]">{lede}</p>
              )}
            </div>
            {actions && <div className="shrink-0 pt-1">{actions}</div>}
          </div>

          {children}
        </div>
      </div>
    </InstrumentShell>
  );
}

/** The one button treatment these surfaces use for their primary action.
    Exported so the pages don't each invent their own. */
export function SurfaceAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="i-control inline-flex items-center px-3.5 py-2 text-[12px] font-medium text-[var(--i-text)] transition-colors hover:text-[var(--i-signal)]"
    >
      {children}
    </Link>
  );
}

/** A bordered list/panel — the reading surface's equivalent of a bay. */
export function SurfacePanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-[10px] ${className}`}
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
    >
      {children}
    </div>
  );
}

/** Nothing here yet, said without pretending it is a problem. */
export function SurfaceEmpty({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-[10px] px-6 py-12 text-center text-[13px] text-[var(--i-text-soft)]"
      style={{ border: "1px dashed var(--i-border-strong)", background: "var(--i-panel)" }}
    >
      {children}
    </div>
  );
}
