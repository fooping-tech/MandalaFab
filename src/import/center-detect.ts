/**
 * Step 2: center detection. Start from the ink centroid (image moments) and the
 * bounding-box center, then refine by maximising the 180° rotational
 * self-similarity, which every even-fold mandala has.
 */
import { dilate, downscaleBinary } from "./preprocess";
import { traceContours } from "./contours";
import type { BinaryImage, Point } from "./types";

export interface CenterCandidate {
  point: Point;
  method: "moments" | "bbox" | "symmetry" | "circles";
  /** 0..1, higher is better. */
  score: number;
}

export function inkCentroid(b: BinaryImage): Point {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.data[y * b.width + x]) {
    sx += x;
    sy += y;
    n++;
  }
  return n === 0 ? { x: b.width / 2, y: b.height / 2 } : { x: sx / n + 0.5, y: sy / n + 0.5 };
}

export function inkBounds(b: BinaryImage): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = b.width;
  let minY = b.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.data[y * b.width + x]) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return { minX: 0, minY: 0, maxX: b.width - 1, maxY: b.height - 1 };
  return { minX, minY, maxX, maxY };
}

/** Similarity (0..1) between the image and its 180° rotation about c. */
export function pointSymmetryScore(b: BinaryImage, c: Point): number {
  let same = 0;
  let total = 0;
  const w = b.width;
  const h = b.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = b.data[y * w + x]!;
      const rx = Math.round(2 * c.x - x - 1);
      const ry = Math.round(2 * c.y - y - 1);
      const rv = rx < 0 || ry < 0 || rx >= w || ry >= h ? 0 : b.data[ry * w + rx]!;
      if (v || rv) {
        total++;
        if (v === rv) same++;
      }
    }
  }
  return total === 0 ? 0 : same / total;
}

/** Coarse-to-fine search of the point-symmetry center around `start`. */
export function refineCenter(b: BinaryImage, start: Point, radiusFrac = 0.08): { point: Point; score: number } {
  const { image: small0, scale } = downscaleBinary(b, 256, "max");
  const small = dilate(small0, 1);
  let best = { x: start.x * scale, y: start.y * scale };
  let bestScore = pointSymmetryScore(small, best);
  let step = Math.max(1, Math.round(Math.max(small.width, small.height) * radiusFrac) / 2);
  while (step >= 0.5) {
    let improved = false;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [-step, -step], [step, -step], [-step, step]] as const) {
      const c = { x: best.x + dx, y: best.y + dy };
      const s = pointSymmetryScore(small, c);
      if (s > bestScore + 1e-6) {
        bestScore = s;
        best = c;
        improved = true;
      }
    }
    if (!improved) step /= 2;
  }
  return { point: { x: best.x / scale, y: best.y / scale }, score: bestScore };
}

/**
 * Centroid of large, round closed contours (a mandala's concentric circles).
 * Traced on a downscaled copy; returns null when no such contour exists.
 */
export function circleCenter(b: BinaryImage): Point | null {
  const { image: small, scale } = downscaleBinary(b, 512, "max");
  const contours = traceContours(small);
  const minArea = small.width * small.height * 0.03;
  const picks: { c: Point; a: number }[] = [];
  for (const c of contours) {
    if (c.area < minArea) continue;
    let per = 0;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < c.points.length; i++) {
      const p = c.points[i]!;
      const q = c.points[(i + 1) % c.points.length]!;
      per += Math.hypot(q.x - p.x, q.y - p.y);
      sx += p.x;
      sy += p.y;
    }
    const circ = (4 * Math.PI * c.area) / (per * per);
    if (circ > 0.8) picks.push({ c: { x: sx / c.points.length, y: sy / c.points.length }, a: c.area });
  }
  if (picks.length === 0) return null;
  const total = picks.reduce((n, p) => n + p.a, 0);
  return { x: picks.reduce((n, p) => n + (p.c.x * p.a) / total, 0) / scale, y: picks.reduce((n, p) => n + (p.c.y * p.a) / total, 0) / scale };
}

export function detectCenter(b: BinaryImage): CenterCandidate[] {
  const moments = inkCentroid(b);
  const bb = inkBounds(b);
  const bbox = { x: (bb.minX + bb.maxX + 1) / 2, y: (bb.minY + bb.maxY + 1) / 2 };
  const circles = circleCenter(b);
  const start = circles ?? { x: (moments.x + bbox.x) / 2, y: (moments.y + bbox.y) / 2 };
  const refined = refineCenter(b, start, circles ? 0.02 : 0.08);
  const { image: small0, scale } = downscaleBinary(b, 256, "max");
  const small = dilate(small0, 1);
  const score = (p: Point): number => pointSymmetryScore(small, { x: p.x * scale, y: p.y * scale });
  const out: CenterCandidate[] = [
    { point: refined.point, method: "symmetry", score: refined.score },
    { point: moments, method: "moments", score: score(moments) },
    { point: bbox, method: "bbox", score: score(bbox) },
  ];
  if (circles) out.push({ point: circles, method: "circles", score: score(circles) + 0.02 });
  return out.sort((a, b2) => b2.score - a.score);
}
