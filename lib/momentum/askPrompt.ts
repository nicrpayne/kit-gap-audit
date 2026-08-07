// Prompts for the "Ask" chips (design brief: explicitly user-triggered,
// natural-language explanations layered on data that's already computed
// -- never anything that fires automatically). Two canned question
// types on purpose, not a free-text chat interface.

export interface AskContext {
  scopeName: string;
  targetDate: Date | null;
  likelyDate: Date;
  earliestDate: Date;
  latestDate: Date;
  confidenceAtTarget: number | null;
  teamCapacity: number;
  capacitySource: string;
  remainingIssueCount: number;
  blockingGateLabels: string[];
  topItems: { label: string; likelyDays: number }[];
  placeholderEffortSharePct: number;
  bestScenario: { label: string; deltaDays: number } | null;
  momentum: {
    dateDeltaDays: number;
    confidenceDeltaPct: number | null;
    attribution: string | null;
    stalled: boolean;
    previousGeneratedAt: Date;
  } | null;
}

const COMMON_RULES = `You are explaining a software release forecast to a product leader who
trusts plain, concrete language over hedging or jargon. You will be given
the forecast's current numbers (already computed by a Monte Carlo
simulation over the team's own tickets -- do not second-guess or
recompute them, just explain them) and, when available, how they changed
since the last time this was reported.

Rules:
- 2-4 sentences. No bullet points, no headers, no markdown.
- Cite the SPECIFIC numbers given to you (ticket counts, day deltas,
  percentages) -- don't speak in vague generalities like "several
  factors" when you have the actual factor.
- Never invent a fact not present in the context (no made-up ticket
  names, no invented industry benchmarks, no guessing at causes you
  weren't told).
- Plain, direct, sentence case. Not "12 days sooner" as a bare number if
  you can attribute it to something concrete instead.

Respond with ONLY JSON: { "answer": "..." }
No markdown, no preamble.`;

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatContext(ctx: AskContext): string {
  const lines: string[] = [];
  lines.push(`Scope: ${ctx.scopeName}`);
  lines.push(`Likely release date: ${fmtDate(ctx.likelyDate)} (range ${fmtDate(ctx.earliestDate)} - ${fmtDate(ctx.latestDate)})`);
  if (ctx.targetDate) {
    lines.push(
      `Target date: ${fmtDate(ctx.targetDate)}, confidence of landing on or before it: ${ctx.confidenceAtTarget ?? "unknown"}%`
    );
  } else {
    lines.push("No target date set for this scope.");
  }
  lines.push(`Team capacity: ${ctx.teamCapacity} parallel developer-equivalents (source: ${ctx.capacitySource})`);
  lines.push(`Remaining open tickets: ${ctx.remainingIssueCount}`);
  if (ctx.blockingGateLabels.length > 0) {
    lines.push(`Open blocking decisions: ${ctx.blockingGateLabels.join("; ")}`);
  }
  if (ctx.topItems.length > 0) {
    lines.push(
      `Largest remaining items: ${ctx.topItems.map((i) => `${i.label} (~${i.likelyDays}d)`).join(", ")}`
    );
  }
  lines.push(`${ctx.placeholderEffortSharePct}% of the projected effort rests on placeholder guesses, not real estimates.`);
  if (ctx.bestScenario) {
    lines.push(`Best available lever: "${ctx.bestScenario.label}" -> ${Math.abs(ctx.bestScenario.deltaDays)} days sooner.`);
  }
  if (ctx.momentum) {
    lines.push(
      `Since the last report (${fmtDate(ctx.momentum.previousGeneratedAt)}): likely date moved ${ctx.momentum.dateDeltaDays} days` +
        (ctx.momentum.confidenceDeltaPct !== null ? `, confidence moved ${ctx.momentum.confidenceDeltaPct} points` : "") +
        (ctx.momentum.attribution ? `. Biggest driver: ${ctx.momentum.attribution}` : "") +
        (ctx.momentum.stalled ? " (below the threshold this tool treats as meaningful movement)" : "")
    );
  } else {
    lines.push("No prior report exists yet for this scope -- this is the first read.");
  }
  return lines.join("\n");
}

export function buildWhyMovedPrompt(ctx: AskContext): string {
  return `${COMMON_RULES}

Question: "Why did this move?"

${formatContext(ctx)}

Explain what's driving the current date and, if momentum data is present,
what specifically caused the movement (or the lack of it) since the last
report. If there's no prior report, explain what's driving today's date
instead of a "why did it move" answer.`;
}

export function buildHitTargetPrompt(ctx: AskContext): string {
  return `${COMMON_RULES}

Question: "What would it take to hit the target date?"

${formatContext(ctx)}

Explain concretely what would need to happen to land on or before the
target date -- reference the actual biggest lever available (the best
scenario given, if one exists) and the actual biggest risk (blocking
decisions, placeholder-heavy estimates, or a large remaining item) rather
than generic advice.`;
}
