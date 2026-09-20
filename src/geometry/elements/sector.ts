/**
 * Sector assembly: elements (in the sector frame) -> local regions with
 * stroke bands, inset borders, element transforms, radial orientation, local
 * repeat, sector mirroring and cut/keep booleans. The result is then rotated
 * `ring.repeat` times by the radial stage.
 *
 * Sector frame: origin at (ring.radius, 0) on the sector axis, +x radially
 * outward, +y tangential (clockwise on screen). The mandala center is at (-R, 0).
 */
import type { CompoundMotif, Project, Ring, SectorElement } from "../../model/project";
import { difference, flattenRegions, offset, strokeClosed, strokeOpen } from "../boolean";
import type { Contour, Region, Vec2 } from "../types";
import { TOLERANCE } from "../types";
import { area, bounds, centroid, perimeter } from "../vec";
import { buildElementShape, isLineLike, resolveElementParams } from "./builders";

export const DEFAULT_LINE_WIDTH = 1.0;

export interface SectorBuildOptions {
  minFeatureWidth: number;
  compounds: readonly CompoundMotif[];
}

export interface ElementRegions {
  elementId: string;
  mode: "cut" | "keep";
  /** All copies of the element in the sector frame (before global repeat). */
  regions: Region[];
}

export interface SectorResult {
  /** Final cut regions of the sector (keep elements already subtracted). */
  cuts: Region[];
  /** Per-element regions (for display and hit-testing). Compound children are flattened to the compound's id. */
  elements: ElementRegions[];
  notes: string[];
}

/** Stroke / inset handling shared by all element types. Returns regions in the element's local frame. */
export function elementLocalRegions(el: SectorElement, ringRadius: number, minFeatureWidth: number, notes: string[]): Region[] {
  const params = resolveElementParams(el);
  const shape = buildElementShape(el, { length: el.length, width: el.width, ringRadius, tolerance: TOLERANCE, params });
  const regions: Region[] = [];
  const inset = el.inset > 0 ? el.inset : el.type === "paisley" ? (params.innerGap ?? 0) : 0;
  const lineWidth = el.strokeWidth > 0 ? el.strokeWidth : Math.max(DEFAULT_LINE_WIDTH, minFeatureWidth);
  let defaulted = false;
  for (const c of shape.closed) {
    if (c.length < 3) continue;
    if (el.strokeWidth > 0) regions.push(...flattenRegions(strokeClosed(c, el.strokeWidth)));
    else if (inset > 0) regions.push(...insetRegions(c, inset, el.insetStem));
    else regions.push({ outer: c, holes: [] });
  }
  for (const line of shape.open) {
    if (line.length < 2) continue;
    if (el.strokeWidth <= 0) defaulted = true;
    regions.push(...flattenRegions(strokeOpen(line, lineWidth)));
  }
  if (defaulted && isLineLike(el)) notes.push(`線状要素「${el.name ?? el.type}」の線幅が0なので ${lineWidth} mm を使いました。`);
  return regions;
}

/**
 * Inset border: the aperture becomes a band of width `inset` around the shape, leaving
 * an inner copy as material. `stem` > 0 keeps that copy attached at the base (-x side).
 */
function insetRegions(c: Contour, inset: number, stem: number): Region[] {
  const inner = flattenRegions(offset([{ outer: c, holes: [] }], -inset));
  if (inner.length === 0) return [{ outer: c, holes: [] }];
  let band: Region[] = flattenRegions(difference([{ outer: c, holes: [] }], inner));
  if (stem > 0) {
    const ob = bounds([c]);
    const ib = bounds(inner.map((r) => r.outer));
    const w = stem / 2;
    const rect: Region = {
      outer: [
        { x: ob.minX - 1, y: -w },
        { x: ib.minX + inset * 0.5, y: -w },
        { x: ib.minX + inset * 0.5, y: w },
        { x: ob.minX - 1, y: w },
      ],
      holes: [],
    };
    band = flattenRegions(difference(band, [rect]));
  }
  return band;
}

/** Element transform: scale -> mirror -> rotate -> translate. */
export interface ElementTransform {
  x: number;
  y: number;
  rotation: number; // radians
  scaleX: number;
  scaleY: number;
  mirror: boolean;
}

export function applyElementTransform(p: Vec2, t: ElementTransform): Vec2 {
  const x = p.x * t.scaleX;
  const y = p.y * t.scaleY * (t.mirror ? -1 : 1);
  const c = Math.cos(t.rotation);
  const s = Math.sin(t.rotation);
  return { x: x * c - y * s + t.x, y: x * s + y * c + t.y };
}

export function invertElementTransform(p: Vec2, t: ElementTransform): Vec2 {
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  const c = Math.cos(-t.rotation);
  const s = Math.sin(-t.rotation);
  const x = dx * c - dy * s;
  const y = dx * s + dy * c;
  return { x: x / t.scaleX, y: (y / t.scaleY) * (t.mirror ? -1 : 1) };
}

function transformRegion(r: Region, t: ElementTransform): Region {
  const flip = t.mirror !== (t.scaleX * t.scaleY < 0);
  const map = (c: Contour): Contour => {
    const out = c.map((p) => applyElementTransform(p, t));
    return flip ? out.reverse() : out;
  };
  return { outer: map(r.outer), holes: r.holes.map(map) };
}

/** Rotate a region about the mandala center (at (-R, 0) in the sector frame). */
function rotateAboutCenter(r: Region, R: number, rad: number): Region {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const map = (p: Vec2): Vec2 => {
    const x = p.x + R;
    const y = p.y;
    return { x: x * c - y * s - R, y: x * s + y * c };
  };
  return { outer: r.outer.map(map), holes: r.holes.map((h) => h.map(map)) };
}

/** Mirror a region across the sector axis (y -> -y), keeping orientation. */
export function mirrorRegionY(r: Region): Region {
  const map = (c: Contour): Contour => [...c].reverse().map((p) => ({ x: p.x, y: -p.y }));
  return { outer: map(r.outer), holes: r.holes.map(map) };
}

const signature = (r: Region): string => {
  const c = centroid(r.outer);
  return `${Math.round(area(r.outer) * 100)}|${Math.round(c.x * 100)}|${Math.round(c.y * 100)}|${Math.round(perimeter(r.outer) * 100)}`;
};

/** Effective transform of an element inside the sector frame (includes radial orientation). */
export function elementTransform(el: SectorElement, R: number): ElementTransform {
  const radial = el.orient === "radial" ? Math.atan2(el.y, el.x + R) : 0;
  return { x: el.x, y: el.y, rotation: (el.rotation * Math.PI) / 180 + radial, scaleX: el.scaleX, scaleY: el.scaleY, mirror: el.mirror };
}

/** Local repeat angles (radians about the mandala center) for an element. */
export function localRepeatAngles(el: SectorElement, sectorAngleDeg: number): number[] {
  const n = Math.max(1, Math.round(el.repeat));
  if (n === 1) return [0];
  const spread = ((el.repeatSpread > 0 ? el.repeatSpread : sectorAngleDeg) * Math.PI) / 180;
  const out: number[] = [];
  for (let j = 0; j < n; j++) out.push(spread * ((j + 0.5) / n - 0.5));
  return out;
}

/**
 * Build all sector-frame copies of one element (transform, local repeat, sector mirror).
 * Compound elements recurse into their children.
 */
function buildElementCopies(el: SectorElement, ring: Ring, o: SectorBuildOptions, notes: string[], depth: number): { cut: Region[]; keep: Region[] } {
  const R = ring.radius;
  const sectorAngle = 360 / Math.max(1, ring.repeat);
  const t = elementTransform(el, R);
  let cut: Region[] = [];
  let keep: Region[] = [];
  if (el.type === "compound") {
    if (depth >= 3) return { cut, keep };
    const comp = o.compounds.find((c) => c.id === el.ref);
    if (!comp) {
      notes.push(`複合モチーフ「${el.ref}」が見つかりません。`);
      return { cut, keep };
    }
    // Children live in the compound's local frame; build them as a mini sector at the compound's position.
    const sub = buildSectorLocal({ ...ring, mirrorLocal: false, elements: comp.elements }, o, notes, depth + 1, t);
    cut = sub.cuts;
  } else {
    const worldR = Math.hypot(el.x + R, el.y);
    const local = elementLocalRegions(el, worldR, o.minFeatureWidth, notes);
    const placed = local.map((r) => transformRegion(r, t));
    if (el.mode === "keep") keep = placed;
    else cut = placed;
  }
  // Local radial repeat about the mandala center.
  const angles = localRepeatAngles(el, sectorAngle);
  const repeatAll = (rs: Region[]): Region[] => angles.flatMap((a) => (a === 0 ? rs : rs.map((r) => rotateAboutCenter(r, R, a))));
  cut = repeatAll(cut);
  keep = repeatAll(keep);
  // Sector mirror: add the y -> -y copy unless it coincides with the original.
  if (ring.mirrorLocal) {
    const addMirror = (rs: Region[]): Region[] => {
      const seen = new Set(rs.map(signature));
      const extra = rs.map(mirrorRegionY).filter((m) => !seen.has(signature(m)));
      return [...rs, ...extra];
    };
    cut = addMirror(cut);
    keep = addMirror(keep);
  }
  return { cut, keep };
}

/** Build the sector's regions in the sector frame, processing cut/keep in element order. */
function buildSectorLocal(ring: Ring, o: SectorBuildOptions, notes: string[], depth: number, parent?: ElementTransform): SectorResult {
  let cuts: Region[] = [];
  const elements: ElementRegions[] = [];
  for (const el of ring.elements) {
    if (!el.visible) continue;
    const { cut, keep } = buildElementCopies(el, ring, o, notes, depth);
    const place = (rs: Region[]): Region[] => (parent ? rs.map((r) => transformRegion(r, parent)) : rs);
    const cutP = place(cut);
    const keepP = place(keep);
    if (cutP.length > 0) {
      cuts.push(...cutP);
      elements.push({ elementId: el.id, mode: "cut", regions: cutP });
    }
    if (keepP.length > 0) {
      if (cuts.length > 0) cuts = flattenRegions(difference(cuts, keepP));
      elements.push({ elementId: el.id, mode: "keep", regions: keepP });
    }
  }
  return { cuts, elements, notes };
}

export function buildSector(ring: Ring, project: Pick<Project, "compounds" | "constraints">): SectorResult {
  const notes: string[] = [];
  return buildSectorLocal(ring, { minFeatureWidth: project.constraints.minFeatureWidth, compounds: project.compounds }, notes, 0);
}
