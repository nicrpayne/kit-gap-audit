// SIGNAL → RUBRIC VISUAL ADAPTER.
//
// This is the only boundary where Signal concepts become inputs to the
// Rubric-derived viewport chassis. It is deliberately boring: canonical ids,
// resolved presentation policy, one Rubric visual role, one group anchor and
// one Signal radial band. No filesystem, ARMS, agent, app or document API
// crosses the boundary.

import type { AuditScene, AuditVisualEdge, AuditVisualNode, LayoutRole } from "./visualScene";
import type { FieldNodeInput, RubricVisualRole } from "./spatial/field";

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
}

/** Rubric's painter/layout vocabulary, with its product-specific names gone. */
export function rubricRoleOf(role: LayoutRole): RubricVisualRole {
  if (role === "cell") return "aggregate";
  return role;
}

export function adaptSignalSceneToRubric(scene: AuditScene): RubricVisualWorld {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const nodes = scene.nodes.map((node) => ({
    id: node.id,
    r: node.identity === "latent" ? node.latentR : node.r,
    anchor: node.anchor,
    band: node.band,
    order: node.order,
    role: rubricRoleOf(node.layoutRole),
    isAnchorNode: node.kind === "lane",
    isCore: node.anchor === "core",
  }));

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

  return { nodes, links };
}
