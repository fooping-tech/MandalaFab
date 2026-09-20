/**
 * Step 5b: polyline simplification (Douglas–Peucker), corner splitting and cubic
 * Bézier fitting (Schneider, "An Algorithm for Automatically Fitting Digitized
 * Curves", Graphics Gems). Output uses MandalaFab's point-list convention:
 * start, then (cp1, cp2, end) per segment.
 */
import type { Point } from "./types";

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const len = (a: Point): number => Math.hypot(a.x, a.y);
const norm = (a: Point): Point => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};

function segDist(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return len(sub(p, a));
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return len(sub(p, add(a, mul(ab, t))));
}

/** Douglas–Peucker on an open polyline. */
export function simplifyPolyline(points: readonly Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(points[i]!, points[s]!, points[e]!);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx > 0 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Douglas–Peucker on a closed polygon: split at the two farthest points, simplify both halves. */
export function simplifyPolygon(points: readonly Point[], epsilon: number): Point[] {
  if (points.length <= 4) return [...points];
  let far = 0;
  let maxD = -1;
  for (let i = 1; i < points.length; i++) {
    const d = len(sub(points[i]!, points[0]!));
    if (d > maxD) {
      maxD = d;
      far = i;
    }
  }
  const a = simplifyPolyline(points.slice(0, far + 1), epsilon);
  const b = simplifyPolyline([...points.slice(far), points[0]!], epsilon);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Indices where the turning angle exceeds `minAngleRad` (corners). */
export function findCorners(points: readonly Point[], closed: boolean, minAngleRad: number): number[] {
  const n = points.length;
  const out: number[] = [];
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const p = points[(i - 1 + n) % n]!;
    const c = points[i]!;
    const q = points[(i + 1) % n]!;
    const a = norm(sub(c, p));
    const b = norm(sub(q, c));
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
    if (ang > minAngleRad) out.push(i);
  }
  return out;
}

type Cubic = [Point, Point, Point, Point];

function bezierPoint(c: Cubic, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const cc = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * c[0].x + b * c[1].x + cc * c[2].x + d * c[3].x, y: a * c[0].y + b * c[1].y + cc * c[2].y + d * c[3].y };
}

function chordLengthParameterize(pts: readonly Point[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1]! + len(sub(pts[i]!, pts[i - 1]!)));
  const total = u[u.length - 1]! || 1;
  return u.map((v) => v / total);
}

function generateBezier(pts: readonly Point[], u: readonly number[], t1: Point, t2: Point): Cubic {
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i]!;
    const mt = 1 - t;
    const b0 = mt * mt * mt;
    const b1 = 3 * mt * mt * t;
    const b2 = 3 * mt * t * t;
    const b3 = t * t * t;
    const a1 = mul(t1, b1);
    const a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(pts[i]!, add(add(mul(first, b0 + b1), mul(last, b2 + b3)), { x: 0, y: 0 }));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alphaL = 0;
  let alphaR = 0;
  if (Math.abs(det) > 1e-12) {
    alphaL = (x0 * c11 - x1 * c01) / det;
    alphaR = (c00 * x1 - c01 * x0) / det;
  }
  const segLen = len(sub(last, first));
  const eps = 1e-6 * segLen;
  if (alphaL < eps || alphaR < eps) {
    alphaL = alphaR = segLen / 3;
  }
  return [first, add(first, mul(t1, alphaL)), add(last, mul(t2, alphaR)), last];
}

function maxError(pts: readonly Point[], c: Cubic, u: readonly number[]): { err: number; index: number } {
  let err = 0;
  let index = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len(sub(bezierPoint(c, u[i]!), pts[i]!));
    if (d > err) {
      err = d;
      index = i;
    }
  }
  return { err, index };
}

function reparameterize(pts: readonly Point[], u: readonly number[], c: Cubic): number[] {
  return u.map((t, i) => {
    const p = pts[i]!;
    const q = bezierPoint(c, t);
    const d1 = { x: 3 * (1 - t) * (1 - t) * (c[1].x - c[0].x) + 6 * (1 - t) * t * (c[2].x - c[1].x) + 3 * t * t * (c[3].x - c[2].x), y: 3 * (1 - t) * (1 - t) * (c[1].y - c[0].y) + 6 * (1 - t) * t * (c[2].y - c[1].y) + 3 * t * t * (c[3].y - c[2].y) };
    const d2 = { x: 6 * (1 - t) * (c[2].x - 2 * c[1].x + c[0].x) + 6 * t * (c[3].x - 2 * c[2].x + c[1].x), y: 6 * (1 - t) * (c[2].y - 2 * c[1].y + c[0].y) + 6 * t * (c[3].y - 2 * c[2].y + c[1].y) };
    const diff = sub(q, p);
    const num = dot(diff, d1);
    const den = dot(d1, d1) + dot(diff, d2);
    if (Math.abs(den) < 1e-12) return t;
    return Math.max(0, Math.min(1, t - num / den));
  });
}

function fitCubicRec(pts: readonly Point[], t1: Point, t2: Point, error: number, out: Cubic[], depth: number): void {
  if (pts.length === 2) {
    const d = len(sub(pts[1]!, pts[0]!)) / 3;
    out.push([pts[0]!, add(pts[0]!, mul(t1, d)), add(pts[1]!, mul(t2, d)), pts[1]!]);
    return;
  }
  let u = chordLengthParameterize(pts);
  let c = generateBezier(pts, u, t1, t2);
  let { err, index } = maxError(pts, c, u);
  if (err < error) {
    out.push(c);
    return;
  }
  if (err < error * 4) {
    for (let i = 0; i < 6; i++) {
      u = reparameterize(pts, u, c);
      c = generateBezier(pts, u, t1, t2);
      const m = maxError(pts, c, u);
      err = m.err;
      index = m.index;
      if (err < error) {
        out.push(c);
        return;
      }
    }
  }
  if (depth > 40 || pts.length < 4) {
    // Could not fit: keep the polyline faithfully as straight cubics.
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      out.push([a, add(a, mul(sub(b, a), 1 / 3)), add(a, mul(sub(b, a), 2 / 3)), b]);
    }
    return;
  }
  const tCenter = norm(sub(pts[index - 1]!, pts[index + 1]!));
  fitCubicRec(pts.slice(0, index + 1), t1, tCenter, error, out, depth + 1);
  fitCubicRec(pts.slice(index), mul(tCenter, -1), t2, error, out, depth + 1);
}

/** Fit cubics to an open polyline. */
export function fitCurve(points: readonly Point[], error: number): Cubic[] {
  const pts = points.filter((p, i) => i === 0 || len(sub(p, points[i - 1]!)) > 1e-9);
  if (pts.length < 2) return [];
  const t1 = norm(sub(pts[1]!, pts[0]!));
  const t2 = norm(sub(pts[pts.length - 2]!, pts[pts.length - 1]!));
  const out: Cubic[] = [];
  fitCubicRec(pts, t1, t2, error, out, 0);
  return out;
}

/** Flatten cubic segments into the point-list convention (start, cp1, cp2, end, ...). */
export function cubicsToPoints(cubics: readonly Cubic[]): Point[] {
  if (cubics.length === 0) return [];
  const out: Point[] = [cubics[0]![0]];
  for (const c of cubics) out.push(c[1], c[2], c[3]);
  return out;
}

/**
 * Fit a closed polygon: split at corners (sharp tips), fit each run, and join.
 * Returns the point list of a closed Bézier path whose last point equals the first.
 */
export function fitClosedPolygon(points: readonly Point[], error: number, cornerAngleDeg = 60): Point[] {
  const n = points.length;
  if (n < 3) return [];
  const corners = findCorners(points, true, (cornerAngleDeg * Math.PI) / 180);
  const start = corners.length > 0 ? corners[0]! : 0;
  const ordered = [...points.slice(start), ...points.slice(0, start)];
  const cornerSet = new Set(corners.map((i) => (i - start + n) % n));
  const runs: Point[][] = [];
  let cur: Point[] = [ordered[0]!];
  for (let i = 1; i <= n; i++) {
    const p = ordered[i % n]!;
    cur.push(p);
    if (cornerSet.has(i % n) || i === n) {
      runs.push(cur);
      cur = [p];
    }
  }
  const all: Cubic[] = [];
  const MAX_RUN = 160;
  for (const run of runs) {
    if (run.length < 2) continue;
    // Very long runs (a whole line-art network) are fitted in chunks so the recursion stays shallow.
    for (let i = 0; i < run.length - 1; i += MAX_RUN - 1) {
      const chunk = run.slice(i, Math.min(run.length, i + MAX_RUN));
      if (chunk.length >= 2) all.push(...fitCurve(chunk, error));
    }
  }
  return cubicsToPoints(all);
}
