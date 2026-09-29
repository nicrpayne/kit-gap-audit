"use client";

import { useLayoutEffect, useRef } from "react";

const stack: HTMLElement[] = [];
const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Contain the top modal and restore its opener. Callback changes must not
 * restart focus or overwrite the opener while a draft is being edited. */
export function useModalFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const wasOpen = useRef(false);
  const opener = useRef<Element | null>(null);
  if (open && !wasOpen.current && typeof document !== "undefined") opener.current = document.activeElement;
  wasOpen.current = open;
  useLayoutEffect(() => {
    const root = ref.current;
    if (!open || !root) return;
    const previous = opener.current;
    stack.push(root);
    const controls = () => [...root.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'));
    const focusFirst = () => (controls()[0] ?? root).focus();
    if (!root.contains(document.activeElement)) focusFirst();
    function key(event: KeyboardEvent) {
      if (stack.at(-1) !== root) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const list = controls();
      const index = list.indexOf(document.activeElement as HTMLElement);
      if (!list.length || index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === list.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? list.at(-1) ?? root : list[0] ?? root)!.focus();
      }
    }
    function focus(event: FocusEvent) {
      if (stack.at(-1) === root && !root!.contains(event.target as Node)) focusFirst();
    }
    document.addEventListener("keydown", key, true);
    document.addEventListener("focusin", focus);
    return () => {
      stack.splice(stack.lastIndexOf(root), 1);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("focusin", focus);
      if (previous?.isConnected && "focus" in previous) (previous as HTMLElement).focus();
    };
  }, [open]);
  return ref;
}
