/**
 * Step 4: sector extraction. Contours are assigned to sectors by the angle of
 * their centroid; the representative sector 0 (centred on the mirror axis when
 * one exists) is kept, and with mirror symmetry only its y >= 0 half.
 */
import type { Contour, Vec2 } from "../geometry/types";
import { centroid } from "../geometry/vec";

export interface SectorAssignment {
  /** Angle of the centroid in degrees (0 = up, clockwise). */
  angleDeg: number;
  /** Angle relative to the sector axis, in (-half, half]. */
  relDeg: number;
  sector: number;
  radius: number;
}

export function assignSector(c: Contour, symmetry: number, phaseDeg: number): SectorAssignment {
  const cen = centroid(c);
  const angleDeg = ((Math.atan2(cen.y, cen.x) * 180) / Math.PI + 90 + 720) % 360;
  const sectorAngle = 360 / symmetry;
  const rel0 = ((angleDeg - phaseDeg) % 360 + 360) % 360;
  const sector = Math.floor((rel0 + sectorAngle / 2) / sectorAngle) % symmetry;
  let relDeg = rel0 - sector * sectorAngle;
  if (relDeg > sectorAngle / 2) relDeg -= 360;
  return { angleDeg, relDeg, sector, radius: Math.hypot(cen.x, cen.y) };
}

/** Rotate a contour about the origin by `deg` degrees (screen coordinates). */
export function rotateContour(c: Contour, deg: number): Vec2[] {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return c.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
}

export interface SectorPick {
  contour: Contour;
  assignment: SectorAssignment;
}

export interface SectorPickResult {
  /** Representatives of shapes that repeat around the center (rotated into sector 0). */
  picks: SectorPick[];
  /** Indices (into the input) of shapes that did not repeat well; keep them at their world position. */
  unmatched: number[];
}

/**
 * Pick the contours that represent one sector. Every contour is rotated into
 * sector 0 by its own sector index; the copies of one shape then coincide and a
 * single representative (median area) is kept. Groups with fewer than
 * `minCopies` members are not symmetric enough to be normalised and are
 * reported as unmatched so the caller keeps them faithfully in world space.
 * With mirror symmetry only the relDeg >= -tolerance half is kept.
 */
export function pickSectorContours(contours: readonly Contour[], symmetry: number, phaseDeg: number, mirror: boolean, toleranceDeg = 1, minCopies = Math.max(2, Math.ceil(symmetry / 3))): SectorPickResult {
  const sectorAngle = 360 / symmetry;
  const rotated = contours.map((c, index) => {
    const a = assignSector(c, symmetry, phaseDeg);
    const contour = rotateContour(c, -a.sector * sectorAngle);
    return { index, contour, assignment: { ...a, sector: 0, angleDeg: (((a.angleDeg - a.sector * sectorAngle) % 360) + 360) % 360 }, area: Math.abs(areaOf(contour)), centroid: centroid(contour) };
  });
  const groups: (typeof rotated)[] = [];
  for (const r of rotated) {
    const g = groups.find((grp) => {
      const ref = grp[0]!;
      const d = Math.hypot(ref.centroid.x - r.centroid.x, ref.centroid.y - r.centroid.y);
      const tol = Math.max(2.5, Math.sqrt(ref.area) * 0.2);
      return d < tol && r.area > ref.area * 0.5 && r.area < ref.area * 2;
    });
    if (g) g.push(r);
    else groups.push([r]);
  }
  const picks: SectorPick[] = [];
  const unmatched: number[] = [];
  for (const g of groups) {
    if (g.length < Math.min(minCopies, symmetry)) {
      for (const r of g) unmatched.push(r.index);
      continue;
    }
    const sorted = g.slice().sort((a, b) => a.area - b.area);
    const rep = sorted[Math.floor(sorted.length / 2)]!;
    if (mirror && rep.assignment.relDeg < -toleranceDeg) continue;
    picks.push({ contour: rep.contour, assignment: rep.assignment });
  }
  return { picks, unmatched };
}

function areaOf(c: Contour): number {
  let a = 0;
  for (let i = 0, n = c.length; i < n; i++) {
    const p = c[i]!;
    const q = c[(i + 1) % n]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
