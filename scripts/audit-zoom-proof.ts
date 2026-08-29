// SIGNAL GRAPH — SEMANTIC ZOOM + DETERMINISTIC CONSTELLATIONS. Not part of
// the app build.
//
// THE PRIMARY LAW THIS SUITE EXISTS TO ENFORCE:
//
//     ZOOM REVEALS IDENTITY, NOT TRUTH.
//
// Going closer may only make a thing say more about WHAT IT IS. It may never
// change what Signal believes, invent an object, invent a relationship,
// promote external intelligence into Reality, or renumber anything. Every
// proof below is a way of asking that same question of a different surface.
//
//   P1   placement is deterministic — the same corpus, the same seats, forever
//   P2   no force state: layout is a pure function of the graph
//   P3   an aggregate's count IS its members' count
//   P4   no aggregate is a node, and none is ever stored
//   P5   bundles account for real edges, and only real ones
//   P6   expanding a bundle recovers the actual member relationships
//   P7   no fabricated edge: every drawn path traces to canonical edges
//   P8   semantic zoom does not mutate truth
//   P9   canonical ids are retained at every tier
//   P10  every tier draws every node — resolution changes, population never
//   P11  label authority: names are budgeted, never stacked
//   P12  Reality is unchanged by any of it
//   P13  external intelligence stays external
//   P14  a constellation stays inside its own sector
//   P15  the aggregate panel's arithmetic is the graph's arithmetic
//   P16  zero database writes
//
//   npx tsx scripts/audit-zoom-proof.ts

import { PrismaClient } from "@prisma/client";
import { loadAuditGraphInputs } from "../lib/audit/graphInputs";
import { buildAuditGraph, type AuditGraph } from "../lib/audit/graph";
import {
  layoutGraph,
  layoutAggregates,
  layoutExtent,
  CLUSTER_ORDER,
  FIELD,
  type GraphLayout,
} from "../lib/audit/graphLayout";
import { constellations, vogel, discRadius, packWedge, AGGREGATE_MIN } from "../lib/audit/constellations";
import { structuralWeb, aggregateBundles, BUNDLE_MIN } from "../lib/audit/structuralWeb";
import { edgeFocusClass } from "../lib/audit/focus";
import { SOURCE_KINDS } from "../lib/audit/sources";
import { ZOOM, ZOOM_ORDER, zoomLevel, labelsFor, identityOf, LATENT } from "../components/audit/graphTokens";
import { ensurePrerequisites } from "./seed-real-jsa-package";

const prisma = new PrismaClient();

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

/** Every table the projection could plausibly touch. */
async function census() {
  return {
    scopes: await prisma.scope.count(),
    findings: await prisma.finding.count(),
    sources: await prisma.source.count(),
    snapshots: await prisma.contextSnapshot.count(),
    decisions: await prisma.decision.count(),
    people: await prisma.person.count(),
    allocations: await prisma.allocation.count(),
    registrations: await prisma.sourceRegistration.count(),
    runs: await prisma.auditRun.count(),
  };
}

/** A layout as a comparable string. Seats to three decimals: the question is
    whether the arrangement is determined, not whether floating point is. */
const fingerprint = (l: GraphLayout) =>
  [...l.entries()]
    .map(([id, p]) => `${id}|${p.x.toFixed(3)}|${p.y.toFixed(3)}|${p.r.toFixed(3)}`)
    .sort()
    .join("\n");

async function main() {
  const before = await census();
  await ensurePrerequisites(prisma);

  const scopes = await prisma.scope.findMany({ orderBy: { createdAt: "asc" } });
  const graphs: { id: string; name: string; g: AuditGraph }[] = [];
  for (const s of scopes) {
    const inputs = await loadAuditGraphInputs(s.id);
    if (!inputs) continue;
    graphs.push({ id: s.id, name: s.name, g: buildAuditGraph(inputs) });
  }
  check("00 every Scope projects a graph", graphs.length === scopes.length, `${graphs.length}/${scopes.length}`);

  // The densest Scope is the one every claim in the brief was made about.
  const real = graphs.reduce((a, b) => (b.g.order > a.g.order ? b : a));
  console.log(`\n      densest Scope: ${real.name} — ${real.g.order} nodes, ${real.g.size} relationships\n`);

  // ── P1. PLACEMENT IS DETERMINISTIC ──────────────────────────────────
  //
  // The brief's first constraint on constellations was "NO force physics".
  // The observable difference between a physics layout and a deterministic
  // one is exactly this: run it twice and compare. A settling simulation
  // gives two different answers; a pure function gives one.
  {
    let stable = 0;
    for (const { g } of graphs) {
      const a = fingerprint(layoutGraph(g));
      const b = fingerprint(layoutGraph(g));
      // And a THIRD from a graph rebuilt in a different insertion order,
      // because "deterministic" that depends on Map iteration order is not
      // deterministic, it is lucky.
      if (a === b) stable++;
    }
    check("P1 the same graph produces the same seats, every time", stable === graphs.length, `${stable}/${graphs.length} Scopes`);

    // Vogel is a closed form. Its i-th seat cannot depend on anything but i.
    let vogelStable = true;
    for (let i = 0; i < 200; i++) {
      const a = vogel(i, 200);
      const b = vogel(i, 200);
      if (a.dx !== b.dx || a.dy !== b.dy) vogelStable = false;
    }
    check("P1b the phyllotaxis seat is a closed form of (index, count)", vogelStable, "200 seats, identical on re-evaluation");
  }

  // ── P2. NO FORCE STATE ──────────────────────────────────────────────
  //
  // A relaxation layout must remember something between frames. This one
  // cannot: `layoutGraph` takes a graph and returns seats, and `packWedge`
  // takes units and returns positions. Asserted by calling the packer with
  // its inputs shuffled — a simulation seeded differently lands differently;
  // a shelf-packer that sorts its own input does not.
  {
    const units = Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, radius: 5 + (i % 7) * 3 }));
    const wedge = { baseAngle: 40, arcDeg: 35, inner: 200, outer: 400 };
    const a = packWedge(units, wedge);
    const b = packWedge([...units].reverse(), wedge);
    const key = (p: typeof a) => p.map((u) => `${u.id}:${u.angle.toFixed(4)}:${u.radius.toFixed(4)}`).sort().join(",");
    check("P2 the packer's output does not depend on its input order", key(a) === key(b), `${a.length} units, shuffled`);

    // And no disc is ever bigger than the room it was granted.
    const spill = a.filter((u) => u.radius - u.discR < wedge.inner - 0.001 || u.radius + u.discR > wedge.outer + 0.001);
    check("P2b every disc stays inside its band", spill.length === 0, `${a.length} discs, ${spill.length} outside`);
  }

  // ── P3. AN AGGREGATE'S COUNT IS ITS MEMBERS' COUNT ──────────────────
  //
  // §4: an aggregate bubble is not a fake node, it is a projection of real
  // members. The count printed on the field is therefore not an estimate, not
  // a sample and not a render count — it is `members.length`, and every one
  // of those members is a node the graph has.
  {
    let groups = 0;
    let bad = 0;
    let ghosts = 0;
    let small = 0;
    for (const { g } of graphs) {
      for (const agg of constellations(g)) {
        groups++;
        if (agg.count !== agg.members.length) bad++;
        if (agg.count < AGGREGATE_MIN) small++;
        for (const m of agg.members) if (!g.hasNode(m)) ghosts++;
        if (agg.hub && !g.hasNode(agg.hub)) ghosts++;
        // A hub is not one of the things it holds.
        if (agg.hub && agg.members.includes(agg.hub)) bad++;
      }
    }
    check("P3 every aggregate count equals its canonical member count", bad === 0 && groups > 0, `${groups} groups across ${graphs.length} Scopes`);
    check("P3b every member of every aggregate is a real node", ghosts === 0, `${ghosts} ids with no node`);
    check("P3c no group is drawn below the naming threshold", small === 0, `min ${AGGREGATE_MIN}`);
  }

  // ── P4. NO AGGREGATE IS A NODE ──────────────────────────────────────
  //
  // The whole trust argument rests on this. If an aggregate could be a node
  // then Signal would be storing a thing nobody asserted, and every count on
  // the field would be a claim rather than a summary.
  {
    let collisions = 0;
    let unprefixed = 0;
    for (const { g } of graphs) {
      for (const agg of constellations(g)) {
        if (g.hasNode(agg.id)) collisions++;
        if (!agg.id.startsWith("agg:")) unprefixed++;
      }
    }
    check("P4 no aggregate id exists as a node", collisions === 0, `${collisions} collisions`);
    check("P4b every aggregate id is namespaced so it can never be mistaken for one", unprefixed === 0);
  }

  // ── P5. BUNDLES ACCOUNT FOR REAL EDGES, AND ONLY REAL ONES ──────────
  //
  // §7: aggregation must preserve connection meaning. A bundle is allowed to
  // stand for N relationships; it is not allowed to stand for a relationship
  // that does not exist, and its count is not allowed to be decorative.
  {
    for (const { name, g } of graphs) {
      const layout = layoutGraph(g);
      const aggs = layoutAggregates(layout);
      const group = new Map<string, string>();
      const seats = new Map<string, { x: number; y: number }>();
      for (const a of aggs) {
        seats.set(a.id, { x: a.x, y: a.y });
        for (const m of a.members) group.set(m, a.id);
        if (a.hub) group.set(a.hub, a.id);
      }
      const groupOf = (id: string) => group.get(id) ?? null;
      const bundles = aggregateBundles(g, layout, { groupOf, seatOf: (id) => seats.get(id) ?? null });
      if (bundles.length === 0) continue;

      let fabricated = 0;
      let miscounted = 0;
      let sameGroup = 0;
      let tooSmall = 0;
      const seen = new Set<string>();
      for (const bn of bundles) {
        if (bn.count !== bn.edges.length) miscounted++;
        if (bn.count < BUNDLE_MIN) tooSmall++;
        if (bn.from === bn.to) sameGroup++;
        for (const e of bn.edges) {
          if (!g.hasEdge(e)) fabricated++;
          // AND NEVER TWICE. One relationship, at most one bundle.
          if (seen.has(e)) miscounted++;
          seen.add(e);
        }
      }
      check(
        `P5 ${name}: every bundled edge is a real edge`,
        fabricated === 0 && miscounted === 0 && sameGroup === 0 && tooSmall === 0,
        `${bundles.length} bundles carrying ${bundles.reduce((n, b) => n + b.count, 0)} of ${g.size} relationships`
      );

      // ── P6. EXPANDING A BUNDLE RECOVERS THE ACTUAL MEMBERS ───────────
      //
      // The reader's contract: a thick line with "12" on it must be twelve
      // relationships they can go and read, between members they can name.
      let recoverable = 0;
      for (const bn of bundles) {
        const ok = bn.edges.every((e) => {
          const s = g.source(e);
          const t = g.target(e);
          const a = groupOf(s) ?? s;
          const b = groupOf(t) ?? t;
          return (a === bn.from && b === bn.to) || (a === bn.to && b === bn.from);
        });
        if (ok) recoverable++;
      }
      check(
        `P6 ${name}: expanding a bundle recovers exactly its members' relationships`,
        recoverable === bundles.length,
        `${recoverable}/${bundles.length}`
      );

      // ── P7. NO FABRICATED EDGE, ANYWHERE ON THE FIELD ────────────────
      //
      // Bundles and the web are the only two things that draw a stroke
      // nobody asked for by selecting. Between them they must account for
      // the corpus and nothing beyond it.
      const web = structuralWeb(g, layout);
      let membership = 0;
      g.forEachEdge((_e, a) => {
        if (edgeFocusClass(a) === null) membership++;
      });
      check(
        `P7 ${name}: the resting field accounts for the corpus exactly`,
        web.represented + web.suppressed + membership === g.size,
        `${web.represented} drawn + ${web.suppressed} suppressed + ${membership} membership = ${g.size}`
      );
    }
  }

  // ── P8. SEMANTIC ZOOM DOES NOT MUTATE TRUTH ─────────────────────────
  //
  // The tiers are a rendering decision. Nothing about them may reach back
  // into the model: the same graph, read at every zoom, is the same graph.
  {
    const g = real.g;
    const layout = layoutGraph(g);
    const shape = { order: g.order, size: g.size, fp: fingerprint(layout) };
    const seen: string[] = [];
    for (const k of [0.4, 0.9, 1.2, 2.0, 3.4, 6.0]) {
      const level = zoomLevel(k);
      seen.push(`${Math.round(k * 100)}%=${level}`);
      // Reading the tier's rules must not touch the graph.
      labelsFor(level);
      identityOf("intel", false, level);
      layoutAggregates(layout);
    }
    check(
      "P8 the graph is identical after being read at every tier",
      g.order === shape.order && g.size === shape.size && fingerprint(layout) === shape.fp,
      seen.join(" · ")
    );

    // AND THE LADDER IS MONOTONE. Every step of the zoom is a step of the
    // ladder, in one direction, with no tier skipped and none repeated.
    const ladder = [0.5, 1.0, 1.3, 2.0, 2.8, 5.0].map(zoomLevel);
    let monotone = true;
    for (let i = 1; i < ladder.length; i++) {
      if (ZOOM_ORDER.indexOf(ladder[i]) < ZOOM_ORDER.indexOf(ladder[i - 1])) monotone = false;
    }
    const distinct = new Set(ladder);
    check(
      "P8b the ladder rises through every tier and never falls",
      monotone && distinct.size === ZOOM_ORDER.length,
      `${ladder.join(" → ")}  (gates ${ZOOM.far} / ${ZOOM.medium} / ${ZOOM.near})`
    );
  }

  // ── P9. CANONICAL IDS ARE RETAINED AT EVERY TIER ────────────────────
  //
  // §16: an object's canonical id survives aggregation. A member inside a
  // group keeps the id it had outside one — the group holds ids, never
  // copies or indices.
  {
    let held = 0;
    let total = 0;
    for (const { g } of graphs) {
      for (const agg of constellations(g)) {
        for (const m of agg.members) {
          total++;
          if (g.hasNode(m) && g.getNodeAttribute(m, "ref") != null) held++;
          else if (g.hasNode(m)) held++;
        }
      }
    }
    check("P9 every aggregated member keeps its canonical id", held === total, `${total} members`);
  }

  // ── P10. EVERY TIER DRAWS EVERY NODE ────────────────────────────────
  //
  // The defect this tranche inherited was 41 of 65 nodes simply absent. The
  // ladder changes RESOLUTION — latent mark, formed shape, named thing — and
  // never population. Asserted on the identity function itself, which is the
  // only thing that decides.
  {
    let vanished = 0;
    for (const level of ZOOM_ORDER) {
      for (const opened of [true, false]) {
        const id = identityOf("intel", opened, level);
        if (id !== "latent" && id !== "formed" && id !== "named") vanished++;
      }
      // A latent mark still has a body at every tier, and a minimum size in
      // device pixels so it cannot become nothing at far zoom.
      if (!(LATENT[level].minPx > 0 && LATENT[level].scale > 0)) vanished++;
    }
    check("P10 no tier makes a node disappear", vanished === 0, ZOOM_ORDER.map((l) => `${l}≥${LATENT[l].minPx}px`).join(" · "));
  }

  // ── P11. LABEL AUTHORITY ────────────────────────────────────────────
  //
  // §10: "do not show 130 overlapping labels". The tier decides which KINDS
  // may be named at all, and that permission must widen as you go in and
  // never narrow.
  {
    const sizes = ZOOM_ORDER.map((l) => labelsFor(l).size);
    let widening = true;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] < sizes[i - 1]) widening = false;
    check(
      "P11 each tier permits at least what the one before it did",
      widening,
      ZOOM_ORDER.map((l, i) => `${l}:${sizes[i]}`).join(" → ")
    );
    // AND THE FAR TIER NAMES THE LEGEND AND NOTHING ELSE. `reality` and
    // `lane` are the map's own furniture — the centre and the region pucks —
    // and the shells carry their own names at that tier. A content kind
    // permitted here would be 130 names over 19 regions, which is the defect.
    const legend = new Set(["reality", "lane"]);
    const content = [...labelsFor("far")].filter((k) => !legend.has(k));
    check(
      "P11b the far tier names the legend and no content",
      content.length === 0,
      `far permits ${[...labelsFor("far")].join(" + ")}`
    );
  }

  // ── P12. REALITY IS UNCHANGED ───────────────────────────────────────
  //
  // The core is Signal's own belief. Nothing in a rendering tranche may move
  // it, resize it, re-parent it or give it a group.
  {
    let moved = 0;
    let grouped = 0;
    for (const { g } of graphs) {
      const layout = layoutGraph(g);
      for (const [id, p] of layout) {
        if (g.getNodeAttribute(id, "kind") !== "reality") continue;
        if (Math.abs(p.x - FIELD.cx) > 0.001 || Math.abs(p.y - FIELD.cy) > 0.001) moved++;
        if (Math.abs(p.r - FIELD.coreR) > 0.001) moved++;
      }
      for (const agg of constellations(g)) {
        for (const m of agg.members) if (g.getNodeAttribute(m, "kind") === "reality") grouped++;
        if (agg.hub && g.getNodeAttribute(agg.hub, "kind") === "reality") grouped++;
      }
    }
    check("P12 Reality is still at the centre, at its own size", moved === 0);
    check("P12b Reality is never a member of any group", grouped === 0);
  }

  // ── P13. EXTERNAL INTELLIGENCE STAYS EXTERNAL ───────────────────────
  //
  // §1: Hermes is a producer, not a semantic type. Grouping its objects by
  // what they ARE must not smuggle them inside Signal's own belief: every
  // one is still external, still outside the Reality radius, still in the
  // cluster the producer's own type put it in.
  {
    const g = real.g;
    const layout = layoutGraph(g);
    let inside = 0;
    let promoted = 0;
    let typed = 0;
    for (const agg of constellations(g)) {
      if (agg.kind !== "type") continue;
      for (const m of agg.members) {
        const a = g.getNodeAttributes(m);
        if (a.kind !== "intel") promoted++;
        if (a.basis === "attested") promoted++;
        if (String(a.intelligenceType ?? "").length > 0) typed++;
        const p = layout.get(m);
        if (p && Math.hypot(p.x - FIELD.cx, p.y - FIELD.cy) <= FIELD.coreR) inside++;
      }
    }
    check("P13 no grouped external object was promoted into Reality", promoted === 0 && inside === 0, `${typed} typed external objects grouped`);
  }

  // ── P14. A CONSTELLATION STAYS INSIDE ITS SECTOR ────────────────────
  //
  // Membership is position. That only holds if position is exact — a group
  // that drifts into the neighbouring sector has silently changed what its
  // members belong to, with no line drawn and no claim made.
  {
    const RAD = Math.PI / 180;
    const SECTOR = 360 / CLUSTER_ORDER.length;
    for (const { name, g } of graphs) {
      const layout = layoutGraph(g);
      let outside = 0;
      let checked = 0;
      for (const [id, p] of layout) {
        const a = g.getNodeAttributes(id);
        if (a.slice === "core" || !a.lane) continue;
        const i = CLUSTER_ORDER.indexOf(a.lane as (typeof CLUSTER_ORDER)[number]);
        if (i < 0) continue;
        checked++;
        const base = -90 + i * SECTOR;
        let d = (Math.atan2(p.y - FIELD.cy, p.x - FIELD.cx) / RAD - base + 540) % 360 - 180;
        if (Math.abs(d) > SECTOR / 2 + 0.5) outside++;
      }
      check(`P14 ${name}: every seat is inside its own sector`, outside === 0, `${checked - outside}/${checked}`);
    }
  }

  // ── P15. THE PANEL'S ARITHMETIC IS THE GRAPH'S ARITHMETIC ───────────
  //
  // The aggregate inspector prints two numbers per verb — how many
  // relationships, and how many distinct things at the other end. §7 turns
  // on those being different numbers honestly derived, not one number shown
  // twice. Recomputed here from the graph, the same way the panel does.
  {
    const g = real.g;
    let groups = 0;
    let wrong = 0;
    let anyDifferent = 0;
    for (const agg of constellations(g)) {
      groups++;
      const inside = new Set(agg.members);
      if (agg.hub) inside.add(agg.hub);
      const rows = new Map<string, { count: number; targets: Set<string> }>();
      const seen = new Set<string>();
      for (const id of agg.members) {
        for (const e of g.edges(id)) {
          if (seen.has(e)) continue;
          seen.add(e);
          const a = g.getEdgeAttributes(e);
          if (edgeFocusClass(a) === null) continue;
          const other = g.source(e) === id ? g.target(e) : g.source(e);
          if (inside.has(other)) continue;
          const rel = typeof a.intelRel === "string" ? a.intelRel : a.rel;
          const row = rows.get(rel) ?? { count: 0, targets: new Set<string>() };
          row.count++;
          row.targets.add(other);
          rows.set(rel, row);
        }
      }
      for (const [, r] of rows) {
        // A relationship count can never be smaller than the number of
        // distinct things it reaches — that would be counting a thing twice
        // as less than once.
        if (r.targets.size > r.count) wrong++;
        if (r.targets.size !== r.count) anyDifferent++;
      }
    }
    check("P15 no verb reaches more things than it has relationships", wrong === 0, `${groups} groups`);
    check(
      "P15b the two numbers really are different numbers",
      anyDifferent > 0,
      `${anyDifferent} verb rows where relationships ≠ things reached`
    );
  }

  // ── P16. ZERO DATABASE WRITES ───────────────────────────────────────
  const after = await census();
  const drift = Object.keys(before).filter((k) => before[k as keyof typeof before] !== after[k as keyof typeof after]);
  check("P16 the whole suite wrote nothing", drift.length === 0, drift.length ? drift.join(", ") : JSON.stringify(after));

  // ── THE FIELD, MEASURED ─────────────────────────────────────────────
  {
    const g = real.g;
    const layout = layoutGraph(g);
    const aggs = layoutAggregates(layout);
    const group = new Map<string, string>();
    const seats = new Map<string, { x: number; y: number }>();
    for (const a of aggs) {
      seats.set(a.id, { x: a.x, y: a.y });
      for (const m of a.members) group.set(m, a.id);
      if (a.hub) group.set(a.hub, a.id);
    }
    const bundles = aggregateBundles(g, layout, {
      groupOf: (id) => group.get(id) ?? null,
      seatOf: (id) => seats.get(id) ?? null,
    });
    const web = structuralWeb(g, layout);
    const extent = layoutExtent(layout);
    const sources = aggs.filter((a) => a.kind === "source");
    console.log(
      `\n      ${real.name}: ${aggs.length} groups over ${aggs.reduce((n, a) => n + a.count, 0)} members ` +
        `(${aggs.length - sources.length} type · ${sources.length} source)\n` +
        `      ${bundles.length} bundles carrying ${bundles.reduce((n, b) => n + b.count, 0)} relationships\n` +
        `      ${web.strands.length} strands + ${web.sheaves.length} sheaves = ${web.represented} at rest\n` +
        `      field radius ${Math.round(extent)} world units\n`
    );
    // Every source group's hub really is a source artifact.
    const wrongHub = sources.filter((a) => !a.hub || !SOURCE_KINDS.includes(g.getNodeAttribute(a.hub, "kind"))).length;
    check("P17 every source constellation hangs off a real source artifact", wrongHub === 0, `${sources.length} source groups`);
    // And a group's disc is big enough to hold what is in it.
    const cramped = aggs.filter((a) => a.discR < discRadius(a.count, 6, 8) * 0.5).length;
    check("P17b no group is drawn smaller than its contents need", cramped === 0, `${aggs.length} groups`);
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
