"use client";

import React, { useState } from "react";
import { presentLegacyReport } from "@/lib/reports/legacySanitization";

// Renders exactly the shape lib/reports/render.ts produces -- not a
// general markdown renderer. Kept dependency-free since the format is
// small and fully controlled by this app.
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function ReportView({ markdown }: { markdown: string }) {
  const presentation = presentLegacyReport(markdown);
  if (presentation.kind === "html_error") {
    return <LegacySourceFailure raw={markdown} rawLength={presentation.rawLength} />;
  }
  markdown = presentation.safeMarkdown;
  const lines = markdown.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];

  function flushList() {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="space-y-1.5 mb-4 ml-1">
          {listBuffer}
        </ul>
      );
      listBuffer = [];
    }
  }

  lines.forEach((line, i) => {
    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={i} className="font-display text-2xl mb-1">
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={i} className="font-display text-base mt-5 mb-2 pt-3 border-t border-[var(--color-line)] first:border-0 first:pt-0 first:mt-0">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      elements.push(
        <p key={i} className="text-xs text-[var(--color-ink-soft)] mb-4 italic">
          {line.slice(1, -1)}
        </p>
      );
    } else if (line.startsWith("  > ")) {
      elements.push(
        <p key={i} className="text-xs italic text-[var(--color-ink-soft)] border-l-2 border-[var(--color-line)] pl-3 -mt-1 mb-2 ml-3">
          {line.slice(4)}
        </p>
      );
    } else if (line.startsWith("- ")) {
      listBuffer.push(
        <li key={i} className="text-sm flex gap-2">
          <span className="text-[var(--color-accent)] shrink-0">·</span>
          <span>{renderInline(line.slice(2))}</span>
        </li>
      );
    } else if (line === "---") {
      flushList();
      elements.push(<hr key={i} className="my-4 border-[var(--color-line)]" />);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={i} className="text-sm mb-3">
          {renderInline(line)}
        </p>
      );
    }
  });
  flushList();

  return <div>{elements}</div>;
}

function LegacySourceFailure({ raw, rawLength }: { raw: string; rawLength: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div data-shoot="legacy-source-failure" className="rounded-lg border border-[var(--i-amber)] bg-[var(--i-amber-soft)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--i-amber)]">Historical source failure</div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--i-text)]">
        Source fetch failed when this historical snapshot was generated. Raw source response is available in technical details.
      </p>
      <details className="mt-3 text-xs text-[var(--i-text-soft)]">
        <summary className="cursor-pointer">Technical details</summary>
        <p className="mt-2">Immutable raw payload retained · {rawLength.toLocaleString()} characters · not rendered as report prose.</p>
        <button
          type="button"
          className="mt-2 rounded border border-[var(--i-border-strong)] px-2.5 py-1.5"
          onClick={async () => {
            await navigator.clipboard.writeText(raw);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? "Raw payload copied" : "Copy raw source response"}
        </button>
      </details>
    </div>
  );
}

export function CopyMarkdownButton({ markdown, label = "Copy to clipboard" }: { markdown: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      onClick={copy}
      className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs hover:bg-black/5"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
