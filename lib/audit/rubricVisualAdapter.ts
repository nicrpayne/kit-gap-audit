// SIGNAL → RUBRIC VISUAL ADAPTER.
//
// This is the only boundary where Signal concepts become inputs to the
// Rubric-derived viewport chassis. It is deliberately boring: canonical ids,
// resolved presentation policy, one Rubric visual role, one group anchor and
// one Signal radial band. No filesystem, ARMS, agent, app or document API
// crosses the boundary.

import type { ZoomLevel } from "@/components/audit/graphTokens";
import type { AuditScene, AuditVisualEdge, AuditVisualNode, LayoutRole } from "./visualScene";
import type { AuditTerritory, FieldNodeInput, RubricVisualRole } from "./spatial/field";

export interface RubricVisualLink {
  id: string;
  source: string;
  target: string;
  kind: "semantic" | "temporal" | "provenance" | "contextual";
  basis: string;
  sourceNode: AuditVisualNode;
  targetNode: AuditVisualNode;
  signal: AuditVisualEdge;
}

export interface RubricVisualWorld {
  nodes: FieldNodeInput[];
  links: RubricVisualLink[];
  projectedCanonicalIds: Set<string>;
  aggregateIds: Set<string>;
}

/** Rubric's painter/layout vocabulary, with its product-specific names gone. */
export function rubricRoleOf(role: LayoutRole): RubricVisualRole {
  if (role === "cell") return "aggregate";
  return role;
}

function territoryOf(node: AuditVisualNode): AuditTerritory {
  if (node.kind === "reality" || node.kind === "scope" || node.kind === "requirement") return "model";
  if (node.kind === "intel" || node.cluster === "hermes") return "external";
  if (
    node.kind === "passage" || node.layoutRole === "artifact" || node.kind === "intelligence" ||
    node.cluster === "evidence" || node.cluster === "notion" || node.cluster === "figma"
  ) return "evidence";
  return "delivery";
}

/**
 * Canonical graph → zoom-tier Rubric population.
 *
 * Every canonical object has a physical seat at every zoom. Zoom changes
 * identity disclosure, not existence: a far-away passage may be a quiet dot,
 * but it must still contribute to the mass and geography of the world. This
 * is the essential Rubric behaviour the earlier aggregate-only projection
 * lost — it made a 438-object project look like a sparse 191-object diagram.
 *
 * Aggregates remain as truthful group handles/counts. They no longer stand in
 * for missing physical population.
 */
export function adaptSignalSceneToRubric(scene: AuditScene, level: ZoomLevel): RubricVisualWorld {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  void level; // zoom changes disclosure in the scene, never physical presence here

  const projectedCanonicalIds = new Set<string>();
  const aggregateIds = new Set<string>();
  for (const aggregate of scene.aggregates) {
    aggregateIds.add(aggregate.id);
  }

  const parentOf = new Map<string, string>();
  for (const aggregate of scene.aggregates) {
    const parent = aggregate.hub ?? aggregate.id;
    for (const id of aggregate.members) parentOf.set(id, parent);
  }

  const nodes: FieldNodeInput[] = scene.nodes.map((node) => {
    projectedCanonicalIds.add(node.id);
    const aggregateParent = parentOf.get(node.id) ?? null;
    const laneParent = byId.has(`lane:${node.anchor}`) ? `lane:${node.anchor}` : null;
    const isArtifact = node.layoutRole === "artifact";
    const parentId = aggregateParent ?? (node.anchor === "core" || node.kind === "lane" || isArtifact ? null : laneParent);
    const cell = isArtifact ? node.id : parentId ?? node.anchor;
    return {
    id: node.id,
    r: node.identity === "latent" ? node.latentR : node.r,
    anchor: node.anchor,
    band: node.band,
    order: node.order,
    role: rubricRoleOf(node.layoutRole),
    isAnchorNode: node.kind === "lane",
    isCore: node.anchor === "core",
    territory: territoryOf(node),
    cell,
    parentId,
  };
  });

  for (const aggregate of scene.aggregates) {
    const first = aggregate.members.map((id) => byId.get(id)).find(Boolean);
    if (!first) continue;
    nodes.push({
      id: aggregate.id,
      r: Math.max(9, Math.min(18, 7 + Math.sqrt(aggregate.count) * 0.8)),
      anchor: aggregate.cluster,
      band: aggregate.kind === "source" ? "evidence" : "drift",
      order: first.order - 1,
      role: "aggregate",
      isAnchorNode: false,
      isCore: false,
      territory: aggregate.kind === "source" ? "evidence" : "external",
      cell: aggregate.hub ?? aggregate.id,
      parentId: aggregate.hub,
    });
  }

  const links: RubricVisualLink[] = [];
  for (const edge of scene.edges) {
    const sourceNode = byId.get(edge.from);
    const targetNode = byId.get(edge.to);
    if (!sourceNode || !targetNode) continue;
    links.push({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      kind: edge.cls,
      basis: edge.basis,
      sourceNode,
      targetNode,
      signal: edge,
    });
  }

  return { nodes, links, projectedCanonicalIds, aggregateIds };
}
