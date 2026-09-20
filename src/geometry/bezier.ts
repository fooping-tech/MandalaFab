/**
 * Cubic Bézier helpers. Bézier curves are first-class in MandalaFab: organic
 * motifs are defined by control points and flattened to polylines at TOLERANCE
 * only when geometry is needed. Exported SVG never contains strokes; open
 * curves are turned into closed bands by the stencil pipeline.
 */
import type { Contour, Vec2 } from "./types";
import { flattenCubic } from "./vec";

export interface CubicSegment {
  start: Vec2;
  cp1: Vec2;
  cp2: Vec2;
  end: Vec2;
}

/** Point list convention: start, then (cp1, cp2, end) per segment. */
export function segmentsFromPoints(points: readonly Vec2[]): CubicSegment[] {
  const out: CubicSegment[] = [];
  for (let i = 0; i + 3 < points.length; i += 3) out.push({ start: points[i]!, cp1: points[i + 1]!, cp2: points[i + 2]!, end: points[i + 3]! });
  return out;
}

export function pointsFromSegments(segments: readonly CubicSegment[]): Vec2[] {
  if (segments.length === 0) return [];
  const out: Vec2[] = [segments[0]!.start];
  for (const s of segments) out.push(s.cp1, s.cp2, s.end);
  return out;
}

/** Flatten a chain of cubic segments into a polyline (first point included). */
export function flattenSegments(segments: readonly CubicSegment[], tolerance: number): Vec2[] {
  if (segments.length === 0) return [];
  const out: Vec2[] = [segments[0]!.start];
  for (const s of segments) flattenCubic(s.start, s.cp1, s.cp2, s.end, tolerance, out);
  return out;
}

/** Flatten a point-list path. For closed paths the last point joins the first with a straight edge. */
export function flattenPath(points: readonly Vec2[], closed: boolean, tolerance: number): Vec2[] {
  const pts = flattenSegments(segmentsFromPoints(points), tolerance);
  if (closed && pts.length > 1) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) pts.pop();
  }
  return pts;
}

/**
 * Closed contour from a half outline (y >= 0) given as cubic segments running from
 * the base (-x) to the tip (+x) or vice versa, mirrored across the x axis.
 */
export function closedFromHalf(segments: readonly CubicSegment[], tolerance: number): Contour {
  const upper = flattenSegments(segments, tolerance);
  const lower = upper
    .slice(1, -1)
    .reverse()
    .map((p) => ({ x: p.x, y: -p.y }));
  return [...upper, ...lower];
}

/** Scale y so the contour's half-width equals `halfWidth` (keeps x). */
export function normalizeWidth(c: Contour, halfWidth: number): Contour {
  let maxY = 0;
  for (const p of c) maxY = Math.max(maxY, Math.abs(p.y));
  if (maxY < 1e-9) return c;
  const k = halfWidth / maxY;
  return c.map((p) => ({ x: p.x, y: p.y * k }));
}

/** Bend a shape sideways: y += amount * ((x - x0) / span)^power. */
export function bendContour(c: readonly Vec2[], amount: number, x0: number, span: number, power = 2): Vec2[] {
  if (Math.abs(amount) < 1e-9 || span <= 0) return [...c];
  return c.map((p) => ({ x: p.x, y: p.y + amount * Math.pow(Math.max(0, (p.x - x0) / span), power) }));
}

/** Cubic with a perpendicular bulge at the middle (used by connectors). */
export function bulgeSegment(from: Vec2, to: Vec2, bulge: number): CubicSegment {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const k = bulge * (4 / 3);
  return {
    start: from,
    cp1: { x: from.x + dx / 3 + nx * k, y: from.y + dy / 3 + ny * k },
    cp2: { x: from.x + (2 * dx) / 3 + nx * k, y: from.y + (2 * dy) / 3 + ny * k },
    end: to,
  };
}
