"use client";

// ⌘K. Two kinds of thing you might want to reach without moving your hands:
// another section of the app, or another Scope on this field. Deliberately
// small -- it is a jump list, not a scripting console, and it exposes no
// action that isn't already reachable by clicking something.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ALL_DESTINATIONS } from "@/lib/shell/mode";
import { contextualHref } from "@/lib/shell/context";

export interface CommandScope {
  scopeId: string;
  name: string;
}

interface Item {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export default function CommandMenu({
  open,
  onClose,
  scopes,
  onSelectScope,
}: {
  open: boolean;
  onClose: () => void;
  scopes: CommandScope[];
  onSelectScope: (scopeId: string) => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: Item[] = useMemo(() => {
    const list: Item[] = [
      ...scopes.map((s) => ({
        id: `scope:${s.scopeId}`,
        label: s.name,
        hint: "Inspect scope",
        run: () => onSelectScope(s.scopeId),
      })),
      // The hint used to read "Instrument" or "Workbench" — a distinction
      // that meant something while there were two shells and now means
      // nothing. It carries the destination's QUESTION instead, which is
      // also what makes the palette searchable by intent: typing "waiting"
      // finds Dependencies without knowing the word "orbit".
      //
      // Portfolio and Capacity share a href on purpose (see
      // lib/shell/mode.ts) — two names for one room, both worth being able
      // to type — so the id carries the label to stay unique.
      ...ALL_DESTINATIONS.map((d) => ({
        id: `route:${d.href}:${d.label}`,
        label: d.label,
        hint: d.question ?? d.owns ?? "Go to",
        run: () => router.push(contextualHref(d.href, params)),
      })),
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((i) => i.label.toLowerCase().includes(needle) || i.hint.toLowerCase().includes(needle));
  }, [q, scopes, onSelectScope, router, params]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      // Focus after paint so the field is actually mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (!open) return null;

  function choose(item: Item | undefined) {
    if (!item) return;
    item.run();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]"
      style={{ background: "rgba(6,8,10,0.7)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-[92vw] overflow-hidden rounded-lg"
        style={{ background: "var(--i-panel)", border: "1px solid var(--i-border-strong)", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Jump to a scope or section…"
          aria-label="Search scopes and sections"
          className="w-full bg-transparent px-4 py-3 text-[13px] text-[var(--i-text)] outline-none"
          style={{ borderBottom: "1px solid var(--i-border)" }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(items.length - 1, c + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              choose(items[cursor]);
            }
          }}
        />
        <ul className="max-h-[300px] overflow-y-auto py-1">
          {items.length === 0 && <li className="px-4 py-3 text-[12px] text-[var(--i-text-faint)]">Nothing matches.</li>}
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(item)}
                className="w-full flex items-center justify-between px-4 py-2 text-left text-[13px]"
                style={{
                  background: i === cursor ? "var(--i-violet-soft)" : "transparent",
                  color: i === cursor ? "var(--i-text)" : "var(--i-text-soft)",
                }}
              >
                <span>{item.label}</span>
                <span className="i-label">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
