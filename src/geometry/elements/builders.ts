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
  /** Base band width for tapered-band types (element.strokeWidth). */
  strokeWidth?: number;
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
  paisley: [], // filled in below (PAISLEY_PARAMS) after the true paisley is defined
  spiral: [{ key: "turns", label: "巻き数", min: 0.5, max: 4, step: 0.25, default: 1.5 }],
  arc: [],
  dot: [],
  circle: [],
  bezier: [{ key: "taper", label: "先細り (0 = 一様幅)", min: 0, max: 1, step: 0.05, default: 0 }],
  connector: [],
  compound: [],
  shape: [],
};

export function elementParamSpecs(el: SectorElement): readonly ParamSpec[] {
  if (el.type === "shape") return getMotif(el.motif).params;
  if (el.type === "paisley") return PAISLEY_PARAMS;
  return ELEMENT_PARAMS[el.type] ?? CURVE_PARAMS[el.type] ?? [];
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

/** Element shape: closed contours, open polylines, and optional inner cuts (inside inset material). */
export interface ElementShape extends MotifShape {
  inner?: Contour[];
}

/** Build the element's local shape. */
export function buildElementShape(el: SectorElement, ctx: ElementBuildContext): ElementShape {
  const { length: L, width: W, tolerance, params: p } = ctx;
  const w0 = ctx.strokeWidth && ctx.strokeWidth > 0 ? ctx.strokeWidth : Math.max(1.2, W * 0.2);
  switch (el.type) {
    case "ccurve":
      return closed(cleanBand(buildCCurve(L, W, w0, p.tip ?? 0.35, tolerance)));
    case "hook":
      return closed(cleanBand(buildHook(L, W, w0, p.tip ?? 0.35, p.turns ?? 0.75, p.direction ?? 1, tolerance)));
    case "vine":
      return closed(cleanBand(buildVine(L, W, w0, p.tip ?? 0.3, p.waves ?? 2, tolerance)));
    case "doublecurl":
      return closed(cleanBand(buildDoubleCurl(L, W, w0, p.tip ?? 0.35, p.turns ?? 0.75, tolerance)));
    case "opposedcurl":
      return closed(buildOpposedCurl(L, W, w0, p.tip ?? 0.35, p.turns ?? 0.75, tolerance).closed.flatMap(cleanBand));
    case "tendril":
      return closed(cleanBand(buildTendril(L, W, w0, p.tip ?? 0.25, p.turns ?? 1.5, p.direction ?? 1, tolerance)));
    case "teardrop":
      return closed([buildTeardrop(L, W, p.tipSharpness ?? 0.6, p.curvature ?? 0, tolerance)]);
    case "leaf":
      return closed([buildLeaf(L, W, p.tipSharpness ?? 0.7, p.bend ?? 0, tolerance)]);
    case "petal":
      return closed([buildPetal(L, W, p.bulge ?? 1, p.shoulder ?? 0.35, tolerance)]);
    case "paisley": {
      const ps = buildTruePaisley(
        { length: L, width: W, belly: p.belly ?? 0.5, curlRadius: p.curlRadius ?? 0, curlAmount: p.curlAmount ?? 0.6, tipSharpness: p.tipSharpness ?? 0.7, innerInset: p.innerInset ?? 0, innerCurl: p.innerCurl ?? 0, direction: p.direction ?? 1 },
        tolerance,
      );
      return { closed: [ps.outer], open: [], inner: ps.inner };
    }
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
      if (el.closed && pts.length >= 3) return closed([pts]);
      const taper = p.taper ?? 0;
      if (taper > 0 && pts.length >= 2) return closed(cleanBand(taperedBand(pts, (t) => w0 * (1 - taper * t), { tolerance })));
      return open([pts]);
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

// ---------------------------------------------------------------------------
// v0.3: tapered ornamental bands, curve vocabulary and the true paisley.
// ---------------------------------------------------------------------------

import type { Polyline } from "../types";
import { arcPoints, area as contourArea } from "../vec";
import { simplify } from "../boolean/clipper";

/**
 * Tapered bands self-overlap where a curl is tighter than the band is wide.
 * Resolve the self-intersections (nonzero fill) and keep the filled outer
 * contours; loops enclosed by the band are filled (a curl end becomes solid).
 */
export function cleanBand(c: Contour): Contour[] {
  if (c.length < 3) return [];
  const parts = simplify(c).filter((q) => q.length >= 3 && signedAreaOf(q) > 0.01);
  if (parts.length === 0) return [];
  return parts.sort((a, b) => contourArea(b) - contourArea(a));
}

function signedAreaOf(c: Contour): number {
  let a = 0;
  for (let i = 0, n = c.length; i < n; i++) {
    const p = c[i]!;
    const q = c[(i + 1) % n]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Variable-width band around a polyline. `widthAt(t)` gives the full width at
 * parameter t (0 = start, 1 = end, by arc length). The start gets a round cap,
 * the end is closed by a small cap of the final width. Left/right can be
 * asymmetric through `bias` (0 = symmetric, 0.5 = all width on the left side).
 */
export function taperedBand(line: Polyline, widthAt: (t: number) => number, options: { bias?: (t: number) => number; roundStart?: boolean; tolerance?: number } = {}): Contour {
  const n = line.length;
  if (n < 2) return [];
  const bias = options.bias ?? (() => 0);
  const tol = options.tolerance ?? 0.02;
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y));
  const total = cum[n - 1]! || 1;
  const normals: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 1)]!;
    const b = line[Math.min(n - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    normals.push({ x: -dy / l, y: dx / l });
  }
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = cum[i]! / total;
    const w = Math.max(0.05, widthAt(t));
    const b = Math.max(-0.5, Math.min(0.5, bias(t)));
    const wl = w * (0.5 + b);
    const wr = w * (0.5 - b);
    const p = line[i]!;
    const nn = normals[i]!;
    left.push({ x: p.x + nn.x * wl, y: p.y + nn.y * wl });
    right.push({ x: p.x - nn.x * wr, y: p.y - nn.y * wr });
  }
  const out: Vec2[] = [];
  if (options.roundStart !== false) {
    // Round cap at the start: arc from the right point around the back to the left point.
    const p0 = line[0]!;
    const r = widthAt(0) / 2;
    const nn = normals[0]!;
    const back = Math.atan2(-nn.y, -nn.x); // angle of the right point
    out.push(...arcPoints(p0, r, back, Math.PI, tol).slice(1, -1).reverse().map((q) => ({ x: q.x, y: q.y })));
  }
  out.push(...left, ...right.reverse());
  return out;
}

/** Sample a chain of cubic segments as an even polyline (by parameter). */
function chain(points: Vec2[], tolerance: number): Vec2[] {
  return flattenPath(points, false, tolerance);
}

/** Spiral polyline: center c, start angle a0, sweep (signed radians), radius from r0 to r1. */
function spiralPoints(c: Vec2, r0: number, r1: number, a0: number, sweep: number, tolerance: number): Vec2[] {
  const n = Math.max(16, arcSegments(Math.max(r0, r1), Math.abs(sweep), tolerance));
  const out: Vec2[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const a = a0 + sweep * t;
    const r = r0 + (r1 - r0) * t;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

const taperProfile = (w0: number, tip: number) => (t: number) => w0 * (1 - (1 - tip) * t);

/** C-Curve: an arc-like cubic from (-L/2, 0) bulging to +y, tapered at both ends. */
export function buildCCurve(L: number, W: number, w0: number, tip: number, tolerance: number): Contour {
  const line = chain([{ x: -L / 2, y: 0 }, { x: -L / 2 + L * 0.1, y: W }, { x: L / 2 - L * 0.1, y: W }, { x: L / 2, y: 0 }], tolerance);
  return taperedBand(line, (t) => w0 * (tip + (1 - tip) * Math.sin(Math.PI * t)), { roundStart: false, tolerance });
}

/** Hook: straight-ish stem that ends in a small tight curl. */
export function buildHook(L: number, W: number, w0: number, tip: number, turns: number, dir: number, tolerance: number): Contour {
  const rc = Math.min(W / 2, L * 0.28);
  const c = { x: L / 2 - rc, y: 0 };
  const start = { x: c.x - rc, y: 0 };
  const stem = chain([{ x: -L / 2, y: 0 }, { x: -L / 2 + L * 0.5, y: 0 }, { x: start.x - L * 0.15, y: -rc * 0.3 * dir }, start], tolerance);
  const sweep = -turns * Math.PI * 2 * dir;
  const line = [...stem, ...spiralPoints(c, rc, rc * 0.35, Math.PI, sweep, tolerance)];
  return taperedBand(line, taperProfile(w0, tip), { tolerance });
}

/** Vine: undulating cubic chain with `waves` bends, tapered from base to tip. */
export function buildVine(L: number, W: number, w0: number, tip: number, waves: number, tolerance: number): Contour {
  const n = Math.max(1, Math.round(waves));
  const pts: Vec2[] = [{ x: -L / 2, y: 0 }];
  const seg = L / n;
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + seg * i;
    const s = i % 2 === 0 ? 1 : -1;
    const amp = (W / 2) * (1 - 0.5 * (i / n));
    pts.push({ x: x0 + seg * 0.3, y: s * amp }, { x: x0 + seg * 0.7, y: s * amp }, { x: x0 + seg, y: 0 });
  }
  return taperedBand(chain(pts, tolerance), taperProfile(w0, tip), { tolerance });
}

/** Double curl: S-curve whose both ends curl the same way (like an ornamental "S" scroll). */
export function buildDoubleCurl(L: number, W: number, w0: number, tip: number, turns: number, tolerance: number): Contour {
  const rc = Math.min(W * 0.25, L * 0.18);
  const c1 = { x: -L / 2 + rc, y: -W / 2 + rc };
  const c2 = { x: L / 2 - rc, y: W / 2 - rc };
  const s1 = spiralPoints(c1, rc * 0.35, rc, 0, turns * Math.PI * 2, tolerance).reverse();
  const a = { x: c1.x + rc, y: c1.y };
  const b = { x: c2.x - rc, y: c2.y };
  const mid = chain([a, { x: a.x + L * 0.25, y: a.y }, { x: b.x - L * 0.25, y: b.y }, b], tolerance);
  const s2 = spiralPoints(c2, rc, rc * 0.35, Math.PI, turns * Math.PI * 2, tolerance);
  const line = [...s1, ...mid.slice(1), ...s2];
  return taperedBand(line, (t) => w0 * (tip + (1 - tip) * Math.sin(Math.PI * t)), { roundStart: false, tolerance });
}

/** Opposed curl: a shared stem from the base that splits into two curls curling in opposite directions. */
export function buildOpposedCurl(L: number, W: number, w0: number, tip: number, turns: number, tolerance: number): { closed: Contour[] } {
  const split = { x: -L / 2 + L * 0.3, y: 0 };
  const rc = Math.min(W * 0.22, L * 0.2);
  const out: Contour[] = [];
  out.push(taperedBand(chain([{ x: -L / 2, y: 0 }, { x: -L / 2 + L * 0.1, y: 0 }, { x: split.x - L * 0.1, y: 0 }, split], tolerance), () => w0, { tolerance }));
  for (const dir of [1, -1]) {
    const c = { x: L / 2 - rc, y: dir * (W / 2 - rc) };
    const start = { x: c.x - rc, y: c.y };
    const branch = chain([split, { x: split.x + L * 0.2, y: 0 }, { x: start.x - L * 0.12, y: c.y * 0.7 }, start], tolerance);
    const line = [...branch, ...spiralPoints(c, rc, rc * 0.35, Math.PI, -dir * turns * Math.PI * 2, tolerance)];
    out.push(taperedBand(line, taperProfile(w0 * 0.9, tip), { roundStart: false, tolerance }));
  }
  return { closed: out };
}

/** Tendril: long thin wavy stem ending in a tight multi-turn curl. */
export function buildTendril(L: number, W: number, w0: number, tip: number, turns: number, dir: number, tolerance: number): Contour {
  const rc = Math.min(W / 2, L * 0.22);
  const c = { x: L / 2 - rc, y: 0 };
  const start = { x: c.x - rc, y: 0 };
  const stem = chain([{ x: -L / 2, y: 0 }, { x: -L / 2 + L * 0.25, y: -W * 0.25 * dir }, { x: start.x - L * 0.2, y: W * 0.3 * dir }, start], tolerance);
  const line = [...stem, ...spiralPoints(c, rc, rc * 0.15, Math.PI, -dir * turns * Math.PI * 2, tolerance)];
  return taperedBand(line, (t) => w0 * (1 - (1 - tip) * Math.pow(t, 0.8)), { tolerance });
}

export interface PaisleyParams {
  length: number;
  width: number;
  /** Asymmetry of the belly: 0 = symmetric, 1 = strongly one-sided (0..1). */
  belly: number;
  /** Radius of the curled tip (mm, 0 = automatic). */
  curlRadius: number;
  /** How far the tip curls inward: 0 = straight teardrop, 0.5 = hook, 1 = three-quarter turn. */
  curlAmount: number;
  tipSharpness: number;
  /** Inner contour offset (mm, 0 = none). Material is left inside, attached by a stem. */
  innerInset: number;
  /** Internal curl cut inside the inner material (0 = none, otherwise relative size 0..1). */
  innerCurl: number;
  /** Direction of the curl (+1 / -1). */
  direction: number;
}

export interface PaisleyShape {
  outer: Contour;
  /** Cuts placed inside the inner material (only meaningful with innerInset > 0). */
  inner: Contour[];
  /** Spine polyline (for placing nested ornaments). */
  spine: Vec2[];
}

/** Arc-length frame of a polyline spine: position and unit normal at distance s. */
export function spineFrames(spine: readonly Vec2[]): { total: number; at(s: number): { p: Vec2; n: Vec2; t: Vec2 } } {
  const n = spine.length;
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + Math.hypot(spine[i]!.x - spine[i - 1]!.x, spine[i]!.y - spine[i - 1]!.y));
  const total = cum[n - 1]! || 1;
  const tangents: Vec2[] = spine.map((_, i) => {
    const a = spine[Math.max(0, i - 1)]!;
    const b = spine[Math.min(n - 1, i + 1)]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  return {
    total,
    at(s: number) {
      const sc = Math.max(0, Math.min(total, s));
      let i = 0;
      while (i < n - 2 && cum[i + 1]! < sc) i++;
      const seg = cum[i + 1]! - cum[i]! || 1;
      const u = Math.max(0, Math.min(1, (sc - cum[i]!) / seg));
      const p = { x: spine[i]!.x + (spine[i + 1]!.x - spine[i]!.x) * u, y: spine[i]!.y + (spine[i + 1]!.y - spine[i]!.y) * u };
      const ta = tangents[i]!;
      const tb = tangents[i + 1]!;
      let tx = ta.x + (tb.x - ta.x) * u;
      let ty = ta.y + (tb.y - ta.y) * u;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      return { p, t: { x: tx, y: ty }, n: { x: -ty, y: tx } };
    },
  };
}

/**
 * Sweep a straight shape (its axis along x from x0 to x0 + total) along a spine:
 * x becomes arc length, y becomes the offset along the spine normal (scaled by
 * `sideScale(y)` so one side can be fatter than the other).
 */
export function sweepAlongSpine(shape: readonly Vec2[], spine: readonly Vec2[], x0: number, sideScale: (y: number) => number = () => 1): Vec2[] {
  const frames = spineFrames(spine);
  return shape.map((q) => {
    const f = frames.at(q.x - x0);
    const y = q.y * sideScale(q.y);
    return { x: f.p.x + f.n.x * y, y: f.p.y + f.n.y * y };
  });
}

/**
 * True paisley: a straight teardrop (round base, sharp tip) swept along a spine
 * that bends and ends in an inward curl. The belly is fattened on the outside of
 * the curl. Inner cuts (internal curl) are placed inside the inner material.
 */
export function buildTruePaisley(p: PaisleyParams, tolerance: number): PaisleyShape {
  const L = p.length;
  const W = p.width;
  const dir = p.direction < 0 ? -1 : 1;
  const curlAmount = Math.max(0, Math.min(1.5, p.curlAmount));
  const rc = p.curlRadius > 0 ? Math.min(p.curlRadius, L * 0.35) : Math.max(W * 0.38, 1.5);
  const sweepAngle = curlAmount * Math.PI * 1.3;
  const curlLen = rc * 0.8 * sweepAngle; // spiral of mean radius 0.8 rc
  const bodyLen = Math.max(L * 0.45, L - curlLen);
  const bend = W * 0.18 * dir * (0.4 + curlAmount);
  const bodyEnd = { x: -L / 2 + bodyLen, y: bend };
  const body = chain([{ x: -L / 2, y: 0 }, { x: -L / 2 + bodyLen * 0.5, y: 0 }, { x: -L / 2 + bodyLen * 0.85, y: bend * 0.55 }, bodyEnd], tolerance);
  let spine: Vec2[] = body;
  if (curlAmount > 0.01) {
    const prev = body[body.length - 2]!;
    const tg = { x: bodyEnd.x - prev.x, y: bodyEnd.y - prev.y };
    const tl = Math.hypot(tg.x, tg.y) || 1;
    // Curl center on the +dir side of the body end (left normal for dir = 1).
    const nrm = { x: (-tg.y / tl) * dir, y: (tg.x / tl) * dir };
    const c = { x: bodyEnd.x + nrm.x * rc, y: bodyEnd.y + nrm.y * rc };
    const a0 = Math.atan2(bodyEnd.y - c.y, bodyEnd.x - c.x);
    spine = [...body, ...spiralPoints(c, rc, rc * 0.6, a0, dir * sweepAngle, tolerance)];
  }
  const frames = spineFrames(spine);
  // Straight teardrop of the spine's length, tip sharpness raised so the tip fits inside the curl.
  const s = Math.max(0.55, Math.min(1, p.tipSharpness));
  const straightRaw = buildTeardrop(frames.total, W, s, 0, tolerance);
  // Thin the part that lies in the curl so it fits inside the spiral radius.
  const xBody = -frames.total / 2 + bodyLen;
  const straight = straightRaw.map((q) => (q.x > xBody ? { x: q.x, y: q.y * (1 - 0.5 * Math.min(1, (q.x - xBody) / Math.max(1e-6, frames.total / 2 - xBody))) } : q));
  const belly = Math.max(0, Math.min(1, p.belly));
  // Width is measured from the spine; the outside of the curl (-dir side) gets the belly.
  const outer = sweepAlongSpine(straight, spine, -frames.total / 2, (y) => (Math.sign(y) === -dir ? 1 + belly * 0.45 : 1 - belly * 0.3));
  const inner: Contour[] = [];
  if (p.innerInset > 0 && p.innerCurl > 0) {
    const k = Math.min(1, p.innerCurl);
    const cL = (bodyLen - 2 * p.innerInset) * 0.6 * k;
    const cW = (W - 2 * p.innerInset) * 0.45 * k;
    if (cL > 2.5 && cW > 1.2) {
      const hook = buildHook(cL, cW, Math.max(0.8, cW * 0.35), 0.4, 0.75, dir, tolerance);
      // Map the hook's local x ∈ [-cL/2, cL/2] onto spine arc length starting 1.5 insets from the base.
      inner.push(sweepAlongSpine(hook, spine, -cL / 2 - p.innerInset * 1.5));
    }
  }
  const cleanedOuter = cleanBand(outer)[0] ?? outer;
  return { outer: ensureOrientation(simplifyContour(cleanedOuter), true), inner: inner.flatMap(cleanBand).map((c) => ensureOrientation(simplifyContour(c), true)), spine };
}

export const PAISLEY_PARAMS: readonly ParamSpec[] = [
  { key: "belly", label: "腹の非対称", min: 0, max: 1, step: 0.05, default: 0.5 },
  { key: "curlRadius", label: "巻きの半径 (0=自動)", min: 0, max: 30, step: 0.5, default: 0 },
  { key: "curlAmount", label: "巻き込み (turns)", min: 0, max: 1.5, step: 0.05, default: 0.6 },
  { key: "tipSharpness", label: "先端の鋭さ", min: 0, max: 1, step: 0.05, default: 0.7 },
  { key: "innerInset", label: "内側の輪郭 (mm)", min: 0, max: 10, step: 0.1, default: 0 },
  { key: "innerCurl", label: "内部の渦 (0..1)", min: 0, max: 1, step: 0.05, default: 0 },
  { key: "direction", label: "向き (1 / -1)", min: -1, max: 1, step: 2, default: 1 },
];

export const CURVE_PARAMS: Record<string, readonly ParamSpec[]> = {
  ccurve: [{ key: "tip", label: "端の太さ比", min: 0.1, max: 1, step: 0.05, default: 0.35 }],
  hook: [
    { key: "tip", label: "先端の太さ比", min: 0.1, max: 1, step: 0.05, default: 0.35 },
    { key: "turns", label: "巻き数", min: 0.25, max: 1.5, step: 0.25, default: 0.75 },
    { key: "direction", label: "向き (1 / -1)", min: -1, max: 1, step: 2, default: 1 },
  ],
  vine: [
    { key: "tip", label: "先端の太さ比", min: 0.1, max: 1, step: 0.05, default: 0.3 },
    { key: "waves", label: "波数", min: 1, max: 5, step: 1, default: 2 },
  ],
  doublecurl: [
    { key: "tip", label: "端の太さ比", min: 0.1, max: 1, step: 0.05, default: 0.35 },
    { key: "turns", label: "巻き数", min: 0.25, max: 1.25, step: 0.25, default: 0.75 },
  ],
  opposedcurl: [
    { key: "tip", label: "先端の太さ比", min: 0.1, max: 1, step: 0.05, default: 0.35 },
    { key: "turns", label: "巻き数", min: 0.25, max: 1.25, step: 0.25, default: 0.75 },
  ],
  tendril: [
    { key: "tip", label: "先端の太さ比", min: 0.1, max: 1, step: 0.05, default: 0.25 },
    { key: "turns", label: "巻き数", min: 0.5, max: 3, step: 0.25, default: 1.5 },
    { key: "direction", label: "向き (1 / -1)", min: -1, max: 1, step: 2, default: 1 },
  ],
};
