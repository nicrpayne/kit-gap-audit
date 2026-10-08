import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedIssues } from "@/lib/linear";
import { deliveryRelevantIssueIds } from "@/lib/forecast/coverage";
import { makeSignalEstimate, parseSignalEstimateInput } from "@/lib/scope/signalEstimates";
import { replayCanonicalCapabilityEstimate, setCanonicalCapabilityEstimate, ScopeRealityInputError } from "@/lib/scope/reality";
import { scopeRealityError } from "@/lib/scope/http";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const {id} = await params;
    const body = await req.json();
    let input;
    try { input = parseSignalEstimateInput(body.input); } catch (error) { throw new ScopeRealityInputError(error instanceof Error ? error.message : "Invalid remaining-work estimate."); }
    const replay = await replayCanonicalCapabilityEstimate(id, body.idempotencyKey, "accept_signal_estimate", { expectedRevision: body.expectedRevision, input });
    if (replay) return NextResponse.json(replay);
    const capability = await prisma.capability.findUniqueOrThrow({where:{id}, include:{scope:true,workLinks:true}});
    if (capability.status !== "accepted") throw new ScopeRealityInputError("Accept the Scope card before saving a Reality estimate. You can still explore unaccepted work separately.");
    const issues = await getScopedIssues(capability.scope);
    const remaining = new Set(deliveryRelevantIssueIds(issues,capability.scope.includeTriage));
    const openIds = capability.workLinks.filter(link => ["active","configured"].includes(link.state) && remaining.has(link.externalId)).map(link => link.externalId);
    let estimate;
    try { estimate = makeSignalEstimate(id, body.expectedRevision, input, openIds, `signal:${body.idempotencyKey}`); } catch (error) { throw new ScopeRealityInputError(error instanceof Error ? error.message : "Invalid remaining-work estimate."); }
    return NextResponse.json(await setCanonicalCapabilityEstimate(id, {expectedRevision:body.expectedRevision, estimate, reviewedOpenItemIds:openIds, idempotencyKey:body.idempotencyKey}));
  } catch(error) { return scopeRealityError(error); }
}
