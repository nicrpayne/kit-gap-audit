"use client";

import { useEffect, useState } from "react";
import Link from "@/components/instrument/SignalLink";

export interface NextAction {
  title: string;
  detail: string;
  label: string;
  href: string;
}

/** Guidance only: opening a review must never accept, dismiss or commit data. */
export function AttentionCallout({ title, detail, label, href, onAction, disabled = false, tone = "required", className = "" }: {
  title: string; detail: string; label: string; href?: string; onAction?: () => void;
  disabled?: boolean; tone?: "required" | "review" | "error"; className?: string;
}) {
  return <section className={`signal-next-step ${className}`} data-attention={disabled ? undefined : tone} data-shoot="next-step" aria-label={`Next step: ${title}`}>
    <div className="min-w-0 flex-1">
      <div className="signal-next-step__eyebrow"><span aria-hidden="true">◆</span> {tone === "review" ? "REVIEW NEXT" : tone === "error" ? "NEEDS YOUR ATTENTION" : "NEXT STEP"}</div>
      <h2 className="text-[13px] font-semibold leading-snug text-[var(--i-text)]">{title}</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--i-text-soft)]">{detail}</p>
    </div>
    {href && !disabled ? <Link href={href} className="signal-next-step__action">{label} <span aria-hidden="true">→</span></Link>
      : <button type="button" disabled={disabled} onClick={onAction} className="signal-next-step__action">{label} <span aria-hidden="true">→</span></button>}
  </section>;
}

export function AttentionMotionControl() {
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => { setReduced(media.matches); try { setPaused(localStorage.getItem("signal.attention-motion.v1") === "paused"); } catch { /* Storage can be unavailable in private browsing. */ } };
    read(); media.addEventListener("change", read); window.addEventListener("storage", read);
    return () => { media.removeEventListener("change", read); window.removeEventListener("storage", read); };
  }, []);
  useEffect(() => { document.documentElement.dataset.attentionMotion = paused || reduced ? "paused" : "on"; }, [paused, reduced]);
  return <button type="button" data-shoot="attention-motion" disabled={reduced} aria-pressed={paused || reduced}
    aria-label={reduced ? "Action glow is static because reduced motion is enabled" : paused ? "Resume action glow" : "Pause action glow"}
    title={reduced ? "Reduced motion: action outlines stay visible without pulsing" : "Pause or resume action glows; next-step guidance stays visible"}
    className="signal-shell__nav-item my-1 flex w-[76px] shrink-0 flex-col items-center gap-1 rounded-lg py-2 text-[9px] disabled:opacity-70"
    onClick={() => { const next = !paused; setPaused(next); try { localStorage.setItem("signal.attention-motion.v1", next ? "paused" : "on"); } catch { /* Session state still works. */ } }}>
    <span aria-hidden="true" className="text-[13px]">{paused || reduced ? "◇" : "◉"}</span>
    {reduced ? "Static cues" : paused ? "Resume glow" : "Pause glow"}
  </button>;
}

export function AttentionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="m-4 max-w-2xl" role="alert"><AttentionCallout title="This view needs another try" detail={message} label="Retry loading" tone="error" onAction={onRetry ?? (() => window.location.reload())} /></div>;
}
