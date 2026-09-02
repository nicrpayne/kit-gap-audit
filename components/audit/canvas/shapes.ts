// THE FOURTEEN GLYPHS, AS CANVAS PATHS.
//
// Signal's shape channel says WHAT KIND of thing this is and never varies
// with state — see NODE_SHAPE in ../graphTokens for what each one means and
// why it looks the way it does. This file is the same geometry expressed for
// a 2D context instead of for SVG elements.
//
// IT IS A TRANSCRIPTION, NOT A REDESIGN. Every constant here is the constant
// the SVG renderer uses, so a diamond is the same diamond in both painters
// and the A/B compares painting rather than drawing. Where the SVG emits a
// path string, the same path is built with the same numbers; where it emits a
// `<circle>`, this arcs.
//
// A shape is built into a Path2D and returned. The caller decides fill,
// stroke, width and dash — those carry STATE, and state is the other channel.

import type { NodeShape } from "../graphTokens";

export interface ShapeGeometry {
  path: Path2D;
  /** A second path drawn on top with its own, quieter treatment: the rule
      across a tablet, the lines on a page, the handle on a frame. Null where
      the glyph is a single stroke. */
  detail: Path2D | null;
  /** Detail opacity, where there is one. */
  detailAlpha: number;
  /** Whether `detail` should be filled rather than stroked. */
  detailFilled: boolean;
}

/**
 * One glyph, centred on (x, y) at drawn radius `r`.
 *
 * `r` is the GROWN radius — the caller has already applied the selection and
 * hover multipliers, exactly as the SVG does, so that a hovered chip grows in
 * both painters by the same 15%.
 */
export function nodeShapePath(shape: NodeShape, x: number, y: number, r: number): ShapeGeometry {
  const p = new Path2D();
  let detail: Path2D | null = null;
  let detailAlpha = 1;
  let detailFilled = false;

  switch (shape) {
    case "diamond": {
      p.moveTo(x, y - r);
      p.lineTo(x + r, y);
      p.lineTo(x, y + r);
      p.lineTo(x - r, y);
      p.closePath();
      break;
    }
    case "hex": {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) p.moveTo(px, py);
        else p.lineTo(px, py);
      }
      p.closePath();
      break;
    }
    case "chip": {
      roundRect(p, x - r, y - r * 0.78, r * 2, r * 1.56, r * 0.42);
      break;
    }
    case "pin": {
      // A finding points AT something — the one shape with a direction.
      p.moveTo(x, y + r * 1.25);
      p.lineTo(x - r, y - r * 0.55);
      p.arc(x, y - r * 0.55, r, Math.PI, 0, false);
      p.closePath();
      break;
    }
    case "figure": {
      // Head over a shoulder arc. Two strokes, no face.
      p.arc(x, y - r * 0.46, r * 0.42, 0, Math.PI * 2);
      detail = new Path2D();
      // The SVG's elliptical shoulder arc, as a scaled circular arc.
      detail.ellipse(x, y + r * 0.86, r * 0.78, r * 0.86, 0, Math.PI, 0, false);
      break;
    }
    case "tablet": {
      roundRect(p, x - r * 0.66, y - r, r * 1.32, r * 2, r * 0.16);
      detail = new Path2D();
      detail.moveTo(x - r * 0.34, y);
      detail.lineTo(x + r * 0.34, y);
      detailAlpha = 0.8;
      break;
    }
    case "speech": {
      // A rounded bubble with a tail: something someone SAID.
      const c = r * 0.3;
      p.moveTo(x - r * 0.9, y - r * 0.72);
      p.lineTo(x + r * 0.9, y - r * 0.72);
      p.quadraticCurveTo(x + r * 1.2, y - r * 0.72, x + r * 1.2, y - r * 0.42);
      p.lineTo(x + r * 1.2, y + r * 0.42);
      p.quadraticCurveTo(x + r * 1.2, y + r * 0.72, x + r * 0.9, y + r * 0.72);
      p.lineTo(x - r * 0.2, y + r * 0.72);
      p.lineTo(x - r * 0.7, y + r * 1.22);
      p.lineTo(x - r * 0.7, y + r * 0.72);
      p.lineTo(x - r * 0.9, y + r * 0.72);
      p.quadraticCurveTo(x - r * 1.2, y + r * 0.72, x - r * 1.2, y + r * 0.42);
      p.lineTo(x - r * 1.2, y - r * 0.42);
      p.quadraticCurveTo(x - r * 1.2, y - r * 0.72, x - r * 0.9, y - r * 0.72);
      p.closePath();
      void c;
      break;
    }
    case "page": {
      roundRect(p, x - r * 0.7, y - r, r * 1.4, r * 2, r * 0.12);
      detail = new Path2D();
      for (const dy of [-0.34, 0.06, 0.46]) {
        detail.moveTo(x - r * 0.38, y + r * dy);
        detail.lineTo(x + r * 0.38, y + r * dy);
      }
      detailAlpha = 0.65;
      break;
    }
    case "frame": {
      roundRect(p, x - r * 0.92, y - r * 0.78, r * 1.84, r * 1.56, r * 0.1);
      detail = new Path2D();
      detail.rect(x + r * 0.42, y + r * 0.28, r * 0.5, r * 0.5);
      detailAlpha = 0.55;
      detailFilled = true;
      break;
    }
    case "shard": {
      // An upward triangle whose stroke does not close — the same grammar the
      // external edges use. The caller applies the dash.
      p.moveTo(x, y - r * 1.15);
      p.lineTo(x + r, y + r * 0.72);
      p.lineTo(x - r, y + r * 0.72);
      p.closePath();
      break;
    }
    case "doc": {
      p.moveTo(x - r * 0.72, y - r);
      p.lineTo(x + r * 0.38, y - r);
      p.lineTo(x + r * 0.72, y - r * 0.66);
      p.lineTo(x + r * 0.72, y + r);
      p.lineTo(x - r * 0.72, y + r);
      p.closePath();
      break;
    }
    case "core":
    case "disc": {
      p.arc(x, y, r, 0, Math.PI * 2);
      break;
    }
    default: {
      // `dot` and anything new: a filled circle. The SVG's own default.
      p.arc(x, y, r, 0, Math.PI * 2);
      break;
    }
  }

  return { path: p, detail, detailAlpha, detailFilled };
}

/** Which glyphs are drawn as an outline over the void, and which are a solid
    mark. Matches the SVG exactly: only `dot` fills with its own colour. */
export function shapeIsOutline(shape: NodeShape): boolean {
  return shape !== "dot";
}

/** The tint a glyph's body carries, as a percentage of its own colour mixed
    into the void — 0 where the body is plain void. From the SVG's own
    `color-mix` calls. */
export function shapeBodyTint(shape: NodeShape, hollow: boolean): number {
  switch (shape) {
    case "pin":
      return 18;
    case "figure":
      return 16;
    case "tablet":
      return 12;
    case "shard":
      return hollow ? 0 : 34;
    default:
      return 0;
  }
}

function roundRect(p: Path2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  p.moveTo(x + rr, y);
  p.lineTo(x + w - rr, y);
  p.quadraticCurveTo(x + w, y, x + w, y + rr);
  p.lineTo(x + w, y + h - rr);
  p.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  p.lineTo(x + rr, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - rr);
  p.lineTo(x, y + rr);
  p.quadraticCurveTo(x, y, x + rr, y);
  p.closePath();
}

/**
 * THE ARROWHEAD, AND THE ONE PLACE A DOUBLE CHEVRON APPEARS.
 *
 * Supersession is the one relation whose whole content is a direction in
 * time, so it gets a mark that reads as one. Transcribed from the SVG's
 * `arrowHead`, including the back-off so the head sits clear of the node it
 * points at rather than inside it.
 */
export function arrowHeadPath(
  x: number,
  y: number,
  t: { x: number; y: number },
  k: number,
  r: number,
  double: boolean
): Path2D {
  const p = new Path2D();
  const back = r + 3 / k;
  const len = 6.5 / k;
  const spread = 0.62;
  const draw = (offset: number) => {
    const tipX = x - t.x * (back + offset);
    const tipY = y - t.y * (back + offset);
    const bx = -t.x;
    const by = -t.y;
    const c = Math.cos(spread);
    const sn = Math.sin(spread);
    p.moveTo(tipX + (bx * c - by * sn) * len, tipY + (bx * sn + by * c) * len);
    p.lineTo(tipX, tipY);
    p.lineTo(tipX + (bx * c + by * sn) * len, tipY + (-bx * sn + by * c) * len);
  };
  draw(0);
  if (double) draw(len * 0.72);
  return p;
}
