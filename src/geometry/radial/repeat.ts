import type { Contour, Polyline } from "../types";
import type { MotifShape } from "../motifs/registry";
import { applyTransform, transformContour, type Transform } from "./transform";

export interface RadialRepeatOptions {
  count: number;
  radius: number;
  /** Angular phase offset in degrees. */
  phaseDeg: number;
  /** Extra rotation of each copy (degrees). */
  rotationDeg: number;
  /** "radial": copies are rotated to point away from the center; "fixed": copies keep their orientation. */
  rotationMode: "radial" | "fixed";
  /** "inward" flips the motif so its outer tip points to the center. */
  direction: "outward" | "inward";
  /** Alternate copies are moved outward by this radial distance (mm). */
  stagger: number;
}

export interface RadialInstance {
  index: number;
  /** Placement angle in degrees (0 = top, clockwise). */
  angleDeg: number;
  transform: Transform;
  closed: Contour[];
  open: Polyline[];
}

/** Angle in degrees of copy i (0 = top, clockwise on screen). */
export function instanceAngle(i: number, count: number, phaseDeg: number): number {
  return phaseDeg + (360 * i) / Math.max(1, count);
}

/** Build the rigid transform that places copy i of a motif on the ring. */
export function instanceTransform(i: number, o: RadialRepeatOptions): Transform {
  const angleDeg = instanceAngle(i, o.count, o.phaseDeg);
  const a = ((angleDeg - 90) * Math.PI) / 180; // screen angle: 0 = top
  const r = o.radius + (o.stagger !== 0 && i % 2 === 1 ? o.stagger : 0);
  const base = o.rotationMode === "radial" ? a : 0;
  const flip = o.direction === "inward" ? Math.PI : 0;
  const rotation = base + flip + (o.rotationDeg * Math.PI) / 180;
  return { tx: Math.cos(a) * r, ty: Math.sin(a) * r, rotation };
}

/** Replicate a motif shape `count` times around the origin. */
export function radialRepeat(shape: MotifShape, o: RadialRepeatOptions): RadialInstance[] {
  const out: RadialInstance[] = [];
  const count = Math.max(1, Math.floor(o.count));
  for (let i = 0; i < count; i++) {
    const t = instanceTransform(i, { ...o, count });
    out.push({
      index: i,
      angleDeg: instanceAngle(i, count, o.phaseDeg),
      transform: t,
      closed: shape.closed.map((c) => transformContour(c, t)),
      open: shape.open.map((c) => c.map((p) => applyTransform(p, t))),
    });
  }
  return out;
}
