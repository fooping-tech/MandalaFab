/**
 * Step 3: symmetry detection.
 *   score(n) = diff(image, rotate(image, 360/n)) / diff(image, rotate(image, 180/n))
 * A true n-fold image is unchanged by a 360/n rotation but different after a half
 * step, so the ratio is small. Every divisor of n also scores well, so among the
 * candidates that pass the ratio test the largest n is chosen. Mirror symmetry is
 * found by reflecting across an axis through the center and scanning its angle.
 */
import { dilate, downscaleBinary } from "./preprocess";
import type { BinaryImage, Point } from "./types";

export const SYMMETRY_CANDIDATES = [4, 6, 8, 10, 12, 16, 24, 32] as const;

export interface SymmetryCandidate {
  n: number;
  /** Difference ratio (lower = more symmetric). */
  ratio: number;
  /** Raw mismatch fraction after rotating by 360/n. */
  diff: number;
}

export interface SymmetryResult {
  candidates: SymmetryCandidate[];
  best: number;
  /** Center refined jointly with the rotation test (image pixels). */
  center: Point;
  /** Angle (deg, 0 = up, clockwise) of the mirror axis of sector 0, or null if no mirror symmetry. */
  mirrorAxisDeg: number | null;
  mirrorScore: number;
}

/** Fraction of ink pixels that do not coincide after rotating by `rad` about c. */
export function rotationDiff(b: BinaryImage, c: Point, rad: number): number {
  const w = b.width;
  const h = b.height;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let mismatch = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = b.data[y * w + x]!;
      const dx = x + 0.5 - c.x;
      const dy = y + 0.5 - c.y;
      const rx = Math.floor(c.x + dx * cos - dy * sin);
      const ry = Math.floor(c.y + dx * sin + dy * cos);
      const rv = rx < 0 || ry < 0 || rx >= w || ry >= h ? 0 : b.data[ry * w + rx]!;
      if (v || rv) {
        total++;
        if (v !== rv) mismatch++;
      }
    }
  }
  return total === 0 ? 1 : mismatch / total;
}

/** Fraction of ink pixels that do not coincide after reflecting across the axis at angle `rad` (from +x) through c. */
export function reflectionDiff(b: BinaryImage, c: Point, rad: number): number {
  const w = b.width;
  const h = b.height;
  const cos2 = Math.cos(2 * rad);
  const sin2 = Math.sin(2 * rad);
  let mismatch = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = b.data[y * w + x]!;
      const dx = x + 0.5 - c.x;
      const dy = y + 0.5 - c.y;
      const rx = Math.floor(c.x + dx * cos2 + dy * sin2);
      const ry = Math.floor(c.y + dx * sin2 - dy * cos2);
      const rv = rx < 0 || ry < 0 || rx >= w || ry >= h ? 0 : b.data[ry * w + rx]!;
      if (v || rv) {
        total++;
        if (v !== rv) mismatch++;
      }
    }
  }
  return total === 0 ? 1 : mismatch / total;
}

/** Hill-climb the center so the image best matches its rotation by `rad` (small mismatch). */
function refineCenterForRotation(small: BinaryImage, start: Point, rad: number, maxStep: number): { point: Point; diff: number } {
  let best = { ...start };
  let bestDiff = rotationDiff(small, best, rad);
  let step = maxStep;
  while (step >= 0.5) {
    let improved = false;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
      const c = { x: best.x + dx, y: best.y + dy };
      const d = rotationDiff(small, c, rad);
      if (d < bestDiff - 1e-6) {
        bestDiff = d;
        best = c;
        improved = true;
      }
    }
    if (!improved) step /= 2;
  }
  return { point: best, diff: bestDiff };
}

const BINS = 720; // 0.5° per column

export interface PolarImage {
  /** Columns = angle (0 = up, clockwise), rows = radius in pixels. */
  width: number;
  height: number;
  /** Soft (blurred) ink 0..1 so thin strokes correlate even when a column apart. */
  data: Float32Array;
  /** Pixels per row (image px per radius step). */
  rStep: number;
}

/** Box blur of a polar image (wrapping in angle), radius in columns/rows. */
function blurPolar(src: Uint8Array, w: number, h: number, ra: number, rr: number): Float32Array {
  const tmp = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let a = 0; a < w; a++) {
      let sum = 0;
      for (let d = -ra; d <= ra; d++) sum += src[r * w + ((a + d + w) % w)]!;
      tmp[r * w + a] = sum / (2 * ra + 1);
    }
  }
  const out = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let a = 0; a < w; a++) {
      let sum = 0;
      let n = 0;
      for (let d = -rr; d <= rr; d++) {
        const rr2 = r + d;
        if (rr2 < 0 || rr2 >= h) continue;
        sum += tmp[rr2 * w + a]!;
        n++;
      }
      out[r * w + a] = n ? sum / n : 0;
    }
  }
  return out;
}

/** Polar unwrap of the binary image around c (rows = radius, columns = angle, 0 = up, clockwise). */
export function polarUnwrap(b: BinaryImage, c: Point, maxRows = 420): PolarImage {
  const rMax = Math.min(c.x, c.y, b.width - c.x, b.height - c.y) * 0.98;
  const rows = Math.max(16, Math.min(maxRows, Math.round(rMax)));
  const rStep = rMax / rows;
  const raw = new Uint8Array(BINS * rows);
  for (let r = 0; r < rows; r++) {
    const rad = (r + 0.5) * rStep;
    for (let a = 0; a < BINS; a++) {
      const ang = (a / BINS) * Math.PI * 2 - Math.PI / 2;
      // Sample a 3-pixel neighbourhood so thin strokes are not lost by nearest sampling.
      const x = c.x + Math.cos(ang) * rad;
      const y = c.y + Math.sin(ang) * rad;
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xi = Math.round(x + dx * 0.5);
        const yi = Math.round(y + dy * 0.5);
        if (xi >= 0 && yi >= 0 && xi < b.width && yi < b.height && b.data[yi * b.width + xi]) {
          v = 1;
          break;
        }
      }
      raw[r * BINS + a] = v;
    }
  }
  // Blur by ~2° in angle and ~2 rows in radius so thin line art is not aliased away.
  return { width: BINS, height: rows, data: blurPolar(raw, BINS, rows, 4, 2), rStep };
}

/** Pearson correlation between a row band of the polar image and the same band shifted by `lag` columns. */
function bandShiftCorr(p: PolarImage, r0: number, r1: number, lag: number): number {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let r = r0; r < r1; r++) {
    const row = r * p.width;
    for (let a = 0; a < p.width; a++) {
      const x = p.data[row + a]!;
      const y = p.data[row + ((a + lag) % p.width)]!;
      n++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
    }
  }
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2;
  const vy = syy / n - (sy / n) ** 2;
  return vx <= 1e-9 || vy <= 1e-9 ? 0 : cov / Math.sqrt(vx * vy);
}

/** Correlation of a row band with its reflection about column `axis`. */
function bandReflectCorr(p: PolarImage, r0: number, r1: number, axis: number): number {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let r = r0; r < r1; r++) {
    const row = r * p.width;
    for (let a = 0; a < p.width; a++) {
      const x = p.data[row + a]!;
      const j = (((Math.round(2 * axis) - a) % p.width) + p.width) % p.width;
      const y = p.data[row + j]!;
      n++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
    }
  }
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2;
  const vy = syy / n - (sy / n) ** 2;
  return vx <= 1e-9 || vy <= 1e-9 ? 0 : cov / Math.sqrt(vx * vy);
}

function inkWeight(p: PolarImage, r0: number, r1: number): number {
  let s2 = 0;
  for (let r = r0; r < r1; r++) for (let a = 0; a < p.width; a++) s2 += p.data[r * p.width + a]!;
  return s2;
}

function pickN(scored: { n: number; corr: number }[]): { n: number; corr: number } {
  const top = Math.max(...scored.map((s2) => s2.corr));
  const passing = scored.filter((s2) => s2.corr > 0.4 && s2.corr >= top - 0.1);
  return passing.length > 0 ? passing.reduce((a, s2) => (s2.n > a.n ? s2 : a)) : scored.reduce((a, s2) => (s2.corr > a.corr ? s2 : a));
}

export interface BandSymmetry {
  /** Radial range in image pixels. */
  rMin: number;
  rMax: number;
  n: number;
  corr: number;
  /** Ink weight of the band (0..1 of total). */
  weight: number;
  /** Mirror axis (deg, 0 = up, clockwise) of this band, or null. */
  mirrorAxisDeg: number | null;
}

/**
 * Per-band symmetry on the polar unwrap. Mandalas often mix repeat counts
 * (8 in the middle, 12 and 16 further out), so each radial band gets its own n
 * and rings are converted with the n of the band they sit in.
 */
export function detectSymmetryBands(b: BinaryImage, center: Point, candidates: readonly number[] = SYMMETRY_CANDIDATES, bands = 10): BandSymmetry[] {
  const polar = polarUnwrap(b, center);
  const total = inkWeight(polar, 0, polar.height) || 1;
  const out: BandSymmetry[] = [];
  const skip = Math.round(polar.height * 0.06); // the very center is not periodic
  for (let i = 0; i < bands; i++) {
    const r0 = skip + Math.round(((polar.height - skip) * i) / bands);
    const r1 = skip + Math.round(((polar.height - skip) * (i + 1)) / bands);
    const scored = candidates.map((n) => ({ n, corr: bandShiftCorr(polar, r0, r1, Math.round(BINS / n)) }));
    const best = pickN(scored);
    // Mirror axis within one sector.
    const sectorCols = BINS / best.n;
    let bestAxis = 0;
    let bestCorr = -Infinity;
    for (let k = 0; k < 24; k++) {
      const axis = (sectorCols * k) / 24;
      const cr = bandReflectCorr(polar, r0, r1, axis);
      if (cr > bestCorr) {
        bestCorr = cr;
        bestAxis = axis;
      }
    }
    out.push({ rMin: r0 * polar.rStep, rMax: r1 * polar.rStep, n: best.n, corr: best.corr, weight: inkWeight(polar, r0, r1) / total, mirrorAxisDeg: bestCorr > 0.45 ? (bestAxis / BINS) * 360 : null });
  }
  return out;
}

/** Best rotational self-correlation (over the candidates) of the polar unwrap around c. */
function bestCorrAt(b: BinaryImage, c: Point, candidates: readonly number[], rows: number): number {
  const polar = polarUnwrap(b, c, rows);
  const skip = Math.round(polar.height * 0.06);
  let best = -1;
  for (const n of candidates) best = Math.max(best, bandShiftCorr(polar, skip, polar.height, Math.round(BINS / n)));
  return best;
}

/**
 * Joint center search: the center that maximises the rotational self-correlation
 * for the best candidate. Coarse grid then hill climb (a few hundred cheap unwraps).
 */
export function refineCenterPolar(b: BinaryImage, start: Point, candidates: readonly number[] = SYMMETRY_CANDIDATES): { point: Point; corr: number } {
  const span = Math.max(4, Math.round(Math.min(b.width, b.height) * 0.03));
  let best = { ...start };
  let bestCorr = bestCorrAt(b, best, candidates, 120);
  for (let dy = -span; dy <= span; dy += Math.max(1, Math.round(span / 3))) {
    for (let dx = -span; dx <= span; dx += Math.max(1, Math.round(span / 3))) {
      const c = { x: start.x + dx, y: start.y + dy };
      const cr = bestCorrAt(b, c, candidates, 120);
      if (cr > bestCorr) {
        bestCorr = cr;
        best = c;
      }
    }
  }
  let step = Math.max(1, Math.round(span / 3));
  while (step >= 0.5) {
    let improved = false;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
      const c = { x: best.x + dx, y: best.y + dy };
      const cr = bestCorrAt(b, c, candidates, 200);
      if (cr > bestCorr + 1e-4) {
        bestCorr = cr;
        best = c;
        improved = true;
      }
    }
    if (!improved) step /= 2;
  }
  return { point: best, corr: bestCorr };
}

export function detectSymmetry(b: BinaryImage, center: Point, candidates: readonly number[] = SYMMETRY_CANDIDATES): SymmetryResult {
  const c = refineCenterPolar(b, center, candidates).point;
  const polar = polarUnwrap(b, c);
  const skip = Math.round(polar.height * 0.06);
  const scored: SymmetryCandidate[] = candidates.map((n) => {
    const corr = bandShiftCorr(polar, skip, polar.height, Math.round(BINS / n));
    const half = bandShiftCorr(polar, skip, polar.height, Math.round(BINS / (2 * n)));
    return { n, diff: 1 - corr, ratio: (1 - corr) / Math.max(0.05, 1 - half) };
  });
  const best = pickN(scored.map((s2) => ({ n: s2.n, corr: 1 - s2.diff }))).n;
  const sorted = scored.slice().sort((a, b2) => a.diff - b2.diff);
  const sectorCols = BINS / best;
  let bestAxis = 0;
  let bestCorr = -Infinity;
  for (let k = 0; k < 48; k++) {
    const axis = (sectorCols * k) / 48;
    const cr = bandReflectCorr(polar, skip, polar.height, axis);
    if (cr > bestCorr) {
      bestCorr = cr;
      bestAxis = axis;
    }
  }
  const mirror = bestCorr > 0.45;
  return { candidates: sorted, best, center: c, mirrorAxisDeg: mirror ? (bestAxis / BINS) * 360 : null, mirrorScore: Math.max(0, bestCorr) };
}
