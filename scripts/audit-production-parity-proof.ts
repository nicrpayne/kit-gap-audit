// Production-shape spatial parity proof.
//
// This deliberately consumes a read-only GET /api/audit/graph capture rather
// than a database connection. It recreates the exact client-side Graphology
// graph, disclosure baseline and Rubric projection used by Audit, then samples
// Constellations on deterministic fixed ticks. No canonical state is written.

import fs from "node:fs";
import { createHash } from "node:crypto";
import Graph from "graphology";
import type { AuditEdgeAttributes, AuditGraph, AuditNodeAttributes } from "../lib/audit/graph";
import { layoutGraph } from "../lib/audit/graphLayout";
import { buildScene, buildSceneCache } from "../lib/audit/visualScene";
import { adaptSignalSceneToRubric } from "../lib/audit/rubricVisualAdapter";
import { SpatialField, TUNING } from "../lib/audit/spatial/field";

type CapturedPayload = {
  graph: {
    nodes: Array<{ key: string; attributes: AuditNodeAttributes }>;
    edges: Array<{ source: string; target: string; attributes: AuditEdgeAttributes }>;
  };
};

const source = process.argv[2] ?? "artifacts/rubric-production-parity/production-jsa-graph.json";
const payload = JSON.parse(fs.readFileSync(source, "utf8")) as CapturedPayload;
const graph: AuditGraph = new Graph<AuditNodeAttributes, AuditEdgeAttributes>({
  type: "directed",
  multi: true,
  allowSelfLoops: false,
});
for (const node of payload.graph.nodes) graph.addNode(node.key, node.attributes);
for (const edge of payload.graph.edges) graph.addDirectedEdge(edge.source, edge.target, edge.attributes);

const layout = layoutGraph(graph);
const cache = buildSceneCache(graph, layout);
const opened = new Set<string>();
graph.forEachNode((id, attributes) => {
  if (attributes.slice === "core") opened.add(id);
});
const scene = buildScene(
  {
    graph,
    layout,
    camera: { x: 700, y: 700, k: 0.72 },
    viewport: { w: 812, h: 628.75 },
    level: "far",
    opened,
    selectedId: null,
    hoveredId: null,
    matches: null,
    soloNodes: null,
    swept: new Set(),
  },
  cache
);
const world = adaptSignalSceneToRubric(scene, "far");
if (process.env.SIGNAL_GROUP_PULL) (TUNING as { groupPull: number }).groupPull = Number(process.env.SIGNAL_GROUP_PULL);
if (process.env.SIGNAL_GROUP_PULL_FLOOR) {
  (TUNING as { groupPullFloor: number }).groupPullFloor = Number(process.env.SIGNAL_GROUP_PULL_FLOOR);
}
if (process.env.SIGNAL_CELL_FACTOR) {
  (TUNING as { cellOwnershipFactor: number }).cellOwnershipFactor = Number(process.env.SIGNAL_CELL_FACTOR);
}

const countBy = <T>(values: T[], key: (value: T) => string) =>
  Object.fromEntries(
    [...values.reduce((counts, value) => {
      const name = key(value);
      counts.set(name, (counts.get(name) ?? 0) + 1);
      return counts;
    }, new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );
const parentSizes = countBy(
  world.nodes.filter((node) => node.parentId),
  (node) => node.parentId!
);
const sourceMembership = new Map<string, number>();
graph.forEachEdge((_id, attributes, _source, target) => {
  if (attributes.rel === "extracted_from") sourceMembership.set(target, (sourceMembership.get(target) ?? 0) + 1);
});
const externalSubtypeMembership = new Map<string, number>();
graph.forEachNode((_id, attributes) => {
  if (attributes.kind !== "intel") return;
  const key = `${String(attributes.intelligenceType ?? "unknown")}|${attributes.isCurrent === false ? "previous" : "current"}`;
  externalSubtypeMembership.set(key, (externalSubtypeMembership.get(key) ?? 0) + 1);
});

const sampleSteps = [0, 6, 15, 30, 60, 120, 240, 300, 360, 480];
const positionDigest = (field: SpatialField) => createHash("sha256").update(
  [...field.positions()]
    .map(([id, position]) => `${id}:${position.x.toFixed(9)},${position.y.toFixed(9)}`)
    .join("|")
).digest("hex");
function sample(kind: "direct" | "morph") {
  const field = new SpatialField({ mode: kind === "direct" ? "constellations" : "rings", reducedMotion: false });
  field.setNodes(world.nodes);
  if (kind === "morph") {
    for (let i = 0; i < 8; i++) field.tick(16.7);
    field.setMode("constellations");
  }
  const out: Array<{ steps: number; pct: number; byTerritory: ReturnType<SpatialField["constellationMetrics"]>["byTerritory"] }> = [];
  let done = 0;
  for (const target of sampleSteps) {
    while (done < target) {
      field.tick(16.7);
      done++;
    }
    const metric = field.constellationMetrics();
    out.push({ steps: target, pct: metric.nearestOwnHubPct, byTerritory: metric.byTerritory });
  }
  const settledField = new SpatialField({ mode: kind === "direct" ? "constellations" : "rings", reducedMotion: false });
  settledField.setNodes(world.nodes);
  if (kind === "morph") {
    for (let i = 0; i < 8; i++) settledField.tick(16.7);
    settledField.setMode("constellations");
  }
  let settledSteps = 0;
  while (settledSteps < 1000) {
    settledSteps++;
    if (!settledField.tick(16.7)) break;
  }
  return { field, samples: out, settledField, settledSteps };
}

const runs = Array.from({ length: 10 }, () => {
  const result = sample("morph");
  const metric = result.settledField.constellationMetrics();
  return {
    pct: metric.nearestOwnHubPct,
    largestTerritoryAreaShare: metric.largestTerritoryAreaShare,
    positionDigest: positionDigest(result.settledField),
  };
});

const direct = sample("direct");
const morph = sample("morph");
const uniqueDigests = new Set(runs.map((run) => run.positionDigest)).size;
const cadenceRuns = Object.entries({
  hz120: [8.33],
  hz60: [16.67],
  hz30: [33.33],
  jitter: [9, 24, 14, 20],
}).map(([name, cadence]) => {
  const field = new SpatialField({ mode: "rings", reducedMotion: false });
  field.setNodes(world.nodes);
  for (let i = 0; i < 8; i++) field.tick(16.7);
  field.setMode("constellations");
  let calls = 0;
  let elapsed = 0;
  while (calls < 1000) {
    const dt = cadence[calls % cadence.length];
    elapsed += dt;
    calls++;
    if (!field.tick(dt)) break;
  }
  return { name, calls, elapsed, pct: field.constellationMetrics().nearestOwnHubPct, positionDigest: positionDigest(field) };
});
const uniqueCadenceDigests = new Set(cadenceRuns.map((run) => run.positionDigest)).size;
const overlapCount = (field: SpatialField) => {
  const positions = field.positions();
  let overlaps = 0;
  for (let i = 0; i < world.nodes.length; i++) {
    const a = world.nodes[i];
    const pa = positions.get(a.id)!;
    for (let j = i + 1; j < world.nodes.length; j++) {
      const b = world.nodes[j];
      const pb = positions.get(b.id)!;
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < a.r + b.r + 1) overlaps++;
    }
  }
  return overlaps;
};
const report = {
  source,
  graph: {
    nodes: graph.order,
    edges: graph.size,
    nodesByKind: countBy(graph.nodes(), (id) => String(graph.getNodeAttribute(id, "kind"))),
    edgesByRel: countBy(graph.edges(), (id) => String(graph.getEdgeAttribute(id, "rel"))),
    sourceArtifacts: graph.filterNodes((_id, attributes) =>
      ["source", "transcript", "notion_page", "figma_artifact"].includes(attributes.kind)
    ).length,
    sourceMembership: {
      groups: sourceMembership.size,
      members: [...sourceMembership.values()].reduce((sum, count) => sum + count, 0),
      groupSizes: [...sourceMembership.values()].sort((a, b) => b - a),
    },
    externalSubtypeMembership: Object.fromEntries([...externalSubtypeMembership].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  },
  disclosure: { opened: opened.size, selected: null, search: null, trace: null, expanded: 0, revealed: 0 },
  viewport: { width: 812, height: 628.75, devicePixelRatio: 2, zoomTier: "far" },
  projection: {
    canonical: world.projectedCanonicalIds.size,
    aggregateRegions: world.aggregateIds.size,
    population: world.nodes.length,
    aggregatesByKind: countBy(scene.aggregates, (aggregate) => aggregate.kind),
    aggregateMembersByKind: Object.fromEntries(
      ["source", "type"].map((kind) => [
        kind,
        scene.aggregates.filter((aggregate) => aggregate.kind === kind).reduce((sum, aggregate) => sum + aggregate.count, 0),
      ])
    ),
    byRole: countBy(world.nodes, (node) => node.role),
    byTerritory: countBy(world.nodes, (node) => node.territory),
    membersByTerritory: countBy(world.nodes.filter((node) => node.parentId), (node) => node.territory),
    parentGroups: Object.keys(parentSizes).length,
    parentGroupSizes: Object.values(parentSizes).sort((a, b) => b - a),
  },
  tuning: {
    groupPull: TUNING.groupPull,
    groupPullFloor: TUNING.groupPullFloor,
    cellOwnershipFactor: TUNING.cellOwnershipFactor,
  },
  direct: direct.samples,
  directSettled: {
    steps: direct.settledSteps,
    ...direct.settledField.constellationMetrics(),
  },
  morph: morph.samples,
  morphSettled: {
    steps: morph.settledSteps,
    ...morph.settledField.constellationMetrics(),
  },
  cadences: cadenceRuns,
  uniqueCadencePositionDigests: uniqueCadenceDigests,
  tenRuns: {
    percentages: runs.map((run) => run.pct),
    uniquePositionDigests: uniqueDigests,
    largestTerritoryAreaShares: runs.map((run) => run.largestTerritoryAreaShare),
  },
};
if (process.env.SIGNAL_REPORT) fs.writeFileSync(process.env.SIGNAL_REPORT, `${JSON.stringify(report, null, 2)}\n`);
if (process.env.SIGNAL_COMPACT) {
  const at = (values: typeof morph.samples, steps: number) => values.find((sample) => sample.steps === steps)?.pct;
  console.log(JSON.stringify({
    groupPull: TUNING.groupPull,
    groupPullFloor: TUNING.groupPullFloor,
    cellOwnershipFactor: TUNING.cellOwnershipFactor,
    direct120: at(direct.samples, 120),
    direct240: at(direct.samples, 240),
    direct480: at(direct.samples, 480),
    morph120: at(morph.samples, 120),
    morph240: at(morph.samples, 240),
    morph480: at(morph.samples, 480),
    directSettled: direct.settledField.constellationMetrics().nearestOwnHubPct,
    directSettledSteps: direct.settledSteps,
    morphSettled: morph.settledField.constellationMetrics().nearestOwnHubPct,
    morphSettledSteps: morph.settledSteps,
    directOverlaps: overlapCount(direct.settledField),
    morphOverlaps: overlapCount(morph.settledField),
    cadences: cadenceRuns,
    uniqueCadenceDigests,
    uniqueDigests,
  }));
  process.exit(0);
}
console.log(JSON.stringify(report, null, 2));
