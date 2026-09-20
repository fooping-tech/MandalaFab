/**
 * Element builders: each element type produces closed contours and/or open
 * polylines in the element's local frame (+x = axis / outward, +y sideways,
 * centred at the origin). Organic motifs are built from cubic Béziers.
 */
import type { SectorElement } from "../../model/project";
import { bendContour, bulgeSegment, closedFromHalf, flattenPath, normalizeWidth, type CubicSegment } from "../bezier";
import { arc as arcMotif, spiral as spiralMotif } from "../motifs/builtin";
import { getMotif, resolveParams, type MotifShape } from "../motifs/registry";
import type { Contour, Vec2 } from "../types";
import { arcSegments, ensureOrientation, simplifyContour } from "../vec";

export interface ElementBuildContext {
  length: number;
  width: number;
  /** Distance from the mandala center to the element position (for concentric arcs). */
  ringRadius: number;
  tolerance: number;
  params: Record<string, number>;
}

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export const ELEMENT_PARAMS: Record<string, readonly ParamSpec[]> = {
  teardrop: [
    { key: "curvature", label: "曲がり", min: -1, max: 1, step: 0.05, default: 0 },
    { key: "tipSharpness", label: "先端の鋭さ", min: 0, max: 1, step: 0.05, default: 0.6 },
  ],
  leaf: [
    { key: "bend", label: "反り", min: -1, max: 1, step: 0.05, default: 0 },
    { key: "tipSharpness", label: "先端の鋭さ", min: 0, max: 1, step: 0.05, default: 0.7 },
  ],
  petal: [
    { key: "bulge", label: "ふくらみ", min: 0.3, max: 1.5, step: 0.05, default: 1 },
    { key: "shoulder", label: "肩の位置", min: 0.1, max: 0.9, step: 0.05, default: 0.35 },
  ],
  scurve: [{ key: "curvature", label: "曲率", min: 0.1, max: 1.2, step: 0.05, default: 0.6 }],
  curl: [
    { key: "radius", label: "渦の半径 (0=自動)", min: 0, max: 50, step: 0.5, default: 0 },
    { key: "turns", label: "巻き数", min: 0.5, max: 3, step: 0.25, default: 1.25 },
    { key: "taper", label: "先細り", min: 0, max: 0.95, step: 0.05, default: 0.7 },
    { key: "direction", label: "向き (1 / -1)", min: -1, max: 1, step: 2, default: 1 },
  ],
  paisley: [
    { key: "curl", label: "曲がり", min: 0, max: 1.5, step: 0.05, default: 0.7 },
    { key: "tip", label: "先端の鋭さ", min: 0, max: 1, step: 0.05, default: 0.7 },
    { key: "innerGap", label: "内側の余白 (mm)", min: 0, max: 10, step: 0.1, default: 0 },
  ],
  spiral: [{ key: "turns", label: "巻き数", min: 0.5, max: 4, step: 0.25, default: 1.5 }],
  arc: [],
  dot: [],
  circle: [],
  bezier: [],
  connector: [],
  compound: [],
  shape: [],
};

export function elementParamSpecs(el: SectorElement): readonly ParamSpec[] {
  if (el.type === "shape") return getMotif(el.motif).params;
  return ELEMENT_PARAMS[el.type] ?? [];
}

export function resolveElementParams(el: SectorElement): Record<string, number> {
  if (el.type === "shape") return resolveParams(getMotif(el.motif), el.params);
  const out: Record<string, number> = {};
  for (const p of elementParamSpecs(el)) {
    const v = el.params[p.key];
    out[p.key] = typeof v === "number" && Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
  }
  return out;
}

const closed = (contours: Contour[]): MotifShape => ({ closed: contours.map((c) => ensureOrientation(simplifyContour(c), true)), open: [] });
const open = (lines: Vec2[][]): MotifShape => ({ closed: [], open: lines });

function ellipse(rx: number, ry: number, tolerance: number): Contour {
  const n = Math.max(12, Math.ceil(arcSegments(Math.max(rx, ry), Math.PI * 2, tolerance) / 4) * 4);
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
  }
  return pts;
}

/** Teardrop: round base at -x, tip at +x. Two cubic segments per side. */
export function buildTeardrop(L: number, W: number, tipSharpness: number, curvature: number, tolerance: number): Contour {
  const s = Math.min(1, Math.max(0, tipSharpness));
  const tip: Vec2 = { x: L / 2, y: 0 };
  const base: Vec2 = { x: -L / 2, y: 0 };
  const xm = Math.min(L / 2 - L * 0.15, -L / 2 + W / 2);
  const widest: Vec2 = { x: xm, y: W / 2 };
  const segs: CubicSegment[] = [
    { start: tip, cp1: { x: L / 2 - s * L * 0.35, y: (1 - s) * W * 0.55 }, cp2: { x: xm + (L / 2 - xm) * 0.5, y: W / 2 }, end: widest },
    { start: widest, cp1: { x: xm - 0.55 * (W / 2), y: W / 2 }, cp2: { x: -L / 2, y: 0.55 * (W / 2) }, end: base },
  ];
  const c = normalizeWidth(closedFromHalf(segs, tolerance), W / 2);
  return bendContour(c, curvature * W * 0.5, -L / 2, L, 2);
}

/** Leaf: two mirrored cubics from base (-x) to tip (+x). */
export function buildLeaf(L: number, W: number, tipSharpness: number, bend: number, tolerance: number): Contour {
  const s = Math.min(1, Math.max(0, tipSharpness));
  const seg: CubicSegment = {
    start: { x: -L / 2, y: 0 },
    cp1: { x: -L / 2 + L * 0.2, y: W * 0.7 },
    cp2: { x: L / 2 - s * L * 0.55, y: W * 0.7 * (1 - 0.6 * s) },
    end: { x: L / 2, y: 0 },
  };
  const c = normalizeWidth(closedFromHalf([seg], tolerance), W / 2);
  return bendContour(c, bend * W * 0.5, -L / 2, L, 2);
}

export function buildPetal(L: number, W: number, bulge: number, shoulder: number, tolerance: number): Contour {
  const h = (W / 2) * bulge * (4 / 3);
  const seg: CubicSegment = { start: { x: -L / 2, y: 0 }, cp1: { x: -L / 2 + L * shoulder, y: h }, cp2: { x: L / 2 - L * shoulder, y: h }, end: { x: L / 2, y: 0 } };
  return closedFromHalf([seg], tolerance);
}

export function buildSCurve(L: number, W: number, curvature: number, tolerance: number): Vec2[] {
  const seg: CubicSegment = { start: { x: -L / 2, y: -W / 2 }, cp1: { x: -L / 2 + curvature * L, y: -W / 2 }, cp2: { x: L / 2 - curvature * L, y: W / 2 }, end: { x: L / 2, y: W / 2 } };
  return flattenPath([seg.start, seg.cp1, seg.cp2, seg.end], false, tolerance);
}

/** Curl: a stem that ends in a spiral. */
export function buildCurl(L: number, W: number, radius: number, turns: number, taper: number, direction: number, tolerance: number): Vec2[] {
  const rc = radius > 0 ? Math.min(radius, L / 2) : Math.min(W / 2, L / 2) * 0.45;
  const dir = direction < 0 ? -1 : 1;
  const c = { x: L / 2 - rc, y: 0 };
  const start = { x: c.x - rc, y: 0 };
  const stem = flattenPath([{ x: -L / 2, y: -W * 0.35 * dir }, { x: -L / 2 + L * 0.45, y: -W * 0.35 * dir }, { x: start.x - L * 0.2, y: W * 0.15 * dir }, start], false, tolerance);
  const total = turns * Math.PI * 2;
  const n = Math.max(24, arcSegments(rc, total, tolerance));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const a = Math.PI - t * total * dir;
    const r = rc * (1 - taper * t);
    stem.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return stem;
}

/** Paisley: a teardrop whose tip curls sideways (cubic bend). */
export function buildPaisley(L: number, W: number, curl: number, tip: number, tolerance: number): Contour {
  const base = buildTeardrop(L, W, tip, 0, tolerance);
  return bendContour(base, curl * L * 0.45, -L / 2, L, 3);
}

/** Build the element's local shape. */
export function buildElementShape(el: SectorElement, ctx: ElementBuildContext): MotifShape {
  const { length: L, width: W, tolerance, params: p } = ctx;
  switch (el.type) {
    case "teardrop":
      return closed([buildTeardrop(L, W, p.tipSharpness ?? 0.6, p.curvature ?? 0, tolerance)]);
    case "leaf":
      return closed([buildLeaf(L, W, p.tipSharpness ?? 0.7, p.bend ?? 0, tolerance)]);
    case "petal":
      return closed([buildPetal(L, W, p.bulge ?? 1, p.shoulder ?? 0.35, tolerance)]);
    case "paisley":
      return closed([buildPaisley(L, W, p.curl ?? 0.7, p.tip ?? 0.7, tolerance)]);
    case "scurve":
      return open([buildSCurve(L, W, p.curvature ?? 0.6, tolerance)]);
    case "curl":
      return open([buildCurl(L, W, p.radius ?? 0, p.turns ?? 1.25, p.taper ?? 0.7, p.direction ?? 1, tolerance)]);
    case "spiral":
      return spiralMotif.build({ length: L, width: W, ringRadius: ctx.ringRadius, tolerance, params: { turns: p.turns ?? 1.5 } });
    case "arc":
      return arcMotif.build({ length: L, width: W, ringRadius: ctx.ringRadius, tolerance, params: {} });
    case "dot":
      return closed([ellipse(W / 2, W / 2, tolerance)]);
    case "circle":
      return closed([ellipse(L / 2, W / 2, tolerance)]);
    case "bezier": {
      const pts = flattenPath(el.points, el.closed, tolerance);
      return el.closed && pts.length >= 3 ? closed([pts]) : open([pts]);
    }
    case "connector": {
      const seg = bulgeSegment(el.from, el.to, el.bulge);
      return open([flattenPath([seg.start, seg.cp1, seg.cp2, seg.end], false, tolerance)]);
    }
    case "shape":
      return getMotif(el.motif).build({ length: L, width: W, ringRadius: ctx.ringRadius, tolerance, params: p });
    case "compound":
      return { closed: [], open: [] };
  }
}

/** Whether an element is line-like (its open polylines need a stroke width). */
export function isLineLike(el: SectorElement): boolean {
  if (el.type === "shape") return getMotif(el.motif).lineLike === true;
  if (el.type === "bezier") return !el.closed;
  return el.type === "scurve" || el.type === "curl" || el.type === "spiral" || el.type === "connector";
}
