"use client";

import { useState } from "react";

type Question = "why_moved" | "hit_target";

const LABELS: Record<Question, string> = {
  why_moved: "Why did this move?",
  hit_target: "What would it take to hit the target?",
};

// "Ask" chips: same interaction pattern as the "Try" scenario chips
// (a chip -> a result), different intent -- these ask a question and get
// a real natural-language explanation instead of a precomputed number.
// Explicitly user-triggered (a click), never automatic, per the standing
// no-LLM-in-the-simulation-path rule.
export default function AskChips({ scopeId, hasTargetDate }: { scopeId: string; hasTargetDate: boolean }) {
  const [loading, setLoading] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<{ question: Question; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: Question) {
    setLoading(question);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/forecast/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeId, question }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't get an explanation.");
      setAnswer({ question, text: body.answer });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get an explanation.");
    } finally {
      setLoading(null);
    }
  }

  const questions: Question[] = hasTargetDate ? ["why_moved", "hit_target"] : ["why_moved"];

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 flex-wrap">
        {questions.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            <span aria-hidden>💬</span>
            {loading === q ? "Thinking…" : LABELS[q]}
          </button>
        ))}
      </div>
      {error && <div className="mt-2 text-xs text-[var(--color-danger)]">{error}</div>}
      {answer && (
        <div className="mt-2 text-xs bg-[var(--color-card)] border border-[var(--color-line)] rounded-lg px-3.5 py-3">
          {answer.text}
        </div>
      )}
    </div>
  );
}
