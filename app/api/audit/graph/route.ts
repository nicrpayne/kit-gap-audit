// THE SIGNAL GRAPH READ.
//
// Deliberately a SEPARATE route from /api/audit/truth rather than an addition
// to it. Two reasons, both about not disturbing what already works:
//
//   The Truth Map renderer is unchanged this tranche. Its read must stay
//   byte-identical, so the existing browser proofs keep meaning what they
//   meant.
//
//   The graph is a different question at a different level of detail. A
//   caller asking "what should I draw" and one asking "what is related to
//   what" want different payloads, and the expanded slices are large enough
//   that folding them into every map load would be a real cost for a renderer
//   that does not yet read them.
//
// READ-ONLY, like the map read. Building a graph writes nothing — a proof
// asserts it.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadAuditGraphInputs } from "@/lib/audit/graphInputs";
import {
  buildAuditGraph,
  sliceGraph,
  exportAuditGraph,
  measureGraph,
  EDGE_RULES,
  SLICE_ORDER,
  type GraphSlice,
} from "@/lib/audit/graph";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("scope");
  const sliceParam = req.nextUrl.searchParams.get("slice");

  const scopes = await prisma.scope.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (scopes.length === 0) {
    return NextResponse.json({ error: "No Scopes are configured." }, { status: 404 });
  }
  const scopeId = requested && scopes.some((s) => s.id === requested) ? requested : scopes[0].id;

  const slice: GraphSlice = (SLICE_ORDER as string[]).includes(sliceParam ?? "")
    ? (sliceParam as GraphSlice)
    : "detail";

  const inputs = await loadAuditGraphInputs(scopeId);
  if (!inputs) return NextResponse.json({ error: "Unknown Scope" }, { status: 404 });

  const full = buildAuditGraph(inputs);
  const sliced = slice === "detail" ? full : sliceGraph(full, slice);

  return NextResponse.json({
    scopes,
    scope: { id: inputs.entities.scope.id, name: inputs.entities.scope.name },
    slice,
    measurement: measureGraph(sliced),
    graph: exportAuditGraph(sliced),
    // Shipped with the payload so a consumer can explain any edge it renders
    // without needing this repository open.
    rules: EDGE_RULES,
    linearError: inputs.linearError,
  });
}
