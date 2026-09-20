/**
 * Step 6: semantic primitive recognition. A traced shape is compared against
 * MandalaFab primitives (circle/dot, teardrop, leaf, petal, paisley) built with
 * the shape's principal axis and extents; the intersection-over-union of the
 * candidate and the shape is the confidence. Below the acceptance level the
 * shape is kept as a faithful Bézier path.
 */
import { buildElementShape, resolveElementParams } from "../geometry/elements/builders";
import { intersection, regionArea, union, flattenRegions } from "../geometry/boolean";
import type { Contour, Region } from "../geometry/types";
import { area, centroid, ensureOrientation, simplifyContour } from "../geometry/vec";
import { newElement, type ElementType, type SectorElement } from "../model/project";

export interface ShapeFrame {
  /** Center of the axis-aligned box in the principal frame (world coords). */
  center: { x: number; y: number };
  /** Principal axis angle (radians, screen coords). */
  angle: number;
  length: number;
  width: number;
  circularity: number;
}

export interface Recognition {
  type: ElementType | "bezier";
  confidence: number;
  frame: ShapeFrame;
  /** Element-specific params for the recognised type. */
  params: Record<string, number>;
  /** Rotation to apply (deg) so the primitive's +x axis matches the shape. */
  rotationDeg: number;
}

export const RECOGNITION_ACCEPT = 0.88;

export function shapeFrame(c: Contour): ShapeFrame {
  const cen = centroid(c);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of c) {
    const dx = p.x - cen.x;
    const dy = p.y - cen.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of c) {
    const dx = p.x - cen.x;
    const dy = p.y - cen.y;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const mu = (minU + maxU) / 2;
  const mv = (minV + maxV) / 2;
  let per = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i]!;
    const q = c[(i + 1) % c.length]!;
    per += Math.hypot(q.x - p.x, q.y - p.y);
  }
  const a = area(c);
  return {
    center: { x: cen.x + mu * cos - mv * sin, y: cen.y + mu * sin + mv * cos },
    angle,
    length: maxU - minU,
    width: maxV - minV,
    circularity: per > 0 ? (4 * Math.PI * a) / (per * per) : 0,
  };
}

function iou(a: readonly Region[], b: readonly Region[]): number {
  const inter = regionArea(intersection(a, b));
  const uni = regionArea(flattenRegions(union([...a, ...b])));
  return uni <= 0 ? 0 : inter / uni;
}

function placed(el: SectorElement, frame: ShapeFrame, flip: boolean): Region[] {
  const shape = buildElementShape(el, { length: el.length, width: el.width, strokeWidth: 0, ringRadius: 50, tolerance: 0.05, params: resolveElementParams(el) });
  const ang = frame.angle + (flip ? Math.PI : 0);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return shape.closed.map((c) => ({ outer: c.map((p) => ({ x: frame.center.x + p.x * cos - p.y * sin, y: frame.center.y + p.x * sin + p.y * cos })), holes: [] }));
}

/** Try the primitive vocabulary against a world-space contour. */
export function recognizePrimitive(contour: Contour): Recognition {
  const c = ensureOrientation(simplifyContour(contour), true);
  const frame = shapeFrame(c);
  const target: Region[] = [{ outer: c, holes: [] }];
  const L = frame.length;
  const W = frame.width;
  const tries: { type: ElementType; params: Record<string, number>; flip: boolean; length?: number; width?: number }[] = [];
  if (frame.circularity > 0.8 && L / Math.max(1e-6, W) < 1.35) tries.push({ type: W < 3.5 ? "dot" : "circle", params: {}, flip: false });
  else tries.push({ type: "circle", params: {}, flip: false });
  for (const flip of [false, true]) {
    tries.push({ type: "teardrop", params: { tipSharpness: 0.8, curvature: 0 }, flip });
    tries.push({ type: "teardrop", params: { tipSharpness: 0.5, curvature: 0 }, flip });
    tries.push({ type: "leaf", params: { tipSharpness: 0.8, bend: 0 }, flip });
    tries.push({ type: "paisley", params: { belly: 0.5, curlRadius: 0, curlAmount: 0.5, tipSharpness: 0.75, innerInset: 0, innerCurl: 0, direction: 1 }, flip });
    tries.push({ type: "paisley", params: { belly: 0.5, curlRadius: 0, curlAmount: 0.5, tipSharpness: 0.75, innerInset: 0, innerCurl: 0, direction: -1 }, flip });
  }
  tries.push({ type: "petal", params: { bulge: 1, shoulder: 0.35 }, flip: false });
  let best: Recognition = { type: "bezier", confidence: 0, frame, params: {}, rotationDeg: (frame.angle * 180) / Math.PI };
  for (const t of tries) {
    const el = newElement(t.type, { length: t.type === "dot" ? W : L, width: W, params: t.params });
    let score = 0;
    try {
      score = iou(target, placed(el, frame, t.flip));
    } catch {
      score = 0;
    }
    if (score > best.confidence) {
      best = { type: t.type, confidence: score, frame, params: t.params, rotationDeg: ((frame.angle + (t.flip ? Math.PI : 0)) * 180) / Math.PI };
    }
  }
  if (best.confidence < RECOGNITION_ACCEPT) return { ...best, type: "bezier" };
  return best;
}
