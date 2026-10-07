"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/lib/instrument/useModalFocus";

/** The options belong to the dropped object, not to the edge of the app.
 * Re-measure on scroll/resize; on narrow screens bloom below the card. */
export default function DecisionBloom({ open, anchorId, title, onClose, children, footer }: {
  open: boolean; anchorId: string; title: string; onClose: () => void; children: ReactNode; footer: ReactNode;
}) {
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number; path: string; side: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!open) { setRevealed(false); return; }
    const timer = setTimeout(() => setRevealed(true), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
    return () => clearTimeout(timer);
  }, [open, anchorId]);
  // A hidden, not-yet-positioned panel cannot receive focus. Activate the
  // trap only after measurement makes it visible.
  const ref = useModalFocus(open && position !== null && revealed, onClose);
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const anchor = document.getElementById(anchorId), panel = ref.current;
    if (!anchor || !panel) return;
    const update = () => {
      const a = anchor.getBoundingClientRect();
      const vw = window.visualViewport?.width ?? innerWidth, vh = window.visualViewport?.height ?? innerHeight;
      const margin = 16, gap = 22, width = Math.min(390, vw - margin * 2);
      const side = a.right + gap + width <= vw - margin ? "right" : a.left - gap - width >= margin ? "left" : "below";
      const left = side === "right" ? a.right + gap : side === "left" ? a.left - gap - width : Math.max(margin, Math.min(a.left, vw - width - margin));
      const maxHeight = side === "below" ? Math.max(160, vh - Math.max(margin, a.bottom + gap) - margin) : Math.min(650, vh - margin * 2);
      const height = Math.min(panel.scrollHeight, maxHeight);
      const top = side === "below" ? Math.max(margin, Math.min(a.bottom + gap, vh - maxHeight - margin)) : Math.max(margin, Math.min(a.top - 12, vh - height - margin));
      const ay = a.top + Math.min(48, a.height / 2), py = Math.max(top + 22, Math.min(ay, top + height - 22));
      const path = side === "below" ? `M ${a.left + a.width / 2} ${a.bottom} V ${top}`
        : `M ${side === "right" ? a.right : a.left} ${ay} L ${side === "right" ? left : left + width} ${py}`;
      setPosition(previous => {
        const next = { left, top, width, maxHeight, path, side };
        return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
      });
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(anchor); observer.observe(panel);
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    const frame = requestAnimationFrame(update);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); window.visualViewport?.removeEventListener("resize", update); };
  }, [open, anchorId, ref]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(<>
    <div className="fixed inset-0 z-50" style={{ background: "rgba(6,8,10,.18)" }} onClick={onClose} data-testid="decision-bloom-backdrop" aria-hidden="true" />
    {position && <svg className="pointer-events-none fixed inset-0 z-50 h-full w-full" aria-hidden="true" data-testid="decision-bloom-connector">
      <path d={position.path} fill="none" stroke="var(--i-violet)" strokeWidth="2" style={{ filter: "drop-shadow(0 0 5px var(--i-violet))" }} />
    </svg>}
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-shoot="connect-tool"
      data-testid="decision-bloom" data-anchor={anchorId} data-side={position?.side} data-attention="decision"
      className="instrument fixed z-50 flex flex-col overflow-hidden rounded-xl"
      style={{ left: position?.left ?? 16, top: position?.top ?? 16, width: position?.width ?? 390,
        maxWidth: "calc(100vw - 32px)", maxHeight: position?.maxHeight ?? "calc(100dvh - 32px)", visibility: position && revealed ? "visible" : "hidden",
        background: "var(--i-panel)", border: "1px solid var(--i-violet)" }}>
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--i-border)", background: "var(--i-violet-soft)" }}>
        <div><div className="i-label text-[var(--i-violet)]">Dropped here · not applied yet</div><h2 className="mt-1 text-[15px] font-semibold text-[var(--i-text)]">{title}</h2></div>
        <button type="button" aria-label="Cancel delay setup" data-shoot="tool-close" onClick={onClose} className="i-control h-8 w-8 shrink-0">✕</button>
      </header>
      <div className="min-h-0 overflow-y-auto">{children}</div>
      <div className="shrink-0">{footer}</div>
    </div>
  </>, document.body);
}
