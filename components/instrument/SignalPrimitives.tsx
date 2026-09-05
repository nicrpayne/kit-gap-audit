import Link from "@/components/instrument/SignalLink";
import React from "react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

export type SignalStatus =
  | "reality"
  | "scenario"
  | "attention"
  | "risk"
  | "positive"
  | "source"
  | "evidence"
  | "neutral";

export type SignalTime = "current" | "stale" | "superseded";
export type SignalBasis = "attested" | "inferred" | "external";

const STATUS_ICON: Record<SignalStatus, string> = {
  reality: "●",
  scenario: "◇",
  attention: "◆",
  risk: "▲",
  positive: "✓",
  source: "○",
  evidence: "◫",
  neutral: "—",
};

const TIME_ICON: Record<SignalTime, string> = {
  current: "●",
  stale: "◷",
  superseded: "⊘",
};

export function SignalWidget({
  title,
  label,
  count,
  status = "neutral",
  dock = "float",
  actions,
  footer,
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  label?: ReactNode;
  count?: ReactNode;
  status?: SignalStatus;
  dock?: "float" | "left" | "right" | "flush";
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside
      {...props}
      className={`signal-widget ${className}`}
      data-signal-status={status}
      data-signal-dock={dock}
    >
      {status !== "neutral" && <span className="signal-widget__rail" aria-hidden="true" />}
      <header className="signal-widget__header">
        <span className="min-w-0">
          {label && <span className="signal-widget__label">{label}</span>}
          <span className="signal-widget__title">{title}</span>
        </span>
        {count != null && <span className="signal-widget__count">{count}</span>}
        {actions}
      </header>
      <div className="signal-widget__body">{children}</div>
      {footer && <footer className="signal-widget__footer">{footer}</footer>}
    </aside>
  );
}

export function SignalPanel({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section {...props} className={`signal-panel ${className}`}>
      {children}
    </section>
  );
}

export function SignalStateMark({
  status,
  label,
  time = "current",
  timeLabel,
  className = "",
  ...props
}: {
  status: SignalStatus;
  label: string;
  time?: SignalTime;
  timeLabel?: string;
  className?: string;
} & Omit<HTMLAttributes<HTMLSpanElement>, "children">) {
  return (
    <span
      {...props}
      className={`signal-state-mark ${className}`}
      data-signal-status={status}
      data-signal-time={time}
    >
      <span className="signal-state-mark__status" aria-hidden="true">{STATUS_ICON[status]}</span>
      <span>{label}</span>
      {timeLabel && (
        <span className="signal-state-mark__time">
          <span aria-hidden="true">{TIME_ICON[time]}</span> {timeLabel}
        </span>
      )}
    </span>
  );
}

export function SignalBasisMark({
  basis,
  label,
  className = "",
}: {
  basis: SignalBasis;
  label?: string;
  className?: string;
}) {
  const basisLabel = label ?? `${basis[0].toUpperCase()}${basis.slice(1)}`;
  return (
    <span className={`signal-basis-mark ${className}`} data-signal-basis={basis}>
      <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true">
        <line
          x1="1"
          x2="23"
          y1="4"
          y2="4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray={basis === "inferred" ? "6 4" : basis === "external" ? "2 3" : undefined}
        />
        {basis === "attested" && <circle cx="4" cy="4" r="2" fill="currentColor" />}
        {basis === "inferred" && <path d="M4 1l3 3-3 3-3-3z" fill="currentColor" />}
        {basis === "external" && <path d="M2 6V2h4" fill="none" stroke="currentColor" />}
      </svg>
      <span>{basisLabel}</span>
    </span>
  );
}

export function SignalHandoff({
  href,
  owner,
  prefix = "Open in",
  className = "",
  ...props
}: {
  href: string;
  owner: string;
  prefix?: string;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children">) {
  return (
    <Link {...props} href={href} className={`signal-handoff ${className}`}>
      <span>{prefix} {owner}</span>
      <span className="signal-handoff__arrow" aria-hidden="true">→</span>
    </Link>
  );
}

export function SignalControl({
  children,
  className = "",
  status,
  selected,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  status?: SignalStatus;
  selected?: boolean;
}) {
  return (
    <button
      {...props}
      className={`signal-control ${className}`}
      data-signal-status={status}
      data-signal-interaction={selected ? "selected" : undefined}
      aria-pressed={props["aria-pressed"] ?? (selected || undefined)}
    >
      {children}
    </button>
  );
}

export function SignalMeter({
  children,
  className = "",
  status,
  ...props
}: HTMLAttributes<HTMLDivElement> & { status?: SignalStatus }) {
  return (
    <div {...props} className={`signal-meter ${className}`} data-signal-status={status}>
      {children}
    </div>
  );
}
