/**
 * Freehand stroke conditioning: turn noisy pointer samples (pen jitter, uneven
 * spacing) into a smooth polyline before Bézier fitting. Pure functions in mm.
 */
import type { Vec2 } from "./types";

/** Polyline length. */
export function polylineLength(pts: readonly Vec2[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return l;
}

/** Resample at (roughly) uniform spacing along the polyline; endpoints are kept. */
export function resample(pts: readonly Vec2[], spacing: number): Vec2[] {
  if (pts.length < 2) return pts.slice();
  const total = polylineLength(pts);
  const n = Math.max(1, Math.round(total / Math.max(1e-6, spacing)));
  const step = total / n;
  const out: Vec2[] = [pts[0]!];
  let acc = 0;
  let target = step;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg < 1e-9) continue;
    while (acc + seg >= target - 1e-9 && out.length < n) {
      const t = (target - acc) / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      target += step;
    }
    acc += seg;
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/**
 * Gaussian smoothing with a window of `radius` samples each side. Open polylines
 * keep their endpoints; closed ones wrap around. `passes` repeats the filter.
 */
export function smooth(pts: readonly Vec2[], radius: number, closed = false, passes = 1): Vec2[] {
  if (pts.length < 3 || radius <= 0) return pts.slice();
  const w: number[] = [];
  const sigma = radius / 1.5;
  for (let k = -radius; k <= radius; k++) w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  let cur = pts.slice();
  const n = cur.length;
  for (let p = 0; p < passes; p++) {
    const next: Vec2[] = new Array(n);
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) {
        next[i] = cur[i]!;
        continue;
      }
      let sx = 0, sy = 0, sw = 0;
      for (let k = -radius; k <= radius; k++) {
        let j = i + k;
        if (closed) j = ((j % n) + n) % n;
        else if (j < 0 || j >= n) continue;
        const wk = w[k + radius]!;
        sx += cur[j]!.x * wk;
        sy += cur[j]!.y * wk;
        sw += wk;
      }
      next[i] = { x: sx / sw, y: sy / sw };
    }
    cur = next;
  }
  return cur;
}

/**
 * Condition a raw stroke: uniform resampling then Gaussian smoothing. `spacing`
 * and the smoothing window scale with the stroke so short strokes are not
 * flattened away. Returns [] for degenerate input.
 */
export function conditionStroke(raw: readonly Vec2[], closed: boolean, spacing = 0.5): Vec2[] {
  const pts = raw.filter((p, i) => i === 0 || Math.hypot(p.x - raw[i - 1]!.x, p.y - raw[i - 1]!.y) > 1e-6);
  if (pts.length < 2) return [];
  const total = polylineLength(pts);
  if (total < 1e-6) return [];
  const rs = resample(pts, Math.min(spacing, total / 8));
  if (closed && rs.length > 3 && Math.hypot(rs[0]!.x - rs[rs.length - 1]!.x, rs[0]!.y - rs[rs.length - 1]!.y) < spacing) rs.pop();
  const radius = Math.max(1, Math.min(4, Math.floor(rs.length / 10)));
  return smooth(rs, radius, closed, 2);
}
