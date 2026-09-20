/**
 * validateStencil: manufacturability checks on the final stencil geometry.
 * Reports issues with contours to highlight. Never claims the part is "safe";
 * it only reports what the checks found.
 */
import type { Constraints } from "../model/project";
import { cleanRegions, difference, flattenRegions, offset, regionArea } from "../geometry/boolean";
import type { MandalaGeometry } from "../geometry/radial/mandala";
import { sheetRegion } from "../geometry/stencil/sheet";
import type { StencilGeometry } from "../geometry/stencil/pipeline";
import { contourExtent } from "../geometry/stencil/islands";
import type { Contour, RegionNode } from "../geometry/types";
import { area, bounds, centroid, containsPoint, perimeter, segmentsIntersect } from "../geometry/vec";

export type Severity = "error" | "warning" | "info";

export type IssueCode =
  | "island"
  | "bridge-too-narrow"
  | "thin-material"
  | "thin-feature"
  | "small-hole"
  | "self-intersection"
  | "duplicate-path"
  | "sheet-overflow"
  | "empty";

export interface ValidationIssue {
  id: string;
  code: IssueCode;
  severity: Severity;
  message: string;
  /** Contours to highlight on the canvas (design coordinates). */
  contours: Contour[];
  ringIds?: string[];
}

export interface ValidationStats {
  regions: number;
  islands: number;
  bridges: number;
  cutLength: number;
  apertureArea: number;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  stats: ValidationStats;
}

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

/** True when a contour has at least one pair of properly crossing edges. O(n²) with a bbox prefilter. */
export function hasSelfIntersection(c: Contour): boolean {
  const n = c.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = c[i]!;
    const b = c[(i + 1) % n]!;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through wrap-around
      const p = c[j]!;
      const q = c[(j + 1) % n]!;
      if (Math.max(p.x, q.x) < minX || Math.min(p.x, q.x) > maxX || Math.max(p.y, q.y) < minY || Math.min(p.y, q.y) > maxY) continue;
      if (segmentsIntersect(a, b, p, q)) return true;
    }
  }
  return false;
}

/** Key describing a contour's placement, for duplicate detection. */
function contourKey(c: Contour): string {
  const ce = centroid(c);
  return `${Math.round(area(c) * 100)}|${Math.round(ce.x * 100)}|${Math.round(ce.y * 100)}|${Math.round(perimeter(c) * 100)}`;
}

interface ErosionCheck {
  vanished: RegionNode[];
  necks: Contour[];
  split: boolean;
  /** How many extra pieces / merged holes erosion produced (0 = topology unchanged). */
  changes: number;
}

/**
 * Morphological check: erode by w/2.
 *  - parts that vanish are thinner than w everywhere
 *  - more regions after erosion means a neck thinner than w
 *  - fewer holes after erosion means a wall thinner than w between two holes
 * With `locate`, necks/walls are located by opening (erode then dilate) and keeping
 * the difference slivers that are big and elongated enough to be a real neck
 * (sharp corners also leave slivers; those are filtered out by size).
 */
function erosionCheck(regions: readonly RegionNode[], w: number, locate: boolean): ErosionCheck {
  if (regions.length === 0 || w <= 0) return { vanished: [], necks: [], split: false, changes: 0 };
  // Coarsen vertices first: the check tolerates 0.1 mm error and offsetting cost grows with vertex count.
  const flat = cleanRegions(regions, Math.min(0.1, w / 10)).map((r) => ({ ...r, children: [], childHole: [] }) as RegionNode);
  if (flat.length === 0) return { vanished: [], necks: [], split: false, changes: 0 };
  const eroded = offset(flat, -w / 2, "square");
  const erodedFlat = flattenRegions(eroded);
  const erodedInfo = erodedFlat.map((e) => ({ p: e.outer[0]!, b: bounds([e.outer]) }));
  const vanished: RegionNode[] = [];
  for (const r of flat) {
    const rb = bounds([r.outer]);
    // Eroded regions are subsets of the originals, so any vertex of an eroded outer inside r.outer means r survived.
    const survives = erodedInfo.some(
      (e) => e.b.minX >= rb.minX - 1e-6 && e.b.maxX <= rb.maxX + 1e-6 && e.b.minY >= rb.minY - 1e-6 && e.b.maxY <= rb.maxY + 1e-6 && containsPoint(r.outer, e.p) && !r.holes.some((h) => containsPoint(h, e.p)),
    );
    if (!survives) vanished.push(r);
  }
  const survivors = flat.length - vanished.length;
  const holesBefore = flat.reduce((n, r) => n + r.holes.length, 0);
  const holesAfter = erodedFlat.reduce((n, r) => n + r.holes.length, 0);
  const changes = Math.max(0, erodedFlat.length - survivors) + Math.max(0, holesBefore - holesAfter);
  const split = changes > 0;
  let necks: Contour[] = [];
  if (split && locate) {
    const opened = offset(erodedFlat, w / 2, "square");
    const slivers = flattenRegions(difference(flat, flattenRegions(opened)));
    const minArea = 0.8 * w * w;
    necks = slivers
      .filter((s) => area(s.outer) >= minArea && contourExtent(s.outer) >= 2 * w)
      .sort((a, b) => area(b.outer) - area(a.outer))
      .slice(0, 40)
      .map((s) => s.outer);
  }
  return { vanished, necks, split, changes };
}

export interface ValidateInput {
  geometry: MandalaGeometry;
  stencil: StencilGeometry;
  constraints: Constraints;
  sheet: { width: number; height: number; outline: boolean; cornerRadius: number };
}

export function validateStencil(input: ValidateInput): ValidationResult {
  const { geometry, stencil, constraints } = input;
  const issues: ValidationIssue[] = [];
  let n = 0;
  const push = (code: IssueCode, severity: Severity, message: string, contours: Contour[] = [], ringIds?: string[]): void => {
    const issue: ValidationIssue = { id: `${code}-${n++}`, code, severity, message, contours };
    if (ringIds) issue.ringIds = ringIds;
    issues.push(issue);
  };

  const finalFlat = flattenRegions(stencil.final);
  if (finalFlat.length === 0) push("empty", "info", "切り抜き形状がありません。リングを追加してください。");

  // 1. Islands that remain after bridging.
  for (const island of stencil.islands) {
    push("island", "error", `脱落する島があります（面積 ${fmt(island.area)} mm²）。ブリッジで外側と接続してください。`, [island.contour]);
  }

  // 2. Bridge width.
  for (const b of stencil.bridges) {
    if (b.width + 1e-9 < constraints.minBridgeWidth) {
      push("bridge-too-narrow", "error", `ブリッジ幅 ${fmt(b.width)} mm が最小ブリッジ幅 ${fmt(constraints.minBridgeWidth)} mm より細いです。`, [bridgeRect(b)]);
    }
  }

  // 3. Thin material (min gap) — sheet minus apertures.
  if (finalFlat.length > 0) {
    const material = difference([sheetRegion(input.sheet)], finalFlat);
    const mat = erosionCheck(material, constraints.minGap, true);
    const vanishedMaterial = mat.vanished.filter((r) => area(r.outer) >= 1e-3);
    if (vanishedMaterial.length > 0) {
      push("thin-material", "warning", `最小間隔 ${fmt(constraints.minGap)} mm より細い材料片が ${vanishedMaterial.length} 個あります（切断時に失われる可能性）。`, vanishedMaterial.map((r) => r.outer));
    }
    if (mat.necks.length > 0) {
      push("thin-material", "warning", `最小間隔 ${fmt(constraints.minGap)} mm より細い材料のくびれ／壁があります（${mat.necks.length} 箇所）。`, mat.necks);
    } else if (mat.split) {
      push("thin-material", "info", `最小間隔 ${fmt(constraints.minGap)} mm で材料を細らせると分離する箇所があります（${mat.changes} 箇所、角の先端など）。`);
    }
    // 4. Thin apertures (min feature width): only whole features that are too thin are reported;
    //    tapering tips are normal for cut shapes.
    const ap = erosionCheck(finalFlat, constraints.minFeatureWidth, false);
    if (ap.vanished.length > 0) {
      push("thin-feature", "warning", `最小形状幅 ${fmt(constraints.minFeatureWidth)} mm より細い切り抜き形状が ${ap.vanished.length} 個あります。`, ap.vanished.map((r) => r.outer));
    }
    // 5. Small holes (apertures smaller than the minimum hole diameter).
    const small = finalFlat.filter((r) => contourExtent(r.outer) < constraints.minHoleDiameter);
    if (small.length > 0) {
      push("small-hole", "warning", `最小穴径 ${fmt(constraints.minHoleDiameter)} mm より小さい穴が ${small.length} 個あります。`, small.map((r) => r.outer));
    }
  }

  // 6. Self-intersection (checked once per ring on the motif-local shape: copies are rigid transforms).
  for (const ring of geometry.rings) {
    const first = ring.instances[0];
    if (!first) continue;
    const bad = first.closed.filter(hasSelfIntersection);
    if (bad.length > 0) push("self-intersection", "warning", "モチーフ形状が自己交差しています。パラメータを見直してください。", bad, [ring.ringId]);
  }

  // 7. Duplicate paths across rings/instances.
  const seen = new Map<string, { ringId: string; contour: Contour }>();
  const dupRings = new Set<string>();
  const dupContours: Contour[] = [];
  for (const ring of geometry.rings) {
    for (const inst of ring.instances) {
      for (const c of inst.closed) {
        const key = contourKey(c);
        const prev = seen.get(key);
        if (prev) {
          dupRings.add(prev.ringId);
          dupRings.add(ring.ringId);
          dupContours.push(c);
        } else seen.set(key, { ringId: ring.ringId, contour: c });
      }
    }
  }
  if (dupContours.length > 0) {
    push("duplicate-path", "warning", `重複するパスが ${dupContours.length} 個あります（同じ位置・同じ形状）。書き出しでは1つに統合されます。`, dupContours, [...dupRings]);
  }

  if (stencil.overflow) push("sheet-overflow", "warning", "形状がシートの外にはみ出しています。シート内で切り取られます。");

  let cutLength = 0;
  for (const r of finalFlat) {
    cutLength += perimeter(r.outer);
    for (const h of r.holes) cutLength += perimeter(h);
  }
  const stats: ValidationStats = {
    regions: finalFlat.length,
    islands: stencil.islands.length,
    bridges: stencil.bridges.length,
    cutLength,
    apertureArea: regionArea(finalFlat),
  };
  return { ok: !issues.some((i) => i.severity === "error"), issues, stats };
}

function bridgeRect(b: { x: number; y: number; length: number; width: number; rotation: number }): Contour {
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  const hl = b.length / 2;
  const hw = b.width / 2;
  const pt = (u: number, w: number) => ({ x: b.x + u * c - w * s, y: b.y + u * s + w * c });
  return [pt(-hl, -hw), pt(hl, -hw), pt(hl, hw), pt(-hl, hw)];
}
