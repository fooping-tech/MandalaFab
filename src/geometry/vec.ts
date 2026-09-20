import type { Bounds, Contour, Vec2 } from "./types";
import { EPS } from "./types";

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const same = (a: Vec2, b: Vec2, eps = EPS): boolean => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const fromAngle = (rad: number, r = 1): Vec2 => ({ x: Math.cos(rad) * r, y: Math.sin(rad) * r });
export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;

/** Rotate a point around the origin by `rad` radians (counter-clockwise in a y-up frame). */
export function rotate(p: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Signed area using the shoelace formula (positive = counter-clockwise in a y-up frame). */
export function signedArea(c: Contour): number {
  let a = 0;
  for (let i = 0, n = c.length; i < n; i++) {
    const p = c[i]!;
    const q = c[(i + 1) % n]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const area = (c: Contour): number => Math.abs(signedArea(c));

export function centroid(c: Contour): Vec2 {
  const n = c.length;
  if (n === 0) return { x: 0, y: 0 };
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const p = c[i]!;
    const q = c[(i + 1) % n]!;
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < EPS) {
    // Degenerate polygon: fall back to the vertex average.
    let sx = 0;
    let sy = 0;
    for (const p of c) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function bounds(contours: readonly Contour[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of contours) {
    for (const p of c) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export const boundsSize = (b: Bounds): Vec2 => ({ x: b.maxX - b.minX, y: b.maxY - b.minY });
export const boundsCenter = (b: Bounds): Vec2 => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });

/** Even-odd point-in-polygon test. Points exactly on an edge are treated as inside-ish (half-open rule). */
export function containsPoint(c: Contour, p: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const a = c[i]!;
    const b = c[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from point p to segment ab. */
export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, scale(ab, t)));
}

/** Distance from p to the boundary of contour c. */
export function pointContourDistance(p: Vec2, c: Contour): number {
  let best = Infinity;
  for (let i = 0, n = c.length; i < n; i++) {
    const d = pointSegmentDistance(p, c[i]!, c[(i + 1) % n]!);
    if (d < best) best = d;
  }
  return best;
}

/** Perimeter length of a closed contour. */
export function perimeter(c: Contour): number {
  let l = 0;
  for (let i = 0, n = c.length; i < n; i++) l += dist(c[i]!, c[(i + 1) % n]!);
  return l;
}

/**
 * Intersection parameter of ray (origin o, direction d) with segment ab.
 * Returns t >= 0 along the ray, or null if no hit.
 */
export function raySegment(o: Vec2, d: Vec2, a: Vec2, b: Vec2): number | null {
  const e = sub(b, a);
  const denom = cross(d, e);
  if (Math.abs(denom) < 1e-12) return null;
  const ao = sub(a, o);
  const t = cross(ao, e) / denom;
  const u = cross(ao, d) / denom;
  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}

/** Segment-segment proper intersection test (excluding shared endpoints). */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < -EPS && d3 * d4 < -EPS;
}

/** Remove consecutive duplicate points and collinear points (within tolerance). */
export function simplifyContour(c: Contour, tolerance = 1e-4): Contour {
  if (c.length < 3) return c;
  const out: Vec2[] = [];
  for (const p of c) {
    const last = out[out.length - 1];
    if (last && same(last, p, tolerance)) continue;
    out.push(p);
  }
  if (out.length > 1 && same(out[0]!, out[out.length - 1]!, tolerance)) out.pop();
  if (out.length < 3) return out;
  const result: Vec2[] = [];
  for (let i = 0; i < out.length; i++) {
    const prev = out[(i + out.length - 1) % out.length]!;
    const cur = out[i]!;
    const next = out[(i + 1) % out.length]!;
    if (pointSegmentDistance(cur, prev, next) <= tolerance && dist(prev, next) > tolerance) continue;
    result.push(cur);
  }
  return result.length >= 3 ? result : out;
}

/** Number of segments needed so a circular arc of radius r has chord error <= tolerance. */
export function arcSegments(radius: number, sweepRad: number, tolerance: number): number {
  if (radius <= tolerance) return Math.max(1, Math.ceil(Math.abs(sweepRad) / (Math.PI / 4)));
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius)));
  return Math.max(1, Math.ceil(Math.abs(sweepRad) / step));
}

/** Points along a circular arc (inclusive of both ends). */
export function arcPoints(center: Vec2, radius: number, startRad: number, sweepRad: number, tolerance: number): Vec2[] {
  const n = arcSegments(radius, sweepRad, tolerance);
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = startRad + (sweepRad * i) / n;
    pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return pts;
}

/** Flatten a cubic Bézier by recursive subdivision until the chord error is within tolerance. */
export function flattenCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: number, out: Vec2[], depth = 0): void {
  const flat = Math.max(pointSegmentDistance(p1, p0, p3), pointSegmentDistance(p2, p0, p3)) <= tolerance;
  if (flat || depth >= 16) {
    out.push(p3);
    return;
  }
  const p01 = lerp(p0, p1, 0.5);
  const p12 = lerp(p1, p2, 0.5);
  const p23 = lerp(p2, p3, 0.5);
  const p012 = lerp(p01, p12, 0.5);
  const p123 = lerp(p12, p23, 0.5);
  const mid = lerp(p012, p123, 0.5);
  flattenCubic(p0, p01, p012, mid, tolerance, out, depth + 1);
  flattenCubic(mid, p123, p23, p3, tolerance, out, depth + 1);
}

/** Ensure counter-clockwise orientation in a y-down frame == positive signed area here. */
export function ensureOrientation(c: Contour, positive: boolean): Contour {
  const a = signedArea(c);
  if ((a > 0) === positive) return c;
  return [...c].reverse();
}

export function translateContour(c: Contour, d: Vec2): Contour {
  return c.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
}
