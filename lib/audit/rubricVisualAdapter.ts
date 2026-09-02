// SIGNAL → RUBRIC VISUAL ADAPTER.
//
// This is the only boundary where Signal concepts become inputs to the
// Rubric-derived viewport chassis. It is deliberately boring: canonical ids,
// resolved presentation policy, one Rubric visual role, one group anchor and
// one Signal radial band. No filesystem, ARMS, agent, app or document API
// crosses the boundary.

import type { ZoomLevel } from "@/components/audit/graphTokens";
import type { AuditScene, AuditVisualEdge, AuditVisualNode } from "./visualScene";
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
  /** Audit-local aggregate anchors; these never enter Graphology. */
  presentationNodes: AuditVisualNode[];
  /** A click on an aggregate anchor resolves to a real canonical member. */
  interactionTarget: Map<string, string>;
  projectedCanonicalIds: Set<string>;
  aggregateIds: Set<string>;
}

function isOpenLoop(node: AuditVisualNode): boolean {
  if (node.kind === "finding") return node.semanticSubtype !== "resolved";
  if (node.kind === "decision" || node.kind === "decisionGate" || node.kind === "dependency") {
    const state = (node.semanticSubtype ?? "").toLowerCase();
    return !["resolved", "accepted", "closed", "complete", "completed"].includes(state);
  }
  return false;
}

/** Signal meaning → Rubric's real structural roles. */
export function rubricRoleOf(node: AuditVisualNode): RubricVisualRole {
  if (node.kind === "reality") return "router";
  if (node.kind === "scope" || node.kind === "requirement") return "skill";
  if (isOpenLoop(node)) return "routine";
  if (node.kind === "lane") return "hub";
  return "memory";
}

function sourceSystemOf(node: AuditVisualNode): { key: string; label: string } | null {
  if (node.kind === "notion_page") return { key: "notion", label: "Notion" };
  if (node.kind === "figma_artifact") return { key: "figma", label: "Figma" };
  if (node.kind === "transcript") return { key: "meetings", label: "Meetings & transcripts" };
  if (node.kind === "work") return { key: "linear", label: "Linear" };
  if (node.kind === "intel" || node.cluster === "hermes") return { key: "hermes", label: "Hermes" };
  if (node.kind !== "source") return null;
  const t = `${node.semanticSubtype ?? ""} ${node.cluster ?? ""}`.toLowerCase();
  if (t.includes("notion")) return { key: "notion", label: "Notion" };
  if (t.includes("figma")) return { key: "figma", label: "Figma" };
  if (t.includes("transcript") || t.includes("meeting")) return { key: "meetings", label: "Meetings & transcripts" };
  if (t.includes("linear")) return { key: "linear", label: "Linear" };
  if (t.includes("hermes")) return { key: "hermes", label: "Hermes" };
  return { key: "documents", label: "Documents" };
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

  const systemMembers = new Map<string, { label: string; nodes: AuditVisualNode[] }>();
  for (const node of scene.nodes) {
    const system = sourceSystemOf(node);
    if (!system) continue;
    const entry = systemMembers.get(system.key) ?? { label: system.label, nodes: [] };
    entry.nodes.push(node);
    systemMembers.set(system.key, entry);
  }

  const nodes: FieldNodeInput[] = scene.nodes.map((node) => {
    projectedCanonicalIds.add(node.id);
    const aggregateParent = parentOf.get(node.id) ?? null;
    const laneParent = byId.has(`lane:${node.anchor}`) ? `lane:${node.anchor}` : null;
    const system = sourceSystemOf(node);
    const isArtifact = node.layoutRole === "artifact";
    const systemId = system ? `source-system:${system.key}` : null;
    const parentId = aggregateParent ?? (node.anchor === "core" || node.kind === "lane" ? null : laneParent);
    const cell = isArtifact ? node.id : parentId ?? node.anchor;
    return {
    id: node.id,
    r: node.identity === "latent" ? node.latentR : node.r,
    anchor: node.anchor,
    band: node.band,
    order: node.order,
    role: rubricRoleOf(node),
    isAnchorNode: node.kind === "lane",
    isCore: node.anchor === "core",
    territory: territoryOf(node),
    cell,
    parentId,
    sourceSystemId: systemId,
    presentationOnly: false,
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
      role: "memory",
      isAnchorNode: false,
      isCore: false,
      territory: aggregate.kind === "source" ? "evidence" : "external",
      cell: aggregate.hub ?? aggregate.id,
      parentId: aggregate.hub,
      sourceSystemId: null,
      presentationOnly: true,
    });
  }

  const presentationNodes: AuditVisualNode[] = [];
  const interactionTarget = new Map<string, string>();
  for (const [key, group] of [...systemMembers].sort(([a], [b]) => a.localeCompare(b))) {
    const representative = group.nodes.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0];
    const id = `source-system:${key}`;
    interactionTarget.set(id, representative.id);
    presentationNodes.push({
      ...representative,
      id,
      label: group.label,
      kind: "source",
      semanticSubtype: "source system",
      count: group.nodes.length,
      importance: 1200 + group.nodes.length,
      layoutRole: "rim",
      anchor: representative.anchor,
      band: "evidence",
      order: representative.order,
      r: Math.max(17, Math.min(24, 15 + Math.sqrt(group.nodes.length))),
      identity: "named",
      opacity: 1,
      depth: 0,
      rank: null,
      selected: false,
      hovered: false,
      matched: false,
      swept: false,
      labelled: true,
      labelInward: true,
      onScreen: true,
      reachable: true,
      opened: true,
      tabIndex: 0,
      accessibleName: `${group.label} source system, ${group.nodes.length} objects`,
    });
    nodes.push({
      id,
      r: Math.max(17, Math.min(24, 15 + Math.sqrt(group.nodes.length))),
      anchor: representative.anchor,
      band: "evidence",
      order: representative.order,
      role: "app",
      isAnchorNode: false,
      isCore: false,
      territory: "evidence",
      cell: id,
      parentId: null,
      sourceSystemId: id,
      presentationOnly: true,
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

  return { nodes, links, presentationNodes, interactionTarget, projectedCanonicalIds, aggregateIds };
}
