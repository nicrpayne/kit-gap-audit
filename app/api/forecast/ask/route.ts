import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeForecast } from "@/lib/forecast/compute";
import { computeChangesSince } from "@/lib/reports/changes";
import { computeMomentum } from "@/lib/momentum/compute";
import { attributionSentence } from "@/lib/momentum/attribution";
import { buildWhyMovedPrompt, buildHitTargetPrompt, type AskContext } from "@/lib/momentum/askPrompt";
import { completeJson } from "@/lib/model";

const QUESTION_TYPES = new Set(["why_moved", "hit_target"]);

// Explicitly user-triggered explanation ("Ask" chips) -- the one place in
// this app outside the existing cached AI estimator where a model call is
// allowed, per the standing rule: never anything that fires automatically
// on a recompute, a drag frame, or a page load. Two fixed question types,
// not a free-text chat interface.
export async function POST(req: NextRequest) {
  let body: { scopeId?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.scopeId || !body.question || !QUESTION_TYPES.has(body.question)) {
    return NextResponse.json(
      { error: `question must be one of: ${[...QUESTION_TYPES].join(", ")}` },
      { status: 400 }
    );
  }

  const scope = await prisma.scope.findUnique({ where: { id: body.scopeId } });
  if (!scope) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  if (body.question === "hit_target" && !scope.targetDate) {
    return NextResponse.json({ error: "This scope has no target date set." }, { status: 400 });
  }

  let forecast;
  try {
    forecast = await computeForecast(scope);
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't read tickets from Linear: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }

  const previousReport = await prisma.report.findFirst({
    where: { scopeId: scope.id },
    orderBy: { generatedAt: "desc" },
  });

  let momentum: AskContext["momentum"] = null;
  if (previousReport) {
    const changes = await computeChangesSince(scope, forecast, previousReport.generatedAt);
    const m = computeMomentum(
      { generatedAt: new Date(), likelyDate: forecast.likelyDate, confidenceAtTarget: forecast.confidenceAtTarget },
      previousReport
    );
    momentum = { ...m, attribution: attributionSentence(changes) };
  }

  const ctx: AskContext = {
    scopeName: scope.name,
    targetDate: scope.targetDate,
    likelyDate: forecast.likelyDate,
    earliestDate: forecast.earliestDate,
    latestDate: forecast.latestDate,
    confidenceAtTarget: forecast.confidenceAtTarget,
    teamCapacity: forecast.breakdown.teamCapacity,
    capacitySource: forecast.breakdown.capacitySource,
    remainingIssueCount: forecast.breakdown.remainingIssueCount,
    blockingGateLabels: forecast.breakdown.blockingGates.map((g) => g.label),
    topItems: forecast.breakdown.topItems,
    placeholderEffortSharePct: forecast.breakdown.estimateQuality.placeholderEffortSharePct,
    bestScenario: forecast.scenarios.reduce<{ label: string; deltaDays: number } | null>(
      (best, s) => (best === null || s.deltaDays < best.deltaDays ? { label: s.label, deltaDays: s.deltaDays } : best),
      null
    ),
    momentum,
  };

  const prompt = body.question === "why_moved" ? buildWhyMovedPrompt(ctx) : buildHitTargetPrompt(ctx);

  try {
    const result = await completeJson<{ answer?: string }>({ prompt, maxTokens: 500 });
    if (!result.answer) throw new Error("model did not return an answer");
    return NextResponse.json({ answer: result.answer });
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't get an explanation: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 502 }
    );
  }
}
