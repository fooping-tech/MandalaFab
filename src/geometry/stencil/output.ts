/**
 * Output polarity: what the laser leaves behind.
 *
 *   designGeometry   – the unioned mandala shapes (clipped to the sheet)
 *   materialGeometry – what remains after cutting
 *        stencil : sheet − design (after bridges)      → the sheet with the mandala cut out
 *        positive: design ∪ connectors                 → the mandala itself as a part
 *   cutGeometry      – the closed paths the laser follows (exported as-is)
 *        stencil : the final apertures (holes in the sheet)
 *        positive: the boundaries of the material (outer contours + inner cuts)
 *
 * In positive mode the material must hold together: every connected component
 * is a separate part, so the auto connector joins components with short curved
 * bands until (ideally) one part remains.
 */
import type { OutputPolarity, Project } from "../../model/project";
import { bulgeSegment, flattenPath } from "../bezier";
import { difference, flattenRegions, intersection, regionArea, strokeOpen, union } from "../boolean";
import type { MandalaGeometry } from "../radial/mandala";
import type { Contour, Region, RegionNode, Vec2 } from "../types";
import { area, bounds, containsPoint } from "../vec";
import type { Bridge } from "./bridges";
import { findIslands, type Island } from "./islands";
import { buildStencil, unionApertures, type StencilGeometry } from "./pipeline";
import { sheetRegion } from "./sheet";

/** A band of material added in positive mode to join two components. */
export interface Connector {
  id: string;
  from: Vec2;
  to: Vec2;
  width: number;
  /** Band outline (design coordinates). */
  contour: Contour;
  auto: boolean;
}

/** One connected piece of material (positive mode). */
export interface MaterialComponent {
  region: RegionNode;
  area: number;
  extent: number;
  centroid: Vec2;
  /** True when the piece sits inside a hole of another piece (unsupported island). */
  nested: boolean;
}

export interface OutputGeometry {
  polarity: OutputPolarity;
  designGeometry: RegionNode[];
  materialGeometry: RegionNode[];
  cutGeometry: RegionNode[];
  /** Stencil mode details (bridges, islands); empty structure in positive mode. */
  stencil: StencilGeometry;
  /** Positive mode: connectors that were added. */
  connectors: Connector[];
  /** Positive mode: material components before / after connectors. */
  componentsBefore: MaterialComponent[];
  components: MaterialComponent[];
  overflow: boolean;
}

export interface ConnectorOptions {
  /** Band width (mm) — at least the minimum connection width. */
  width: number;
  /** Do not connect pieces farther apart than this (mm). */
  maxSpan?: number;
  maxIterations?: number;
  /** Curve the band (0 = straight). Fraction of the span used as bulge. */
  curve?: number;
}

const DEFAULT_MAX_SPAN = 14;

/** Every node of the region tree is one piece of material. */
export function materialComponents(nodes: readonly RegionNode[]): MaterialComponent[] {
  const out: MaterialComponent[] = [];
  const walk = (r: RegionNode, nested: boolean): void => {
    const b = bounds([r.outer]);
    let cx = 0, cy = 0;
    for (const p of r.outer) {
      cx += p.x;
      cy += p.y;
    }
    out.push({ region: r, area: area(r.outer) - r.holes.reduce((s, h) => s + area(h), 0), extent: Math.max(b.maxX - b.minX, b.maxY - b.minY), centroid: { x: cx / r.outer.length, y: cy / r.outer.length }, nested });
    for (const c of r.children) walk(c, true);
  };
  for (const n of nodes) walk(n, false);
  return out;
}

function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): { d: number; q: Vec2 } {
  const vx = b.x - a.x, vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + vx * t, y: a.y + vy * t };
  return { d: Math.hypot(p.x - q.x, p.y - q.y), q };
}

/** Closest pair of boundary points between two regions (outer + holes both sides). */
export function closestPoints(a: Region, b: Region): { d: number; p: Vec2; q: Vec2 } {
  const ca = [a.outer, ...a.holes];
  const cb = [b.outer, ...b.holes];
  let best = { d: Infinity, p: a.outer[0]!, q: b.outer[0]! };
  const scan = (from: readonly Contour[], to: readonly Contour[], swap: boolean): void => {
    for (const fc of from) {
      for (const p of fc) {
        for (const tc of to) {
          const n = tc.length;
          for (let i = 0; i < n; i++) {
            const r = pointSegmentDistance(p, tc[i]!, tc[(i + 1) % n]!);
            if (r.d < best.d) best = swap ? { d: r.d, p: r.q, q: p } : { d: r.d, p, q: r.q };
          }
        }
      }
    }
  };
  scan(ca, cb, false);
  scan(cb, ca, true);
  return best;
}

function bboxGap(a: Region, b: Region): number {
  const ba = bounds([a.outer]);
  const bb = bounds([b.outer]);
  const dx = Math.max(0, Math.max(ba.minX, bb.minX) - Math.min(ba.maxX, bb.maxX));
  const dy = Math.max(0, Math.max(ba.minY, bb.minY) - Math.min(ba.maxY, bb.maxY));
  return Math.hypot(dx, dy);
}

/** Curved band from p to q, extended a little into both pieces so the union fuses. */
export function connectorContour(p: Vec2, q: Vec2, width: number, curve: number): Contour {
  const dx = q.x - p.x, dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / len, uy = dy / len;
  const ext = width * 0.5 + 0.6;
  const from = { x: p.x - ux * ext, y: p.y - uy * ext };
  const to = { x: q.x + ux * ext, y: q.y + uy * ext };
  // Bend outward (away from the mandala center) so the band reads as a flowing vine.
  let bulge = curve * len;
  if (bulge > 0) {
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const nx = -uy, ny = ux;
    if (nx * mid.x + ny * mid.y < 0) bulge = -bulge;
  }
  const seg = bulgeSegment(from, to, bulge);
  const line = flattenPath([seg.start, seg.cp1, seg.cp2, seg.end], false, 0.02);
  const band = flattenRegions(strokeOpen(line, width, "round"));
  return band.length > 0 ? band.sort((a, b) => area(b.outer) - area(a.outer))[0]!.outer : [from, to];
}

/** Symmetry the connectors must respect: k-fold rotation about the origin, optionally a mirror axis. */
export interface SymmetryGroup {
  /** Rotational order (1 = none). */
  order: number;
  /** Direction (radians, screen convention) of a mirror axis through the origin, or null. */
  mirrorAxis: number | null;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function rotatePoint(p: Vec2, a: number): Vec2 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}
function mirrorPoint(p: Vec2, axis: number): Vec2 {
  const ux = Math.cos(axis), uy = Math.sin(axis);
  const d = p.x * ux + p.y * uy;
  return { x: 2 * d * ux - p.x, y: 2 * d * uy - p.y };
}
const mapRegion = (r: Region, f: (p: Vec2) => Vec2): Region => ({ outer: r.outer.map(f), holes: r.holes.map((h) => h.map(f)) });

/**
 * Symmetry of the design, derived from how it is built: every ring is a radial
 * repeat, so the rotational order is the gcd of the repeats (and the center
 * motif's petal count). A mirror axis exists when every ring mirrors its sector
 * (`mirrorLocal`) and all sector axes line up with one common axis. Orbit images
 * that would not land on material are dropped by the caller, so an optimistic
 * answer can never create floating bands.
 */
export function detectSymmetry(project: Project, _design?: readonly RegionNode[]): SymmetryGroup {
  const visible = project.rings.filter((r) => r.visible && r.elements.some((e) => e.visible));
  // A ring that only holds round shapes at the very center is symmetric under any rotation.
  const central = (r: Project["rings"][number]): boolean => r.radius === 0 && r.elements.every((e) => (e.type === "dot" || e.type === "circle") && e.x === 0 && e.y === 0 && e.repeat <= 1 && !(e.children && e.children.length > 0));
  const rings = visible.filter((r) => !central(r));
  let order = 0;
  for (const r of rings) order = gcd(order, Math.max(1, Math.round(r.repeat)));
  if (project.center.type !== "none") order = gcd(order, Math.max(1, Math.round(project.center.petals)));
  if (order <= 0) order = 1;
  let mirrorAxis: number | null = null;
  if (rings.length > 0 && rings.every((r) => r.mirrorLocal)) {
    const first = rings[0]!;
    const axisDeg = first.phase;
    const ok = rings.every((r) => {
      const half = 180 / Math.max(1, r.repeat);
      const d = ((((axisDeg - r.phase) % half) + half) % half);
      return d < 1e-6 || half - d < 1e-6;
    });
    if (ok) mirrorAxis = ((axisDeg - 90) * Math.PI) / 180;
  }
  return { order, mirrorAxis };
}

/** All images of a segment (p, q) under the group, deduplicated (endpoints order-free). */
function orbitOf(p: Vec2, q: Vec2, g: SymmetryGroup): { p: Vec2; q: Vec2 }[] {
  const out: { p: Vec2; q: Vec2 }[] = [];
  const seen = new Set<string>();
  const key = (a: Vec2, b: Vec2): string => {
    const ka = `${a.x.toFixed(2)},${a.y.toFixed(2)}`;
    const kb = `${b.x.toFixed(2)},${b.y.toFixed(2)}`;
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };
  const push = (a: Vec2, b: Vec2): void => {
    const k = key(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ p: a, q: b });
  };
  const bases = g.mirrorAxis === null ? [{ p, q }] : [{ p, q }, { p: mirrorPoint(p, g.mirrorAxis), q: mirrorPoint(q, g.mirrorAxis) }];
  for (const b of bases) for (let i = 0; i < g.order; i++) push(rotatePoint(b.p, (i * 2 * Math.PI) / g.order), rotatePoint(b.q, (i * 2 * Math.PI) / g.order));
  return out;
}

function pointRegionDistance(p: Vec2, r: Region): number {
  let best = Infinity;
  for (const c of [r.outer, ...r.holes]) {
    const n = c.length;
    for (let i = 0; i < n; i++) best = Math.min(best, pointSegmentDistance(p, c[i]!, c[(i + 1) % n]!).d);
  }
  return best;
}

export interface ConnectorResult {
  connectors: Connector[];
  material: RegionNode[];
  iterations: number;
}

/** Cheap coarsening for distance queries: keep at most `max` evenly spaced vertices. */
function decimate(c: Contour, max = 48): Contour {
  if (c.length <= max) return c;
  const step = c.length / max;
  const out: Vec2[] = [];
  for (let i = 0; i < max; i++) out.push(c[Math.floor(i * step)]!);
  return out;
}

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]!]!;
      i = this.parent[i]!;
    }
    return i;
  }
  union(a: number, b: number): void {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

/**
 * Join the pieces of `material` with short bands until one piece remains or no
 * pair is within `maxSpan`. Connectivity is tracked with union-find over the
 * original pieces (no boolean ops per round); each round joins every group to
 * its nearest other group, so a symmetric design gets symmetric connectors and
 * nested pieces (inside a hole) attach to the piece around them. The material is
 * unioned once at the end.
 */
export function generateConnectors(material: readonly RegionNode[], o: ConnectorOptions, group: SymmetryGroup = { order: 1, mirrorAxis: null }): ConnectorResult {
  const maxSpan = o.maxSpan ?? DEFAULT_MAX_SPAN;
  const maxIterations = o.maxIterations ?? 8;
  const curve = o.curve ?? 0.12;
  const comps = materialComponents(material);
  const n = comps.length;
  const connectors: Connector[] = [];
  if (n <= 1) return { connectors, material: [...material], iterations: 0 };
  const coarse: Region[] = comps.map((c) => ({ outer: decimate(c.region.outer), holes: c.region.holes.map((h) => decimate(h, 32)) }));
  // Bounding boxes from the full contours (the decimated copies can be smaller than the real piece).
  const box = comps.map((c) => bounds([c.region.outer]));
  const gapOf = (i: number, j: number): number => {
    const a = box[i]!, b = box[j]!;
    const dx = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
    const dy = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
    return Math.hypot(dx, dy);
  };
  // Nested pieces: the surrounding piece's hole is their boundary too, so the bbox gap is 0 — handled by gapOf.
  const uf = new UnionFind(n);
  /** Piece a point lies on (within 1 mm), by bbox prefilter then boundary distance. */
  const pieceAt = (pt: Vec2): number => {
    let bi = -1, bd = 1.5;
    for (let k = 0; k < n; k++) {
      const b = box[k]!;
      if (pt.x < b.minX - 1.5 || pt.x > b.maxX + 1.5 || pt.y < b.minY - 1.5 || pt.y > b.maxY + 1.5) continue;
      const d = pointRegionDistance(pt, comps[k]!.region);
      if (d < bd) {
        bd = d;
        bi = k;
      }
    }
    return bi;
  };
  const addOrbit = (i: number, j: number, p: Vec2, q: Vec2, tag: string): void => {
    // Every image of the connector under the design's symmetry is added too, so the
    // reinforcement never breaks the symmetry; images join the pieces they land on.
    for (const im of orbitOf(p, q, group)) {
      const original = im.p === p && im.q === q;
      const a = original ? i : pieceAt(im.p);
      const b = original ? j : pieceAt(im.q);
      if (a < 0 || b < 0) continue; // the design is not as symmetric as assumed: skip this image
      const contour = connectorContour(im.p, im.q, o.width, curve);
      connectors.push({ id: `conn-${tag}-${connectors.length}`, from: im.p, to: im.q, width: o.width, contour, auto: true });
      uf.union(a, b);
    }
  };
  let iterations = 0;
  let groups = n;
  for (; iterations < maxIterations && groups > 1; iterations++) {
    let addedThisRound = 0;
    for (let i = 0; i < n; i++) {
      const ri = uf.find(i);
      const cands: { j: number; gap: number }[] = [];
      for (let j = 0; j < n; j++) {
        if (j === i || uf.find(j) === ri) continue;
        const gap = gapOf(i, j);
        if (gap <= maxSpan) cands.push({ j, gap });
      }
      if (cands.length === 0) continue;
      cands.sort((a, b) => a.gap - b.gap);
      let found: { j: number; p: Vec2; q: Vec2; d: number } | null = null;
      for (const c of cands.slice(0, 5)) {
        if (found && c.gap >= found.d) break;
        const r = closestPoints(coarse[i]!, coarse[c.j]!);
        if (r.d <= maxSpan && (!found || r.d < found.d)) found = { j: c.j, p: r.p, q: r.q, d: r.d };
      }
      if (!found) continue;
      // Refine on the full contours so the band really lands on both boundaries.
      const exact = closestPoints(comps[i]!.region, comps[found.j]!.region);
      addOrbit(i, found.j, exact.p, exact.q, `${iterations}`);
      addedThisRound++;
    }
    if (addedThisRound === 0) break;
    const roots = new Set<number>();
    for (let i = 0; i < n; i++) roots.add(uf.find(i));
    groups = roots.size;
  }
  const merged = connectors.length > 0 ? union([...flattenRegions(material).map((r) => ({ outer: r.outer, holes: r.holes })), ...connectors.map((c) => ({ outer: c.contour, holes: [] }))]) : [...material];
  return { connectors, material: merged, iterations };
}

function emptyStencil(apertures: RegionNode[], islandsBefore: Island[], overflow: boolean): StencilGeometry {
  return { apertures, islandsBefore, bridges: [] as Bridge[], final: apertures, islands: islandsBefore, overflow };
}

/** Build design / material / cut geometry for the project's output polarity. */
export function buildOutput(project: Project, geometry: MandalaGeometry): OutputGeometry {
  const sheet = sheetRegion(project.sheet);
  if (project.output.polarity === "stencil") {
    const stencil = buildStencil(project, geometry);
    const material = difference([sheet], flattenRegions(stencil.final));
    return {
      polarity: "stencil",
      designGeometry: stencil.apertures,
      materialGeometry: material,
      cutGeometry: stencil.final,
      stencil,
      connectors: [],
      componentsBefore: [],
      components: [],
      overflow: stencil.overflow,
    };
  }
  const unioned = unionApertures(geometry);
  const hw = project.sheet.width / 2;
  const hh = project.sheet.height / 2;
  let overflow = false;
  for (const r of unioned) for (const p of r.outer) if (Math.abs(p.x) > hw + 1e-6 || Math.abs(p.y) > hh + 1e-6) overflow = true;
  const design = overflow ? intersection(unioned, [sheet]) : unioned;
  const componentsBefore = materialComponents(design);
  let material: RegionNode[] = design;
  let connectors: Connector[] = [];
  if (project.output.autoConnect && componentsBefore.length > 1) {
    const width = Math.max(project.output.minConnectionWidth, project.constraints.minFeatureWidth);
    const r = generateConnectors(design, { width, maxSpan: project.output.maxConnectorSpan }, detectSymmetry(project, design));
    connectors = r.connectors;
    material = r.material;
  }
  const components = materialComponents(material);
  return {
    polarity: "positive",
    designGeometry: design,
    materialGeometry: material,
    cutGeometry: material,
    stencil: emptyStencil(design, findIslands(design), overflow),
    connectors,
    componentsBefore,
    components,
    overflow,
  };
}

/** Area of all material (mm²). */
export const materialArea = (o: OutputGeometry): number => regionArea(flattenRegions(o.materialGeometry));

/** Positive mode: pieces other than the main (largest) one. */
export function strayComponents(components: readonly MaterialComponent[]): MaterialComponent[] {
  if (components.length <= 1) return [];
  const main = components.reduce((m, c) => (c.area > m.area ? c : m), components[0]!);
  return components.filter((c) => c !== main);
}

/** True when the material of `o` contains the mandala center. */
export const materialCoversCenter = (o: OutputGeometry): boolean => flattenRegions(o.materialGeometry).some((r) => containsPoint(r.outer, { x: 0, y: 0 }) && !r.holes.some((h) => containsPoint(h, { x: 0, y: 0 })));
