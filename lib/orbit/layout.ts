// WHERE THINGS SIT. PRESENTATION ONLY.
//
// Kept out of lib/orbit/graph.ts on purpose: an angle is a drawing decision,
// and persisting one would turn a picture into a fact. Nothing here is
// stored, nothing here is read back, and the graph is complete without it.
//
// The one rule this obeys is that position must MEAN something, or the
// radial form is decoration. So:
//
//   RADIUS is causal distance from the consequence. Ring 1 is the release
//   itself — what ships, and what it waits on. Ring 2 is what controls
//   whether the release moves — decisions and people.
//
//   ANGLE is sector, not rank. Each kind owns an arc, so "the decisions" is
//   a place on the dial rather than something to hunt for. Within an arc the
//   order is the graph's own id order, which is stable, so a node does not
//   jump to a new seat because an unrelated one appeared.

import type { OrbitGraph, OrbitNodeKind } from "./graph";

export interface OrbitPlacement {
  x: number;
  y: number;
  /** Drawn radius of the object itself, not its orbit. */
  r: number;
  ring: 0 | 1 | 2;
}

/** Arcs in degrees, SVG convention (0 = east, positive = clockwise/down). */
const SECTOR: Record<Exclude<OrbitNodeKind, "forecast">, [number, number]> = {
  capability: [-160, -20], // the top: what ships
  dependency: [160, 200], //  the left: what we are behind
  gate: [30, 150], //         the bottom: what is holding the release
  capacity: [-15, 15], //     the right: who is doing it
};

const RING: Record<OrbitNodeKind, 0 | 1 | 2> = {
  forecast: 0,
  capability: 1,
  dependency: 1,
  gate: 2,
  capacity: 2,
};

export function layoutOrbit(graph: OrbitGraph, size: number): Map<string, OrbitPlacement> {
  const cx = size / 2;
  const cy = size / 2;
  const r1 = size * 0.29;
  const r2 = size * 0.43;
  const out = new Map<string, OrbitPlacement>();

  const byKind = new Map<OrbitNodeKind, string[]>();
  for (const n of graph.nodes) {
    if (n.kind === "forecast") {
      out.set(n.id, { x: cx, y: cy, r: size * 0.085, ring: 0 });
      continue;
    }
    const list = byKind.get(n.kind) ?? [];
    list.push(n.id);
    byKind.set(n.kind, list);
  }

  for (const [kind, ids] of byKind) {
    const [from, to] = SECTOR[kind as Exclude<OrbitNodeKind, "forecast">];
    const radius = RING[kind] === 1 ? r1 : r2;
    ids.forEach((id, i) => {
      // A single object sits in the middle of its arc rather than at one
      // end, so one decision does not read as "the first of several".
      const t = ids.length === 1 ? 0.5 : i / (ids.length - 1);
      const deg = from + (to - from) * t;
      const rad = (deg * Math.PI) / 180;
      out.set(id, {
        x: cx + Math.cos(rad) * radius,
        y: cy + Math.sin(rad) * radius,
        r: kind === "capability" ? size * 0.042 : size * 0.034,
        ring: RING[kind],
      });
    });
  }

  return out;
}
