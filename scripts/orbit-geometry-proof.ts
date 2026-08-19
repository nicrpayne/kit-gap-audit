// ORBIT'S GEOMETRY, PROVEN.
//
// Position is a claim. If radius and angle do not mean what the field says
// they mean, the radial form is decoration and every reading taken off it
// is wrong. These are the claims, checked without a browser:
//
//   the arc is OPEN, because time does not wrap
//   angle inside the halo is time, monotonically
//   thickness is the trials' own density, not a smoothed idea of it
//   a flow ends at the outcome, never at a date
//   size means load and only load
//   the same truth lays out the same way, every time
//
//   npx tsx scripts/orbit-geometry-proof.ts
import {
  FRAME,
  VIEWBOX,
  RING,
  ARC,
  SECTOR,
  SECTOR_MID,
  polar,
  dayToAngle,
  seats,
  across,
  haloShape,
  flowPath,
  flowAtRadius,
  capabilityRadius,
  FLOW_END,
} from "../lib/orbit/geometry";
import { quantileSample, BINS } from "../lib/forecast/shape";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

/** A believable right-skewed outcome: 400 trials, most of them early. */
const trials = Array.from({ length: 400 }, (_, i) => 20 + Math.round(28 * Math.pow(i / 399, 2.1)));
const q = quantileSample(trials);

// ── A. THE ARC IS OPEN ─────────────────────────────────────────────────
{
  check("A1. The day axis is an arc, not a ring", ARC.sweepDeg < 360, `${ARC.sweepDeg}° of 360`);
  check("A2. …with a real mouth left empty at the bottom", 360 - ARC.sweepDeg >= 90, `${360 - ARC.sweepDeg}° open`);
  const start = polar(RING.halo, ARC.startDeg);
  const end = polar(RING.halo, ARC.startDeg + ARC.sweepDeg);
  check("A3. …whose two ends are far apart, so the last trial is not beside the first",
    Math.hypot(start.x - end.x, start.y - end.y) > RING.halo,
    `${Math.hypot(start.x - end.x, start.y - end.y).toFixed(0)} units apart`);
  check("A4. …and time runs left to right across the top",
    polar(RING.halo, ARC.startDeg).x < FRAME.cx && polar(RING.halo, ARC.startDeg + ARC.sweepDeg).x > FRAME.cx);
}

// ── B. ANGLE INSIDE THE HALO IS TIME ───────────────────────────────────
{
  const a = [0, 10, 20, 30, 40].map((d) => dayToAngle(d, 0, 40));
  check("B1. Later is always further along the arc", a.every((v, i) => i === 0 || v > a[i - 1]), a.map((v) => v.toFixed(0)).join(" < "));
  check("B2. The first day is the arc's start and the last is its end",
    Math.abs(a[0] - ARC.startDeg) < 1e-9 && Math.abs(a[4] - (ARC.startDeg + ARC.sweepDeg)) < 1e-9);
  check("B3. A day outside the window is pinned, never wrapped past the mouth",
    dayToAngle(-50, 0, 40) === ARC.startDeg && dayToAngle(900, 0, 40) === ARC.startDeg + ARC.sweepDeg);
  // Equal spans of time are equal spans of arc. A non-linear day axis would
  // make the eye read a distribution that isn't there.
  const step = (d: number) => dayToAngle(d + 1, 0, 40) - dayToAngle(d, 0, 40);
  check("B4. …and the scale is linear, so distance on the arc is days",
    Math.abs(step(1) - step(30)) < 1e-9, `${step(1).toFixed(4)}°/day`);
}

// ── C. THICKNESS IS THE TRIALS' OWN DENSITY ────────────────────────────
{
  const h = haloShape(q, 15, 55, RING.haloMax, 0)!;
  check("C1. There is a body", !!h && h.half.length === BINS);
  check("C2. It never exceeds the amplitude it was given", Math.max(...h.half) <= RING.haloMax + 1e-9,
    `peak half-thickness ${Math.max(...h.half).toFixed(1)} of ${RING.haloMax}`);
  check("C3. It starts and ends where the trials do, not at the frame",
    h.a0 > ARC.startDeg && h.a1 < ARC.startDeg + ARC.sweepDeg,
    `${h.a0.toFixed(0)}° → ${h.a1.toFixed(0)}°`);
  // A skewed outcome must LOOK skewed: the thick part sits where the trials
  // are, not in the middle of the frame.
  const peakIdx = h.half.indexOf(Math.max(...h.half));
  check("C4. A right-skewed outcome is thickest early, as it should be", peakIdx < BINS / 2, `peak bin ${peakIdx} of ${BINS}`);

  // Shells are isosurfaces of the SAME density — never wider than the body.
  const shell = haloShape(q, 15, 55, RING.haloMax, 0.58)!;
  check("C5. An inner shell is contained by the body it came from",
    shell.half.every((v, i) => v <= h.half[i] + 1e-9));
  check("C6. …and a bimodal outcome keeps both of its modes", (() => {
    const bimodal = quantileSample([...Array.from({ length: 200 }, () => 20), ...Array.from({ length: 200 }, () => 44)]);
    const bh = haloShape(bimodal, 15, 50, RING.haloMax, 0)!;
    let peaks = 0;
    for (let i = 2; i < BINS - 2; i++) {
      if (bh.half[i] > 0.4 * RING.haloMax && bh.half[i] >= bh.half[i - 1] && bh.half[i] > bh.half[i + 1]) peaks += 1;
    }
    return peaks >= 2;
  })());
}

// ── D. A FLOW ENDS AT THE OUTCOME, NEVER AT A DATE ─────────────────────
{
  check("D1. Flows stop at the forecast's own inner edge", FLOW_END === RING.halo - RING.haloMax, `${FLOW_END}`);
  // Every flow converges on the sector's midline, so none of them can be
  // read as pointing at a day on the arc.
  for (const a of [SECTOR.startDeg, SECTOR_MID, SECTOR.endDeg]) {
    const d = flowPath(RING.cap, a);
    const endXY = d.slice(d.lastIndexOf(",") + 1).trim().split(/\s+/).map(Number);
    const mid = polar(FLOW_END, SECTOR_MID);
    check(`D2. …at the trunk, from ${a}°`, Math.hypot(endXY[0] - mid.x, endXY[1] - mid.y) < 0.02);
  }
  const cross = flowAtRadius(RING.cap, SECTOR.startDeg + 20, RING.gate);
  check("D3. A clamp acts ON the line, at the radius it sits at",
    Math.abs(Math.hypot(cross.x - FRAME.cx, cross.y - FRAME.cy) - RING.gate) < 3,
    `${Math.hypot(cross.x - FRAME.cx, cross.y - FRAME.cy).toFixed(1)} vs ${RING.gate}`);
}

// ── E. SIZE MEANS LOAD, AND ONLY LOAD ──────────────────────────────────
{
  const r1 = capabilityRadius(10, 40);
  const r2 = capabilityRadius(40, 40);
  const base = capabilityRadius(0, 40);
  check("E1. More load is a bigger object", r2 > r1 && r1 > base, `${base.toFixed(1)} < ${r1.toFixed(1)} < ${r2.toFixed(1)}`);
  // AREA is what a reader compares, so area is what must be proportional.
  const areaOf = (r: number) => Math.PI * (r - 15) ** 2;
  check("E2. …and it is AREA that scales, because that is what an eye reads",
    Math.abs(areaOf(r1) / areaOf(r2) - 10 / 40) < 1e-6);
  check("E3. With no load to speak of, every object is the same size",
    capabilityRadius(0, 0) === capabilityRadius(99, 0));
}

// ── F. THE SAME TRUTH LAYS OUT THE SAME WAY ────────────────────────────
{
  check("F1. Seating is deterministic", JSON.stringify(seats(5)) === JSON.stringify(seats(5)));
  check("F2. One object sits on the midline, not at an end", seats(1)[0] === SECTOR_MID);
  check("F3. Seats stay inside the work sector", seats(9).every((a) => a >= SECTOR.startDeg && a <= SECTOR.endDeg),
    `${seats(9)[0].toFixed(0)}° → ${seats(9)[8].toFixed(0)}°`);
  check("F4. A small project does not sprawl across the whole sector",
    seats(2)[1] - seats(2)[0] < (SECTOR.endDeg - SECTOR.startDeg) / 2,
    `${(seats(2)[1] - seats(2)[0]).toFixed(0)}° apart`);
  check("F5. …and a busy one fills it", seats(9)[8] - seats(9)[0] > (SECTOR.endDeg - SECTOR.startDeg) * 0.7);
  check("F6. Sector-wide marks are a different thing, and span the sector",
    across(5)[0] === SECTOR.startDeg && across(5)[4] === SECTOR.endDeg);
  const twice = haloShape(q, 15, 55, RING.haloMax, 0)!;
  check("F7. The same trials draw the same body, byte for byte",
    twice.path === haloShape(q, 15, 55, RING.haloMax, 0)!.path);
}

// ── G. THE FRAME HOLDS EVERYTHING THAT MEANS SOMETHING ─────────────────
{
  const top = FRAME.cy - RING.rail;
  const capLabel = FRAME.cy - (RING.cap + 30 + 17);
  check("G1. The outermost ring is inside the frame", top >= VIEWBOX.y, `rail top at ${top}, frame at ${VIEWBOX.y}`);
  check("G2. …and so are the labels outside the work", capLabel >= VIEWBOX.y);
  check("G3. The mouth is cropped, not padded out into dead space",
    VIEWBOX.y + VIEWBOX.h < FRAME.cy + RING.halo + 120, `bottom ${VIEWBOX.y + VIEWBOX.h}`);
  check("G4. Rings are ordered outward by causal distance",
    RING.core < RING.halo && RING.halo + RING.haloMax < RING.gate && RING.gate < RING.cap && RING.cap < RING.rail);
}

console.log(failures === 0 ? "\nALL ORBIT GEOMETRY PROOFS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
