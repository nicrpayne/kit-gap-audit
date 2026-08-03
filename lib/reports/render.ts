// Pure markdown rendering for a leadership report -- no DB/network here,
// so it's easy to reason about and test against fixed input. The output
// is what gets stored verbatim in Report.summaryMarkdown: the historical
// record, not recomputed later even if this rendering logic changes.

export interface ReportDecision {
  title: string;
  owner: string | null;
  blocks: string | null;
  quote: string;
}

export interface ReportResolvedDecision {
  title: string;
  resolution: string;
}

export interface ReportShippedIssue {
  identifier: string;
  title: string;
}

export interface ReportScenario {
  label: string;
  deltaDays: number;
}

export interface ReportData {
  scopeName: string;
  generatedAt: Date;
  targetDate: Date | null;
  likelyDate: Date;
  earliestDate: Date;
  latestDate: Date;
  confidenceAtTarget: number | null;
  previousReportAt: Date | null;
  likelyDateDeltaDays: number | null; // vs. previous report; null if first report
  shipped: ReportShippedIssue[];
  blockingDecisions: ReportDecision[];
  nonBlockingDecisions: ReportDecision[];
  resolvedSinceLast: ReportResolvedDecision[];
  bestScenario: ReportScenario | null; // largest deltaDays improvement available
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function deltaPhrase(days: number): string {
  if (days === 0) return "unchanged";
  return days < 0 ? `${Math.abs(days)} days sooner` : `${days} days later`;
}

export function renderReportMarkdown(data: ReportData): string {
  const lines: string[] = [];

  lines.push(`# ${data.scopeName} — Release Update`);
  lines.push(`*${fmtDate(data.generatedAt)}*`);
  lines.push("");

  lines.push(`## Forecast`);
  lines.push(`**Likely release: ${fmtDate(data.likelyDate)}**`);
  if (data.targetDate) {
    lines.push(
      `${data.confidenceAtTarget ?? "?"}% chance of landing on or before the target date (${fmtDate(data.targetDate)}).`
    );
  }
  lines.push(`Range: ${fmtDate(data.earliestDate)} – ${fmtDate(data.latestDate)}.`);
  if (data.previousReportAt && data.likelyDateDeltaDays !== null) {
    lines.push(`Since the last report (${fmtDate(data.previousReportAt)}): the likely date moved **${deltaPhrase(data.likelyDateDeltaDays)}**.`);
  }
  lines.push("");

  lines.push(`## What shipped${data.previousReportAt ? " since the last report" : ""} (${data.shipped.length})`);
  if (data.shipped.length === 0) {
    lines.push(data.previousReportAt ? "Nothing completed since the last report." : "First report for this scope.");
  } else {
    for (const issue of data.shipped) {
      lines.push(`- ${issue.identifier} ${issue.title}`);
    }
  }
  lines.push("");

  lines.push(`## What's blocking (${data.blockingDecisions.length})`);
  if (data.blockingDecisions.length === 0) {
    lines.push("No open blocking decisions.");
  } else {
    for (const d of data.blockingDecisions) {
      lines.push(`- **${d.title}**${d.owner ? ` — Owner: ${d.owner}` : ""}${d.blocks ? ` — Blocks: ${d.blocks}` : ""}`);
      lines.push(`  > "${d.quote}"`);
    }
  }
  lines.push("");

  if (data.resolvedSinceLast.length > 0) {
    lines.push(`## Resolved since the last report (${data.resolvedSinceLast.length})`);
    for (const d of data.resolvedSinceLast) {
      lines.push(`- **${d.title}** — ${d.resolution}`);
    }
    lines.push("");
  }

  if (data.nonBlockingDecisions.length > 0) {
    lines.push(`## Other open decisions (${data.nonBlockingDecisions.length})`);
    for (const d of data.nonBlockingDecisions) {
      lines.push(`- ${d.title}${d.owner ? ` — Owner: ${d.owner}` : ""}`);
    }
    lines.push("");
  }

  if (data.bestScenario && data.bestScenario.deltaDays < 0) {
    lines.push(`## Fastest path to a sooner date`);
    lines.push(`${data.bestScenario.label} → **${Math.abs(data.bestScenario.deltaDays)} days sooner**.`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Generated ${data.generatedAt.toISOString()} · KIT Gap Audit`);

  return lines.join("\n");
}
