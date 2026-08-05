import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAudit, VALID_AUDIT_KINDS } from "@/lib/audit/run";
import { runEstimationForScope } from "@/lib/estimate/runForScope";
import { computeForecast } from "@/lib/forecast/compute";
import { generateReport } from "@/lib/reports/generate";

interface RefreshContextDoc {
  label: string;
  content: string;
}

interface RefreshTranscript {
  kind: string;
  title?: string;
  content: string;
}

interface RefreshBody {
  scopeId?: string;
  transcript?: RefreshTranscript;
  contextDocs?: RefreshContextDoc[];
  generateReport?: boolean;
}

// One call to do everything a Hermes/Cowork-triggered refresh needs:
// push fresh scoped context, optionally audit a new transcript, re-run AI
// estimation, re-run the forecast, and optionally generate a leadership
// report -- the single "here's the context, work your magic" entrypoint,
// versus making an external caller sequence four separate API calls
// itself. Reuses the exact same pipeline every other route uses (runAudit,
// runEstimationForScope, computeForecast, generateReport), so a refresh
// triggered by Hermes always agrees with what a human sees on the pages.
//
// Context docs are ingested FIRST, before anything that touches Linear --
// so if Linear is unreachable, freshly pushed context still lands rather
// than being lost alongside the failed refresh.
export async function POST(req: NextRequest) {
  let body: RefreshBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.scopeId) {
    return NextResponse.json({ error: "scopeId is required" }, { status: 400 });
  }

  if (body.transcript !== undefined) {
    if (!body.transcript.content?.trim()) {
      return NextResponse.json({ error: "transcript.content is required" }, { status: 400 });
    }
    if (!VALID_AUDIT_KINDS.includes(body.transcript.kind)) {
      return NextResponse.json(
        { error: `transcript.kind must be one of: ${VALID_AUDIT_KINDS.join(", ")}` },
        { status: 400 }
      );
    }
  }

  if (body.contextDocs !== undefined) {
    for (const doc of body.contextDocs) {
      if (!doc.label?.trim() || !doc.content?.trim()) {
        return NextResponse.json(
          { error: "each contextDocs entry needs a non-empty label and content" },
          { status: 400 }
        );
      }
    }
  }

  const scope = await prisma.scope.findUnique({ where: { id: body.scopeId } });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const contextDocsUpdated: string[] = [];
  if (body.contextDocs) {
    for (const doc of body.contextDocs) {
      const label = doc.label.trim();
      const existing = await prisma.contextDoc.findFirst({
        where: { scopeId: scope.id, label },
        select: { id: true },
      });
      if (existing) {
        await prisma.contextDoc.update({ where: { id: existing.id }, data: { content: doc.content } });
      } else {
        await prisma.contextDoc.create({ data: { scopeId: scope.id, label, content: doc.content } });
      }
      contextDocsUpdated.push(label);
    }
  }

  let audit: { sourceId: string; findingCount: number } | undefined;
  if (body.transcript) {
    try {
      const result = await runAudit(scope, body.transcript);
      audit = { sourceId: result.source.id, findingCount: result.findings.length };
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Audit failed",
          contextDocsUpdated,
        },
        { status: 502 }
      );
    }
  }

  let estimateSummary;
  try {
    estimateSummary = (await runEstimationForScope(scope)).summary;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Estimation failed",
        contextDocsUpdated,
        audit,
      },
      { status: 502 }
    );
  }

  let forecastResult;
  try {
    forecastResult = await computeForecast(scope);
  } catch (error) {
    return NextResponse.json(
      {
        error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}`,
        contextDocsUpdated,
        audit,
        estimate: estimateSummary,
      },
      { status: 502 }
    );
  }

  let report: { id: string; summaryMarkdown: string } | undefined;
  if (body.generateReport) {
    try {
      const generated = await generateReport(scope);
      report = { id: generated.report.id, summaryMarkdown: generated.report.summaryMarkdown };
    } catch (error) {
      return NextResponse.json(
        {
          error: `Report generation failed: ${error instanceof Error ? error.message : "unknown error"}`,
          contextDocsUpdated,
          audit,
          estimate: estimateSummary,
          forecast: {
            likelyDate: forecastResult.likelyDate,
            confidenceAtTarget: forecastResult.confidenceAtTarget,
          },
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    scopeId: scope.id,
    scopeName: scope.name,
    contextDocsUpdated,
    audit,
    estimate: estimateSummary,
    forecast: {
      likelyDate: forecastResult.likelyDate,
      earliestDate: forecastResult.earliestDate,
      latestDate: forecastResult.latestDate,
      confidenceAtTarget: forecastResult.confidenceAtTarget,
      breakdown: forecastResult.breakdown,
    },
    // False if a configured Notion/Figma source failed to load this run --
    // check this before trusting the numbers above from an unattended call.
    contextComplete: forecastResult.contextComplete,
    contextIssues: forecastResult.contextIssues,
    report,
  });
}
