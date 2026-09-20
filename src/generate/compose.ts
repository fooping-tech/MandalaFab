/**
 * Ornamental Composition Engine.
 *
 * A sector is composed with a grammar, not filled at random:
 *   Primary motif (1, nested)  →  Flow curves (spines leaving the primary, 2–6)
 *   →  Secondary motifs on / beside the spines (2–5)  →  Fillers (dots, drops)
 *   →  Boundary connections (curves ending on the sector boundary with a tangent
 *      perpendicular to it, so the mirrored / rotated neighbour continues them).
 *
 * Every placement is collision-checked (packing) against what is already in the
 * sector, its mirror image, the sector boundaries and the previous band's
 * geometry, so cut shapes never fuse by accident and no pockets of material get
 * enclosed. Bands overlap radially (interlock) with alternating phase so the axis
 * tip of one band reaches between the primaries of the next.
 *
 * Sector coordinates: +x outward, +y tangential, origin at ring.radius on the
 * sector axis, mandala center at (-R, 0).
 */
import { emptyProject, newElement, newId, type CenterMotif, type CompoundMotif, type ElementType, type OrnamentRole, type Project, type Ring, type SectorElement } from "../model/project";
import { buildSector, elementLocalRegions, elementTransform, mirrorRegionY, transformRegion } from "../geometry/elements/sector";
import { generateRing } from "../geometry/radial/mandala";
import { instanceTransform } from "../geometry/radial/repeat";
import { invertTransform } from "../geometry/radial/transform";
import { intersection, offset, regionArea } from "../geometry/boolean";
import type { Region, Vec2 } from "../geometry/types";
import { bounds } from "../geometry/vec";
import { mulberry32 } from "./random";

// ---------------------------------------------------------------------------
// Sector context with packing
// ---------------------------------------------------------------------------

export interface BandLayout {
  index: number;
  inner: number;
  outer: number;
  repeat: number;
  phase: number;
  interlock: number;
}

/** A user part (マイパーツ element) offered to the composer. */
export interface PartCandidate {
  id: string;
  name: string;
  element: SectorElement;
  /** Compound motifs the element references (already merged into the project being composed). */
  compounds: CompoundMotif[];
  /** Relative pick weight (0 = excluded). */
  weight: number;
}

export interface PartsSettings {
  candidates: PartCandidate[];
  /** Probability that a user part is tried at each primary / secondary / filler opportunity, 0..1. */
  frequency: number;
}

export interface ComposeSettings {
  symmetry: number;
  density: number;
  /** User parts to mix in (optional). */
  parts?: PartsSettings;
  /** Compound motifs available while building candidate regions. */
  compounds?: readonly CompoundMotif[];
  /** Minimum material gap to keep between separate cut shapes (mm). */
  gap: number;
  /** Material left at sector boundaries between connected curves (mm). */
  boundaryGap: number;
  minFeatureWidth: number;
  /** Nothing may extend beyond this distance from the mandala center (mm). */
  maxRho: number;
}

export interface AddOptions {
  /** Attach to existing geometry on purpose (no collision check). */
  attach?: boolean;
  /** Try to move the element a little when it collides (default true). */
  nudge?: boolean;
}

const r1 = (v: number): number => Math.round(v * 100) / 100;

export class SectorContext {
  readonly R: number;
  readonly theta: number;
  readonly range: number;
  readonly elements: SectorElement[] = [];
  /** Occupied regions in the sector frame (including mirror copies and the previous band). */
  private placed: Region[] = [];
  dropped = 0;
  constructor(
    readonly band: BandLayout,
    readonly rng: () => number,
    readonly settings: ComposeSettings,
    obstacles: Region[] = [],
  ) {
    this.R = (band.inner + band.outer) / 2;
    this.theta = Math.PI / band.repeat;
    this.range = band.outer - band.inner;
    this.placed = [...obstacles];
  }
  get density(): number {
    return this.settings.density;
  }
  rnd(a: number, b: number): number {
    return Math.round((a + (b - a) * this.rng()) * 10) / 10;
  }
  axis(rho: number): Vec2 {
    return { x: rho - this.R, y: 0 };
  }
  polar(rho: number, v: number): Vec2 {
    const a = v * this.theta;
    return { x: -this.R + rho * Math.cos(a), y: rho * Math.sin(a) };
  }
  boundary(rho: number): Vec2 {
    return this.polar(rho, 1);
  }
  get boundaryNormal(): Vec2 {
    return { x: Math.sin(this.theta), y: -Math.cos(this.theta) };
  }
  outward(p: Vec2): Vec2 {
    const dx = p.x + this.R;
    const l = Math.hypot(dx, p.y) || 1;
    return { x: dx / l, y: p.y / l };
  }
  halfWidth(rho: number): number {
    return rho * this.theta;
  }
  rho(u: number): number {
    return this.band.inner + this.range * u;
  }
  /** Signed distance to the +θ boundary (positive inside the sector). */
  boundaryDistance(p: Vec2): number {
    const n = this.boundaryNormal;
    const b = this.boundary(1);
    return (p.x - b.x) * n.x + (p.y - b.y) * n.y;
  }
  static angleDeg(d: Vec2): number {
    return (Math.atan2(d.y, d.x) * 180) / Math.PI;
  }

  /** Sector-frame regions of an element (all local copies, no mirror). */
  regionsOf(el: SectorElement): Region[] {
    if (hasCompound(el)) {
      // Compound references need the project's compounds: build a one-element sector.
      const ring: Ring = { id: "tmp", name: "tmp", visible: true, radius: this.R, repeat: this.band.repeat, phase: 0, mirrorLocal: false, elements: [el] };
      const res = buildSector(ring, { compounds: [...(this.settings.compounds ?? [])], constraints: { minFeatureWidth: this.settings.minFeatureWidth, minBridgeWidth: 1, minGap: this.settings.gap, minHoleDiameter: 1 } });
      return res.elements.filter((e) => e.mode === "cut").flatMap((e) => e.regions);
    }
    const worldR = Math.hypot(el.x + this.R, el.y);
    const local = elementLocalRegions(el, worldR, this.settings.minFeatureWidth, []);
    const t = elementTransform(el, this.R);
    return local.map((r) => transformRegion(r, t));
  }

  // ---- user parts ------------------------------------------------------------

  private partInfo = new Map<string, { length: number; width: number; cx: number; cy: number; symmetric: boolean }>();

  /** Size (bounding box in mm at scale 1, rotation 0) and axis symmetry of a candidate, cached. */
  partSize(cand: PartCandidate): { length: number; width: number; cx: number; cy: number; symmetric: boolean } {
    const hit = this.partInfo.get(cand.id);
    if (hit) return hit;
    const probe = { ...cand.element, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, mirror: false, repeat: 1 } as SectorElement;
    const regs = this.regionsOf(probe);
    let info = { length: Math.max(1, cand.element.length), width: Math.max(1, cand.element.width), cx: 0, cy: 0, symmetric: false };
    if (regs.length > 0) {
      const b = bounds(regs.map((r) => r.outer));
      const area = regionArea(regs);
      const overlap = area > 0 ? regionArea(intersection(regs, regs.map(mirrorRegionY))) / area : 0;
      info = { length: Math.max(1, b.maxX - b.minX), width: Math.max(1, b.maxY - b.minY), cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, symmetric: overlap > 0.97 };
    }
    this.partInfo.set(cand.id, info);
    return info;
  }

  /**
   * Decide whether a user part is used at this opportunity (probability = frequency)
   * and pick one by weight. Consumes the rng only when parts are configured, so
   * compositions without parts are unchanged.
   */
  pickPart(): PartCandidate | null {
    const parts = this.settings.parts;
    if (!parts || parts.frequency <= 0) return null;
    const pool = parts.candidates.filter((c) => c.weight > 0);
    if (pool.length === 0) return null;
    if (this.rng() >= parts.frequency) return null;
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let r = this.rng() * total;
    for (const c of pool) {
      r -= c.weight;
      if (r <= 0) return c;
    }
    return pool[pool.length - 1]!;
  }

  /**
   * A copy of the part element scaled so its bounding length is `targetLength`
   * (uniform scale, children included), placed at `x, y` with `rotation` added to
   * the saved one. Fresh ids for the element and its children.
   */
  partElement(cand: PartCandidate, role: OrnamentRole, spot: { x: number; y: number; rotation: number; targetLength: number; maxWidth?: number }): SectorElement {
    const info = this.partSize(cand);
    let s = spot.targetLength / info.length;
    if (spot.maxWidth !== undefined) s = Math.min(s, spot.maxWidth / info.width);
    s = Math.max(0.15, Math.min(4, s));
    const renew = (e: SectorElement): SectorElement => {
      const copy = { ...e, id: newId("e"), params: { ...e.params } } as SectorElement;
      if (copy.children && copy.children.length > 0) copy.children = copy.children.map(renew);
      return copy;
    };
    const el = renew(cand.element);
    return { ...el, name: cand.name, role, x: r1(spot.x), y: r1(spot.y), rotation: r1(spot.rotation + cand.element.rotation), scaleX: r1(cand.element.scaleX * s), scaleY: r1(cand.element.scaleY * s), repeat: 1 } as SectorElement;
  }

  /** Try to place a user part like `add()` (collision-checked, nudged). */
  addPart(cand: PartCandidate, role: OrnamentRole, spot: { x: number; y: number; rotation: number; targetLength: number; maxWidth?: number }, opts: AddOptions = {}): SectorElement | null {
    return this.place(this.partElement(cand, role, spot), opts);
  }

  /**
   * True when the candidate regions keep `gap` from everything placed, from both
   * boundaries, from the reserved interlock zones (where the neighbouring bands'
   * primaries sit) and, for asymmetric elements, from their own mirror image.
   */
  fits(regions: Region[], gap: number, symmetricOnAxis = false): boolean {
    if (regions.length === 0) return false;
    const grown = offset(regions, gap / 2, "square");
    const maxRho2 = this.settings.maxRho * this.settings.maxRho;
    const outHi = this.band.outer - this.band.interlock - gap * 0.5;
    const inLo = this.band.inner + this.band.interlock + gap * 0.5;
    for (const r of grown) {
      for (const p of r.outer) {
        if (this.boundaryDistance(p) < 0) return false;
        if (this.boundaryDistance({ x: p.x, y: -p.y }) < 0) return false;
        const dx = p.x + this.R;
        const rho2 = dx * dx + p.y * p.y;
        if (rho2 > maxRho2) return false;
        // Reserved zones near the boundary at both radial ends: the neighbouring bands' axis
        // elements (previous tip, next primary base) interlock there.
        const v = Math.abs(Math.atan2(p.y, dx)) / this.theta;
        if (v > 0.45 && (rho2 > outHi * outHi || rho2 < inLo * inLo)) return false;
      }
    }
    if (!symmetricOnAxis) {
      const mirrored = regions.map(mirrorRegionY);
      if (regionArea(intersection(grown, mirrored)) > 1e-3) return false;
    }
    if (this.placed.length === 0) return true;
    const b = bounds(grown.map((g) => g.outer));
    const near = this.placed.filter((q) => {
      const qb = bounds([q.outer]);
      return !(qb.maxX < b.minX || qb.minX > b.maxX || qb.maxY < b.minY || qb.minY > b.maxY);
    });
    if (near.length === 0) return true;
    return regionArea(intersection(grown, near)) < 1e-3;
  }

  /** Elements whose mirror image coincides with themselves when placed on the axis. */
  private static isAxisSymmetric(el: SectorElement): boolean {
    if (Math.abs(el.y) > 1e-6 || Math.abs(((el.rotation % 180) + 180) % 180) > 1e-6) return false;
    const symmetricTypes = new Set<ElementType>(["teardrop", "leaf", "petal", "dot", "circle", "arc", "shape"]);
    if (!symmetricTypes.has(el.type)) return false;
    return (el.params.curvature ?? 0) === 0 && (el.params.bend ?? 0) === 0;
  }

  private commit(el: SectorElement, regions: Region[]): SectorElement {
    this.elements.push(el);
    this.placed.push(...regions, ...regions.map(mirrorRegionY));
    return el;
  }
  commitPublic(el: SectorElement, regions: Region[]): SectorElement {
    return this.commit(el, regions);
  }

  /**
   * Add an element. Unless `attach`, the element must not collide; when it does
   * it is nudged along a few directions and dropped if no free spot is found.
   */
  add(role: OrnamentRole, type: ElementType, partial: Partial<SectorElement>, opts: AddOptions = {}): SectorElement | null {
    const el = newElement(type, { ...partial, role, id: newId("e") } as Partial<SectorElement>);
    return this.place(el, opts);
  }

  /** Collision-checked placement of a ready-made element (see `add`). */
  place(el: SectorElement, opts: AddOptions = {}): SectorElement | null {
    let regions = this.regionsOf(el);
    if (opts.attach) return this.commit(el, regions);
    const gap = this.settings.gap;
    const sym = SectorContext.isAxisSymmetric(el);
    if (this.fits(regions, gap, sym)) return this.commit(el, regions);
    if (opts.nudge === false) {
      this.dropped++;
      return null;
    }
    const out = this.outward({ x: el.x, y: el.y });
    const tan = { x: -out.y, y: out.x };
    const dirs: Vec2[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      dirs.push({ x: out.x * Math.cos(a) - tan.x * Math.sin(a) + 0, y: out.y * Math.cos(a) - tan.y * Math.sin(a) });
      // (rotating the outward vector by k·45° in the local outward/tangent frame)
      const d = dirs[dirs.length - 1]!;
      const l = Math.hypot(d.x, d.y) || 1;
      dirs[dirs.length - 1] = { x: d.x / l, y: d.y / l };
    }
    for (const scale of [1, 0.8]) {
      for (const d of [0, 1.2, 2.5, 4, 6]) {
        for (const dir of dirs) {
          if (d === 0 && dir !== dirs[0]) continue;
          const moved = resized({ ...el, x: r1(el.x + dir.x * d), y: r1(el.y + dir.y * d) } as SectorElement, scale);
          if (scale === 1 && d === 0) continue;
          regions = this.regionsOf(moved);
          if (this.fits(regions, gap, sym)) return this.commit(moved, regions);
        }
      }
    }
    this.dropped++;
    return null;
  }
}

/** True when the element (or a nested child) references a compound motif. */
function hasCompound(el: SectorElement): boolean {
  if (el.type === "compound") return true;
  return !!el.children && el.children.some(hasCompound);
}

/**
 * Shrink an element by `scale`: nested user parts scale uniformly (children follow),
 * plain elements scale their length / width.
 */
function resized(el: SectorElement, scale: number): SectorElement {
  if (scale === 1) return el;
  if (el.children && el.children.length > 0) return { ...el, scaleX: r1(el.scaleX * scale), scaleY: r1(el.scaleY * scale) } as SectorElement;
  return { ...el, length: r1(el.length * scale), width: r1(el.width * scale) } as SectorElement;
}

/**
 * Place a primary motif: it must clear the obstacles (previous band, center) and,
 * for off-axis primaries, its own mirror image. It is pushed outward / sideways
 * and shrunk a little until it fits; the final element is returned.
 */
function placePrimary(ctx: SectorContext, role: OrnamentRole, type: ElementType, partial: Partial<SectorElement>, offAxis: boolean): SectorElement {
  const base = newElement(type, { ...partial, role, id: newId("e") } as Partial<SectorElement>);
  const placed = placePrimaryElement(ctx, base, offAxis);
  if (placed) return placed;
  const small = { ...partial, length: r1((partial.length ?? 10) * 0.55), width: r1((partial.width ?? 5) * 0.55) };
  return ctx.add(role, type, small, { attach: true })!;
}

/** Shrink / shift loop shared by built-in and user-part primaries. Null when nothing fits. */
function placePrimaryElement(ctx: SectorContext, base: SectorElement, offAxis: boolean): SectorElement | null {
  for (const scale of [1, 0.92, 0.84, 0.76, 0.68, 0.6]) {
    for (const shift of [0, 0.6, 1.2, 1.8, 2.5, 3.2, 4, -0.6, -1.2]) {
      const cand = resized({ ...base, x: r1(base.x + (offAxis ? 0 : shift)), y: r1(base.y + (offAxis ? shift : 0)) } as SectorElement, scale);
      const regions = ctx.regionsOf(cand);
      if (ctx.fits(regions, ctx.settings.gap, !offAxis)) return ctx.commitPublic(cand, regions);
    }
  }
  return null;
}

/**
 * User part as the primary motif. Axis-symmetric parts sit on the axis; asymmetric
 * ones go to the y > 0 side so the sector mirror makes a facing pair (like the paisley).
 * Falls back to the built-in primary when the part cannot be placed.
 */
function primaryPart(ctx: SectorContext, cand: PartCandidate, fallback: () => PrimarySpec): PrimarySpec {
  const u0 = 0.05;
  const u1 = 0.98;
  const L = ctx.range * (u1 - u0);
  const rhoBelly = ctx.rho(u0 + 0.35 * (u1 - u0));
  const info = ctx.partSize(cand);
  const gap = ctx.settings.gap;
  const offAxis = !info.symmetric;
  const W = offAxis ? Math.max(3, Math.min(ctx.halfWidth(rhoBelly) - 1.8 * gap, L * 0.6)) : primaryWidthLimit(ctx, rhoBelly, L);
  const s = Math.max(0.15, Math.min(4, Math.min(L / info.length, W / info.width)));
  const width = info.width * s;
  const el = ctx.partElement(cand, "primary", { x: ctx.axis(ctx.rho((u0 + u1) / 2)).x - info.cx * s, y: offAxis ? width / 2 + gap * 0.9 - info.cy * s : 0, rotation: 0, targetLength: info.length * s });
  const placed = placePrimaryElement(ctx, el, offAxis);
  if (!placed) return fallback();
  const k = placed.scaleX / Math.max(1e-6, cand.element.scaleX);
  const len = info.length * k;
  const hw = (info.width * k) / 2;
  const cx = placed.x + info.cx * k;
  const cy = placed.y + info.cy * k;
  const base = { x: cx - len / 2, y: cy };
  const tip = { x: cx + len / 2, y: cy };
  return { el: placed, base, tip, halfWidth: hw + Math.max(0, cy), shoulder: { x: base.x + len * 0.3, y: cy + hw + ctx.settings.gap * 0.6 }, shoulderTangent: { x: 0.25, y: 0.97 }, attachable: false };
}

/** The primary for a template: a user part when the frequency roll says so, else the built-in. */
function primaryFor(ctx: SectorContext, fallback: () => PrimarySpec): PrimarySpec {
  const cand = ctx.pickPart();
  return cand ? primaryPart(ctx, cand, fallback) : fallback();
}

// ---------------------------------------------------------------------------
// Flow spines
// ---------------------------------------------------------------------------

export interface Spine {
  points: [Vec2, Vec2, Vec2, Vec2];
  at(t: number): Vec2;
  tangent(t: number): Vec2;
  normal(t: number): Vec2;
}

export function spine(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Spine {
  const at = (t: number): Vec2 => {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    };
  };
  const tangent = (t: number): Vec2 => {
    const mt = 1 - t;
    const x = 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
    const y = 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };
  return { points: [p0, p1, p2, p3], at, tangent, normal: (t) => ({ x: -tangent(t).y, y: tangent(t).x }) };
}

export function spineWithTangents(a: Vec2, ta: Vec2, b: Vec2, tb: Vec2, ka: number, kb: number): Spine {
  return spine(a, { x: a.x + ta.x * ka, y: a.y + ta.y * ka }, { x: b.x - tb.x * kb, y: b.y - tb.y * kb }, b);
}

/**
 * Boundary-aware spine: from `from` (tangent `tFrom`) to a point `gapHalf`
 * inside the +θ boundary at distance rho, arriving perpendicular to the boundary.
 * mirrorLocal + rotation == reflection across the boundary, so the neighbour's
 * copy continues it with C1 continuity across a material bridge of 2·gapHalf.
 */
export function boundarySpine(ctx: SectorContext, from: Vec2, tFrom: Vec2, rho: number, gapHalf: number, handle = 0.45): Spine {
  const n = ctx.boundaryNormal;
  const b = ctx.boundary(rho);
  const end = { x: b.x + n.x * gapHalf, y: b.y + n.y * gapHalf };
  const dist = Math.hypot(end.x - from.x, end.y - from.y);
  return spineWithTangents(from, tFrom, end, { x: -n.x, y: -n.y }, dist * handle, dist * handle);
}

export const boundaryDistance = (ctx: SectorContext, p: Vec2): number => ctx.boundaryDistance(p);

function addSpine(ctx: SectorContext, role: OrnamentRole, sp: Spine, width: number, taper: number, name: string, opts: AddOptions = {}): SectorElement | null {
  return ctx.add(role, "bezier", { name, x: 0, y: 0, points: sp.points.map((p) => ({ x: r1(p.x), y: r1(p.y) })), closed: false, strokeWidth: r1(width), params: { taper } } as Partial<SectorElement>, opts);
}

interface OnSpine {
  side?: number;
  offset?: number;
  angle?: number;
  along?: number;
  length: number;
  width: number;
  name?: string;
  params?: Record<string, number>;
  strokeWidth?: number;
}

function placeOnSpine(ctx: SectorContext, role: OrnamentRole, sp: Spine, t: number, type: ElementType, o: OnSpine): SectorElement | null {
  const p = sp.at(t);
  const n = sp.normal(t);
  const tg = sp.tangent(t);
  const side = o.side ?? 1;
  const off = (o.offset ?? 0) * side;
  const along = o.along ?? 0;
  const pos = { x: p.x + n.x * off + tg.x * along, y: p.y + n.y * off + tg.y * along };
  const rot = SectorContext.angleDeg(tg) + (o.angle ?? 0) * side;
  // Secondary slots on a vine are where user parts show best: try one first (frequency roll).
  if (role === "secondary") {
    const cand = ctx.pickPart();
    if (cand) {
      const placed = ctx.addPart(cand, role, { x: r1(pos.x), y: r1(pos.y), rotation: r1(rot), targetLength: r1(o.length), maxWidth: r1(o.width * 1.4) });
      if (placed) return placed;
    }
  }
  return ctx.add(role, type, { name: o.name ?? type, x: r1(pos.x), y: r1(pos.y), rotation: r1(rot), length: r1(o.length), width: r1(o.width), strokeWidth: o.strokeWidth ?? 0, params: o.params ?? {} } as Partial<SectorElement>);
}

// ---------------------------------------------------------------------------
// Grammar: primaries
// ---------------------------------------------------------------------------

interface PrimarySpec {
  el: SectorElement;
  base: Vec2;
  tip: Vec2;
  halfWidth: number;
  /** Shoulder on the y >= 0 side where flow curves start, with their initial direction. */
  shoulder: Vec2;
  shoulderTangent: Vec2;
  /** False for user parts: attached curves must pass the collision check so they cannot slice the part's interior. */
  attachable?: boolean;
}

/** Largest primary width that leaves `gap` to the previous band's tip at the boundary. */
function primaryWidthLimit(ctx: SectorContext, rhoBelly: number, L: number): number {
  const hw = ctx.halfWidth(rhoBelly);
  return Math.max(3, Math.min(2 * (hw - ctx.settings.gap - 1.5), L * 0.55));
}

/** Nested primary: bordered outer shape (stem-attached inner material) with a different inner motif. */
function primaryNested(ctx: SectorContext, kind: "teardrop" | "lotus" | "leaf"): PrimarySpec {
  const u0 = 0.05;
  const u1 = 1.0;
  const L = ctx.range * (u1 - u0);
  const rhoBelly = ctx.rho(u0 + 0.35 * (u1 - u0));
  const W = primaryWidthLimit(ctx, rhoBelly, L);
  const inset = Math.max(1.3, Math.min(2.2, W * 0.15));
  const gap = ctx.settings.gap;
  const innerType: ElementType = kind === "lotus" ? "petal" : kind === "leaf" ? "leaf" : "teardrop";
  // Inner material: the outer shape offset by `inset`; its sharp tip retracts ~2.5 insets.
  // A leaf is pointed at both ends, so its inner material retracts at the base too.
  const innerBase = -L / 2 + (kind === "leaf" ? inset * 2.6 : inset);
  const innerTip = L / 2 - inset * 2.6;
  const childL = innerTip - innerBase - 2 * gap - 0.8;
  const childW = Math.max(1.4, W - 2 * inset - 2 * gap - 0.6) * 0.72;
  const children: SectorElement[] = [];
  if (childL > 4 && childW > 1.6) {
    const cx = innerBase + gap + 0.4 + childL / 2;
    children.push(newElement(innerType, { name: `inner ${innerType}`, x: r1(cx), y: 0, length: r1(childL), width: r1(childW), mode: "cut", params: innerType === "petal" ? { bulge: 1, shoulder: 0.35 } : innerType === "leaf" ? { tipSharpness: 0.9, bend: 0 } : { tipSharpness: 0.9, curvature: 0 } }));
  }
  const el = placePrimary(
    ctx,
    "primary",
    kind === "leaf" ? "leaf" : "teardrop",
    {
      name: kind === "lotus" ? "lotus" : `large ${kind}`,
      x: r1(ctx.axis(ctx.rho((u0 + u1) / 2)).x),
      y: 0,
      length: r1(L),
      width: r1(W),
      inset: r1(inset),
      insetStem: r1(Math.max(1.8, gap + 0.9)),
      params: kind === "lotus" ? { tipSharpness: 0.95, curvature: 0 } : kind === "leaf" ? { tipSharpness: 0.85, bend: 0 } : { tipSharpness: 0.82, curvature: 0 },
      children,
    } as Partial<SectorElement>,
    false,
  );
  const base = { x: el.x - el.length / 2, y: 0 };
  const tip = { x: el.x + el.length / 2, y: 0 };
  const shoulder = { x: base.x + el.length * 0.3, y: el.width * 0.5 - 0.3 };
  return { el, base, tip, halfWidth: el.width / 2, shoulder, shoulderTangent: { x: 0.25, y: 0.97 } };
}

/**
 * True paisley primary: placed on the y > 0 side with its tip curling toward the
 * axis, so the sector mirror produces a facing pair (a classic paisley "heart").
 */
function primaryPaisley(ctx: SectorContext): PrimarySpec {
  const u0 = 0.05;
  const u1 = 0.98;
  const L = ctx.range * (u1 - u0);
  const rhoBelly = ctx.rho(u0 + 0.35 * (u1 - u0));
  const gap = ctx.settings.gap;
  // The pair (paisley + mirror) must fit between the axis and the boundary, curl included.
  const W = Math.max(3, Math.min(ctx.halfWidth(rhoBelly) - 1.8 * gap, L * 0.6));
  const inset = Math.max(1.3, Math.min(2, W * 0.15));
  const y = W / 2 + gap * 0.9;
  const el = placePrimary(
    ctx,
    "primary",
    "paisley",
    {
      name: "paisley",
      x: r1(ctx.axis(ctx.rho((u0 + u1) / 2)).x),
      y: r1(y),
      rotation: -6,
      length: r1(L),
      width: r1(W),
      insetStem: r1(Math.max(1.8, gap + 0.9)),
      params: { belly: 0.5, curlRadius: 0, curlAmount: 0.65, tipSharpness: 0.75, innerInset: r1(inset), innerCurl: W > 8 ? 0.8 : 0, direction: -1 },
    } as Partial<SectorElement>,
    true,
  );
  const base = { x: el.x - el.length / 2, y: el.y };
  const tip = { x: el.x + el.length / 2, y: el.y };
  const shoulder = { x: base.x + el.length * 0.28, y: el.y + el.width * 0.5 - 0.4 };
  return { el, base, tip, halfWidth: el.width / 2 + el.y, shoulder, shoulderTangent: { x: 0.2, y: 0.98 } };
}

// ---------------------------------------------------------------------------
// Grammar: flows, secondaries, fillers
// ---------------------------------------------------------------------------

const bandWidth = (ctx: SectorContext): number => Math.max(1.3, Math.min(2.4, ctx.range * 0.085));

/** Vine from the primary shoulder to the boundary (attached at the shoulder), decorated along its length. */
function shoulderVine(ctx: SectorContext, pr: PrimarySpec, uEnd: number, width: number, deco: { leaf?: boolean; drop?: boolean; hook?: boolean; dots?: number }): Spine {
  const sp = boundarySpine(ctx, pr.shoulder, pr.shoulderTangent, ctx.rho(uEnd), ctx.settings.boundaryGap / 2, 0.42);
  addSpine(ctx, "boundary", sp, width, 0.45, "vine to boundary", { attach: pr.attachable !== false });
  const L = ctx.range;
  // Left normal of a spine that leaves the primary toward +y points away from the primary.
  if (deco.leaf) placeOnSpine(ctx, "secondary", sp, 0.4, "leaf", { side: 1, offset: L * 0.19, angle: 50, length: L * 0.34, width: L * 0.13, name: "leaf on vine", params: { tipSharpness: 0.85, bend: 0.25 } });
  if (deco.drop) placeOnSpine(ctx, "secondary", sp, 0.72, "teardrop", { side: 1, offset: L * 0.17, angle: 65, length: L * 0.26, width: L * 0.12, name: "drop on vine", params: { tipSharpness: 0.8, curvature: 0 } });
  if (deco.hook) placeOnSpine(ctx, "flow", sp, 0.58, "hook", { side: 1, offset: L * 0.1, angle: 20, length: L * 0.3, width: L * 0.16, name: "hook on vine", strokeWidth: width * 0.8, params: { tip: 0.35, turns: 0.75, direction: -1 } });
  for (let i = 0; i < (deco.dots ?? 0); i++) placeOnSpine(ctx, "filler", sp, 0.22 + 0.3 * i, "dot", { side: -1, offset: L * 0.11, length: 1.9, width: 1.9, name: "dot" });
  return sp;
}

/** Flow curve hugging the primary base on the y >= 0 side. */
function baseScroll(ctx: SectorContext, pr: PrimarySpec, width: number, type: "ccurve" | "hook" | "doublecurl" | "opposedcurl"): void {
  const L = ctx.range;
  const gap = ctx.settings.gap;
  const y = pr.halfWidth * 0.6 + gap + L * 0.12;
  if (type === "opposedcurl") {
    ctx.add("flow", type, { name: "base scroll", x: r1(pr.base.x + L * 0.14), y: r1(y + L * 0.06), rotation: 118, length: r1(L * 0.4), width: r1(L * 0.28), strokeWidth: r1(width), params: { tip: 0.35, turns: 0.75 } } as Partial<SectorElement>);
  } else if (type === "doublecurl") {
    ctx.add("flow", type, { name: "arch scroll", x: r1(pr.base.x + L * 0.12), y: r1(y + L * 0.04), rotation: 95, length: r1(L * 0.44), width: r1(L * 0.2), strokeWidth: r1(width), params: { tip: 0.35, turns: 0.75 } } as Partial<SectorElement>);
  } else if (type === "hook") {
    ctx.add("flow", type, { name: "base hook", x: r1(pr.base.x + L * 0.02), y: r1(y), rotation: 150, length: r1(L * 0.32), width: r1(L * 0.15), strokeWidth: r1(width), params: { tip: 0.35, turns: 0.75, direction: 1 } } as Partial<SectorElement>);
  } else {
    ctx.add("flow", type, { name: "base c-curve", x: r1(pr.base.x + L * 0.08), y: r1(y), rotation: 100, length: r1(L * 0.34), width: r1(L * 0.12), strokeWidth: r1(width), params: { tip: 0.3 } } as Partial<SectorElement>);
  }
}

/** Tendril / hook / curl rising beside the primary tip toward the outer edge (interlocks with the next band). */
function tipCurl(ctx: SectorContext, pr: PrimarySpec, width: number, type: "tendril" | "hook" | "curl"): void {
  const L = ctx.range;
  const p = { x: pr.tip.x - L * 0.3, y: pr.halfWidth * 0.7 + ctx.settings.gap + L * 0.14 };
  ctx.add("flow", type, {
    name: `${type} at tip`,
    x: r1(p.x),
    y: r1(p.y),
    rotation: 30,
    length: r1(L * 0.48),
    width: r1(L * 0.22),
    strokeWidth: r1(width),
    params: type === "tendril" ? { tip: 0.3, turns: 1.25, direction: -1 } : type === "hook" ? { tip: 0.35, turns: 0.75, direction: -1 } : { turns: 1.25, taper: 0.7, direction: -1, radius: 0 },
  } as Partial<SectorElement>);
}

/** Secondary petal / leaf beside the tip. */
function tipLeaf(ctx: SectorContext, pr: PrimarySpec, type: "petal" | "leaf"): void {
  const L = ctx.range;
  const cand = ctx.pickPart();
  if (cand && ctx.addPart(cand, "secondary", { x: r1(pr.tip.x - L * 0.08), y: r1(pr.halfWidth * 0.7 + ctx.settings.gap + L * 0.08), rotation: 48, targetLength: r1(L * 0.3), maxWidth: r1(L * 0.18) })) return;
  ctx.add("secondary", type, { name: `${type} at tip`, x: r1(pr.tip.x - L * 0.08), y: r1(pr.halfWidth * 0.7 + ctx.settings.gap + L * 0.08), rotation: 48, length: r1(L * 0.3), width: r1(L * 0.13), params: type === "petal" ? { bulge: 1, shoulder: 0.35 } : { tipSharpness: 0.9, bend: 0.3 } } as Partial<SectorElement>);
}

/** Filler drops and dots in the wedge between the primary and the boundary. */
function wedgeFillers(ctx: SectorContext, count: number): void {
  const L = ctx.range;
  for (let i = 0; i < count; i++) {
    const u = 0.25 + 0.6 * (i / Math.max(1, count - 1));
    const p = ctx.polar(ctx.rho(u), 0.66);
    const out = ctx.outward(p);
    const cand = ctx.pickPart();
    if (cand && ctx.addPart(cand, "filler", { x: r1(p.x), y: r1(p.y), rotation: r1(SectorContext.angleDeg(out)), targetLength: r1(L * 0.22), maxWidth: r1(L * 0.14) })) continue;
    const drop = i % 2 === 0;
    ctx.add("filler", drop ? "teardrop" : "dot", { name: drop ? "drop" : "dot", x: r1(p.x), y: r1(p.y), rotation: r1(SectorContext.angleDeg(out)), length: r1(drop ? L * 0.2 : 1.9), width: r1(drop ? L * 0.09 : 1.9), params: { tipSharpness: 0.8, curvature: 0 } } as Partial<SectorElement>);
  }
}

/** Dots along the primary outline. */
function outlineDots(ctx: SectorContext, pr: PrimarySpec, count: number): void {
  const L = pr.tip.x - pr.base.x;
  for (let i = 0; i < count; i++) {
    const f = 0.15 + (0.7 * i) / Math.max(1, count - 1);
    const x = pr.base.x + L * f;
    const y = pr.halfWidth * Math.sin(Math.PI * Math.min(1, f * 0.9 + 0.05)) + ctx.settings.gap + 1.3;
    ctx.add("filler", "dot", { name: "dot", x: r1(x), y: r1(y), length: 1.8, width: 1.8 } as Partial<SectorElement>);
  }
}

/** Count elements of a role placed so far. */
function countRole(ctx: SectorContext, role: OrnamentRole): number {
  return ctx.elements.filter((e) => e.role === role).length;
}

/** Extra flow curves (hooks / tendrils / c-curves) at candidate spots until `min` flow elements exist. */
function ensureFlows(ctx: SectorContext, pr: PrimarySpec, width: number, min: number): void {
  const L = ctx.range;
  // Candidate spots stay clear of the interlock zones (v > 0.45 only in the middle of the band).
  const spots: { u: number; v: number; rot: number; type: "hook" | "tendril" | "ccurve" }[] = [
    { u: 0.05, v: 0.3, rot: 110, type: "hook" },
    { u: 0.5, v: 0.62, rot: 120, type: "ccurve" },
    { u: 0.3, v: 0.55, rot: 95, type: "hook" },
    { u: 0.65, v: 0.5, rot: 40, type: "tendril" },
    { u: 0.92, v: 0.28, rot: 15, type: "tendril" },
    { u: 0.4, v: 0.7, rot: 75, type: "hook" },
    { u: 0.6, v: 0.35, rot: 60, type: "hook" },
    { u: 0.22, v: 0.62, rot: 100, type: "ccurve" },
    { u: 0.75, v: 0.62, rot: 30, type: "hook" },
    { u: 0.12, v: 0.42, rot: 130, type: "tendril" },
  ];
  const enough = (): boolean => countRole(ctx, "flow") + countRole(ctx, "boundary") >= min;
  // A second boundary connection from the tip side (attached to the primary) is the surest flow.
  if (!enough() && pr.tip.x - pr.base.x > 8) {
    const from = { x: pr.tip.x - L * 0.3, y: pr.halfWidth * 0.75 };
    const sp = boundarySpine(ctx, from, { x: 0.35, y: 0.94 }, ctx.rho(0.72), ctx.settings.boundaryGap / 2, 0.4);
    addSpine(ctx, "boundary", sp, width * 0.85, 0.5, "tip vine", { attach: pr.attachable !== false });
    placeOnSpine(ctx, "filler", sp, 0.5, "dot", { side: -1, offset: L * 0.1, length: 1.8, width: 1.8, name: "dot" });
  }
  for (const sp of spots) {
    if (enough()) return;
    const p = ctx.polar(ctx.rho(sp.u), sp.v);
    const out = ctx.outward(p);
    for (const [type, dRot, size] of [[sp.type, 0, 0.28], [sp.type, 45, 0.24], ["hook", -45, 0.22], ["ccurve", 90, 0.2]] as const) {
      const el = ctx.add("flow", type, {
        name: type,
        x: r1(p.x),
        y: r1(p.y),
        rotation: r1(SectorContext.angleDeg(out) + sp.rot - 90 + dRot),
        length: r1(L * size),
        width: r1(L * size * 0.5),
        strokeWidth: r1(width * 0.75),
        params: type === "hook" ? { tip: 0.35, turns: 0.75, direction: 1 } : type === "tendril" ? { tip: 0.3, turns: 1.25, direction: 1 } : { tip: 0.3 },
      } as Partial<SectorElement>);
      if (el) break;
    }
  }
}

/** Extra secondary motifs (leaf / petal / drop) at mid-band spots until `min` secondaries exist. */
function ensureSecondaries(ctx: SectorContext, min: number): void {
  const L = ctx.range;
  const spots: { u: number; v: number; type: "leaf" | "petal" | "teardrop" }[] = [
    { u: 0.55, v: 0.5, type: "leaf" },
    { u: 0.35, v: 0.62, type: "petal" },
    { u: 0.72, v: 0.42, type: "teardrop" },
    { u: 0.2, v: 0.5, type: "leaf" },
    { u: 0.85, v: 0.3, type: "petal" },
    { u: 0.45, v: 0.38, type: "teardrop" },
    { u: 0.65, v: 0.62, type: "leaf" },
    { u: 0.3, v: 0.42, type: "teardrop" },
    { u: 0.9, v: 0.42, type: "leaf" },
    { u: 0.5, v: 0.72, type: "teardrop" },
    { u: 0.1, v: 0.38, type: "petal" },
  ];
  // With user parts enabled, the secondary stage also owes a few part placements
  // (templates usually have their two secondaries already, so the stage would be skipped).
  const parts = ctx.settings.parts;
  const partTarget = parts && parts.frequency > 0 ? Math.round(1 + 2 * parts.frequency) : 0;
  let partPlaced = 0;
  for (const sp of spots) {
    const enoughBuiltIn = countRole(ctx, "secondary") >= min;
    if (enoughBuiltIn && partPlaced >= partTarget) return;
    const p = ctx.polar(ctx.rho(sp.u), sp.v);
    const out = ctx.outward(p);
    const cand = partPlaced < partTarget ? ctx.pickPart() : null;
    if (cand && ctx.addPart(cand, "secondary", { x: r1(p.x), y: r1(p.y), rotation: r1(SectorContext.angleDeg(out) + ctx.rnd(-30, 30)), targetLength: r1(L * 0.3), maxWidth: r1(L * 0.22) })) {
      partPlaced++;
      continue;
    }
    if (enoughBuiltIn) continue;
    ctx.add("secondary", sp.type, { name: sp.type, x: r1(p.x), y: r1(p.y), rotation: r1(SectorContext.angleDeg(out) + ctx.rnd(-30, 30)), length: r1(L * 0.28), width: r1(L * 0.12), params: sp.type === "petal" ? { bulge: 1, shoulder: 0.35 } : sp.type === "leaf" ? { tipSharpness: 0.85, bend: 0.2 } : { tipSharpness: 0.8, curvature: 0 } } as Partial<SectorElement>);
  }
}

/**
 * Lace fill: scan the half sector on a grid and drop small drops / leaves / dots
 * wherever they fit with the required gap. Larger fillers are tried first so
 * the remaining gaps get dots, the way lace stencils are filled.
 */
function fillFreeSpace(ctx: SectorContext, maxCount: number): void {
  const L = ctx.range;
  const kinds: { type: ElementType; length: number; width: number; params: Record<string, number> }[] = [
    { type: "leaf", length: L * 0.26, width: L * 0.1, params: { tipSharpness: 0.9, bend: 0.15 } },
    { type: "teardrop", length: L * 0.2, width: L * 0.09, params: { tipSharpness: 0.8, curvature: 0 } },
    { type: "dot", length: 1.9, width: 1.9, params: {} },
  ];
  const cells: { u: number; v: number }[] = [];
  for (let iu = 0; iu < 10; iu++) for (let iv = 0; iv < 7; iv++) cells.push({ u: 0.06 + (0.88 * iu) / 9, v: 0.08 + (0.8 * iv) / 6 });
  // Deterministic shuffle.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  let placed = 0;
  // User parts first (small), then the built-in lace fillers.
  if (ctx.settings.parts && ctx.settings.parts.frequency > 0) {
    for (const c of cells) {
      if (placed >= maxCount) return;
      const cand = ctx.pickPart();
      if (!cand) continue;
      const p = ctx.polar(ctx.rho(c.u), c.v);
      const out = ctx.outward(p);
      if (ctx.addPart(cand, "filler", { x: r1(p.x), y: r1(p.y), rotation: r1(SectorContext.angleDeg(out) + ctx.rnd(-25, 25)), targetLength: r1(L * 0.22), maxWidth: r1(L * 0.14) }, { nudge: false })) placed++;
    }
  }
  for (const kind of kinds) {
    for (const c of cells) {
      if (placed >= maxCount) return;
      const p = ctx.polar(ctx.rho(c.u), c.v);
      const out = ctx.outward(p);
      const el = ctx.add("filler", kind.type, { name: kind.type === "dot" ? "dot" : `fill ${kind.type}`, x: r1(p.x), y: r1(p.y), rotation: r1(SectorContext.angleDeg(out) + (kind.type === "dot" ? 0 : ctx.rnd(-25, 25))), length: r1(kind.length), width: r1(kind.width), params: kind.params } as Partial<SectorElement>, { nudge: false });
      if (el) placed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Sector composition templates
// ---------------------------------------------------------------------------

export type CompositionTemplate = (ctx: SectorContext) => void;

export const floralArabesque: CompositionTemplate = (ctx) => {
  const w = bandWidth(ctx);
  const pr = primaryFor(ctx, () => primaryNested(ctx, "teardrop"));
  shoulderVine(ctx, pr, 0.6, w, { leaf: true, drop: ctx.density > 0.5, dots: 2 });
  baseScroll(ctx, pr, w * 0.9, "ccurve");
  tipCurl(ctx, pr, w * 0.85, "tendril");
  tipLeaf(ctx, pr, "petal");
  baseScroll(ctx, pr, w * 0.8, "hook");
  ensureFlows(ctx, pr, w, 4);
  ensureSecondaries(ctx, 2);
  wedgeFillers(ctx, ctx.density > 0.6 ? 3 : 2);
  outlineDots(ctx, pr, 2);
  fillFreeSpace(ctx, Math.round(4 + 7 * ctx.density));
};

export const paisleyVine: CompositionTemplate = (ctx) => {
  const w = bandWidth(ctx);
  const pr = primaryFor(ctx, () => primaryPaisley(ctx));
  const L = ctx.range;
  shoulderVine(ctx, pr, 0.58, w, { leaf: true, dots: 2, hook: ctx.density > 0.5 });
  // Second boundary vine sweeping under the paisley base at a lower radius.
  const sp2 = boundarySpine(ctx, { x: pr.base.x + L * 0.08, y: pr.halfWidth * 0.35 }, { x: -0.3, y: 0.95 }, ctx.rho(0.28), ctx.settings.boundaryGap / 2, 0.4);
  if (addSpine(ctx, "boundary", sp2, w * 0.9, 0.5, "under-vine")) {
    placeOnSpine(ctx, "secondary", sp2, 0.55, "leaf", { side: 1, offset: L * 0.14, angle: 55, length: L * 0.28, width: L * 0.12, name: "leaf", params: { tipSharpness: 0.85, bend: -0.2 } });
  }
  tipCurl(ctx, pr, w * 0.8, "hook");
  ctx.add("secondary", "teardrop", { name: "drop at tip", x: r1(pr.tip.x - L * 0.16), y: r1(-pr.halfWidth * 0.5 - ctx.settings.gap - L * 0.1), rotation: -28, length: r1(L * 0.26), width: r1(L * 0.11), params: { tipSharpness: 0.85, curvature: 0 } } as Partial<SectorElement>);
  ensureFlows(ctx, pr, w, 4);
  ensureSecondaries(ctx, 2);
  wedgeFillers(ctx, 2);
  outlineDots(ctx, pr, 2);
  fillFreeSpace(ctx, Math.round(4 + 7 * ctx.density));
};

export const lotusScroll: CompositionTemplate = (ctx) => {
  const w = bandWidth(ctx);
  const pr = primaryFor(ctx, () => primaryNested(ctx, "lotus"));
  shoulderVine(ctx, pr, 0.62, w, { drop: true, dots: 2 });
  baseScroll(ctx, pr, w * 0.9, "opposedcurl");
  tipLeaf(ctx, pr, "leaf");
  tipCurl(ctx, pr, w * 0.8, "curl");
  ensureFlows(ctx, pr, w, 4);
  ensureSecondaries(ctx, 2);
  wedgeFillers(ctx, 2);
  outlineDots(ctx, pr, 2);
  fillFreeSpace(ctx, Math.round(4 + 7 * ctx.density));
};

export const gothicFloral: CompositionTemplate = (ctx) => {
  const w = bandWidth(ctx);
  const pr = primaryFor(ctx, () => primaryNested(ctx, "leaf"));
  shoulderVine(ctx, pr, 0.66, w, { leaf: true, dots: 1 });
  baseScroll(ctx, pr, w * 0.85, "doublecurl");
  tipLeaf(ctx, pr, "petal");
  tipCurl(ctx, pr, w * 0.8, "hook");
  ensureFlows(ctx, pr, w, 4);
  ensureSecondaries(ctx, 2);
  wedgeFillers(ctx, ctx.density > 0.5 ? 3 : 2);
  outlineDots(ctx, pr, 3);
  fillFreeSpace(ctx, Math.round(4 + 7 * ctx.density));
};

export const laceFlower: CompositionTemplate = (ctx) => {
  const w = bandWidth(ctx);
  const pr = primaryFor(ctx, () => primaryNested(ctx, "teardrop"));
  const L = ctx.range;
  const sp = shoulderVine(ctx, pr, 0.58, w, { leaf: true, drop: true });
  placeOnSpine(ctx, "filler", sp, 0.9, "dot", { side: -1, offset: L * 0.12, length: 1.8, width: 1.8, name: "dot" });
  placeOnSpine(ctx, "filler", sp, 0.3, "dot", { side: -1, offset: L * 0.12, length: 1.8, width: 1.8, name: "dot" });
  ctx.add("flow", "ccurve", { name: "lace arc", x: r1(pr.tip.x - L * 0.18), y: r1(pr.halfWidth * 0.75 + ctx.settings.gap + L * 0.14), rotation: 40, length: r1(L * 0.36), width: r1(L * 0.1), strokeWidth: r1(w * 0.8), params: { tip: 0.3 } } as Partial<SectorElement>);
  tipLeaf(ctx, pr, "petal");
  baseScroll(ctx, pr, w * 0.85, "ccurve");
  tipCurl(ctx, pr, w * 0.75, "tendril");
  ensureFlows(ctx, pr, w, 4);
  ensureSecondaries(ctx, 2);
  wedgeFillers(ctx, 2);
  outlineDots(ctx, pr, 2);
  fillFreeSpace(ctx, Math.round(4 + 7 * ctx.density));
};

export const ornamentalVine: CompositionTemplate = (ctx) => {
  const w = bandWidth(ctx);
  const pr = primaryFor(ctx, () => primaryPaisley(ctx));
  const L = ctx.range;
  shoulderVine(ctx, pr, 0.62, w, { leaf: true, drop: true, dots: 2, hook: true });
  ctx.add("flow", "vine", { name: "vine", x: r1(pr.base.x + L * 0.3), y: r1(-pr.halfWidth * 0.55 - ctx.settings.gap - L * 0.12), rotation: -18, length: r1(L * 0.55), width: r1(L * 0.18), strokeWidth: r1(w * 0.85), params: { tip: 0.3, waves: 2 } } as Partial<SectorElement>);
  ctx.add("secondary", "leaf", { name: "leaf", x: r1(pr.tip.x - L * 0.28), y: r1(-pr.halfWidth * 0.5 - ctx.settings.gap - L * 0.14), rotation: -42, length: r1(L * 0.3), width: r1(L * 0.12), params: { tipSharpness: 0.85, bend: 0.2 } } as Partial<SectorElement>);
  tipCurl(ctx, pr, w * 0.8, "tendril");
  ensureFlows(ctx, pr, w, 4);
  ensureSecondaries(ctx, 2);
  wedgeFillers(ctx, 2);
  outlineDots(ctx, pr, 2);
  fillFreeSpace(ctx, Math.round(4 + 7 * ctx.density));
};

export const TEMPLATES: Record<string, CompositionTemplate> = { floralArabesque, paisleyVine, lotusScroll, gothicFloral, laceFlower, ornamentalVine };
export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

// ---------------------------------------------------------------------------
// Mandala layout: bands with interlock + center
// ---------------------------------------------------------------------------

export interface ComposeParams {
  symmetry: number;
  density: number;
  seed: number;
  /** Template per band (cycled). Random when omitted. */
  templates?: string[];
  name?: string;
  /** User parts to mix in. Their compounds are merged into the generated project. */
  parts?: PartsSettings;
}

export function layoutBands(sheetRadius: number, centerOuter: number, density: number, symmetry: number): BandLayout[] {
  const bands = Math.max(2, Math.round(1.5 + 2.5 * density));
  const margin = Math.max(3, sheetRadius * 0.03);
  const usable = sheetRadius - margin - centerOuter - 2;
  const step = usable / bands;
  const interlock = Math.min(5, step * (0.14 + 0.1 * density));
  const out: BandLayout[] = [];
  for (let i = 0; i < bands; i++) {
    const inner = centerOuter + 2 + step * i - (i > 0 ? interlock : 0);
    const outer = Math.min(sheetRadius - margin, centerOuter + 2 + step * (i + 1) + (i < bands - 1 ? interlock : 0));
    // Narrow inner bands get half the repeat count so a sector is wide enough for a full composition.
    const mid = (inner + outer) / 2;
    const halfWidth = (mid * Math.PI) / symmetry;
    const repeat = halfWidth < 10.5 && symmetry % 2 === 0 && symmetry >= 8 ? symmetry / 2 : symmetry;
    out.push({ index: i, inner, outer, repeat, phase: i % 2 === 1 ? 180 / repeat : 0, interlock });
  }
  return out;
}

/** World regions of a ring expressed in the sector frame (copy 0) of `band`. */
function obstaclesFor(ring: Ring | null, project: Project, band: BandLayout): Region[] {
  if (!ring) return [];
  const R = (band.inner + band.outer) / 2;
  const t = instanceTransform(0, { count: band.repeat, radius: R, phaseDeg: band.phase, rotationDeg: 0, rotationMode: "radial", direction: "outward", stagger: 0 });
  const geom = generateRing(ring, project);
  const theta = Math.PI / band.repeat;
  const out: Region[] = [];
  for (const r of geom.apertures) {
    const outer = r.outer.map((p) => invertTransform(p, t));
    const b = bounds([outer]);
    // Keep only what can touch this sector (a generous angular window).
    if (b.maxX < -R + band.inner - 6 || b.minX > -R + band.outer + 6) continue;
    if (b.minY > (band.outer + 6) * Math.sin(theta * 1.6) || b.maxY < -(band.outer + 6) * Math.sin(theta * 1.6)) continue;
    out.push({ outer, holes: r.holes.map((h) => h.map((p) => invertTransform(p, t))) });
  }
  return out;
}

export function composeSector(band: BandLayout, template: CompositionTemplate, settings: ComposeSettings, rng: () => number, name: string, obstacles: Region[] = []): Ring {
  const ctx = new SectorContext(band, rng, settings, obstacles);
  template(ctx);
  return { id: newId("r"), name, visible: true, radius: r1(ctx.R), repeat: band.repeat, phase: r1(band.phase), mirrorLocal: true, elements: ctx.elements };
}

export function composeMandala(params: ComposeParams, base?: Partial<Project>): Project {
  const rng = mulberry32(params.seed);
  const density = Math.min(1, Math.max(0, params.density));
  const sym = Math.max(3, Math.round(params.symmetry));
  const project = emptyProject(params.name ?? `Mandala #${params.seed}`);
  Object.assign(project, base ?? {});
  project.symmetry = sym;
  project.seed = params.seed;
  project.generator = { symmetry: sym, density, seed: params.seed };
  // User parts: merge the compounds they need (by id) so their references resolve.
  const parts = params.parts && params.parts.frequency > 0 && params.parts.candidates.some((c) => c.weight > 0) ? params.parts : undefined;
  if (parts) {
    const compounds = [...project.compounds];
    for (const c of parts.candidates) for (const comp of c.compounds) if (!compounds.some((x) => x.id === comp.id)) compounds.push(comp);
    project.compounds = compounds;
    project.generator.partsFrequency = Math.min(1, Math.max(0, parts.frequency));
    project.generator.partWeights = Object.fromEntries(parts.candidates.map((c) => [c.id, c.weight]));
  }
  const sheetRadius = Math.min(project.sheet.width, project.sheet.height) / 2;
  const centerOuter = Math.round(sheetRadius * (0.17 + 0.05 * density));
  const centerInner = Math.max(2.5, Math.round(centerOuter * 0.34));
  const types: CenterMotif["type"][] = ["radialPetals", "sunflower", "circularPetals", "radialPetals"];
  let petals = sym * 2;
  while ((2 * Math.PI * centerInner) / petals < 2.6 && petals > sym) petals -= sym;
  project.center = {
    type: types[Math.floor(rng() * types.length)]!,
    petals,
    innerRadius: centerInner,
    outerRadius: centerOuter,
    petalWidth: Math.max(1.6, Math.round(((2 * Math.PI * centerInner) / petals - 1.1) * 10) / 10),
    coreRadius: Math.max(1.5, Math.round(centerInner * 0.45 * 10) / 10),
    strokeWidth: 0,
    rotation: 0,
  };
  const settings: ComposeSettings = {
    symmetry: sym,
    density,
    gap: project.constraints.minGap,
    boundaryGap: Math.max(project.constraints.minGap * 1.3, project.bridges.width),
    minFeatureWidth: project.constraints.minFeatureWidth,
    maxRho: sheetRadius - Math.max(2, sheetRadius * 0.02),
    parts,
    compounds: project.compounds,
  };
  const bands = layoutBands(sheetRadius, centerOuter, density, sym);
  const names = params.templates && params.templates.length > 0 ? params.templates : shuffled(TEMPLATE_NAMES, rng);
  const rings: Ring[] = [];
  bands.forEach((b, i) => {
    const tName = names[i % names.length]!;
    const template = TEMPLATES[tName] ?? floralArabesque;
    const prev = rings[rings.length - 1] ?? null;
    const obstacles = prev ? obstaclesFor(prev, { ...project, rings }, b) : centerObstacle(project.center, b);
    rings.push(composeSector(b, template, settings, rng, `Band ${i + 1} · ${tName}`, obstacles));
  });
  project.rings = rings;
  return project;
}

/** A disc the size of the center motif, so the first band keeps clear of it. */
function centerObstacle(center: CenterMotif, band: BandLayout): Region[] {
  if (center.type === "none") return [];
  const R = (band.inner + band.outer) / 2;
  const n = 48;
  const outer: Vec2[] = [];
  for (let i = 0; i < n; i++) outer.push({ x: -R + Math.cos((i / n) * Math.PI * 2) * center.outerRadius, y: Math.sin((i / n) * Math.PI * 2) * center.outerRadius });
  return [{ outer, holes: [] }];
}

function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Composition statistics (acceptance metrics)
// ---------------------------------------------------------------------------

export interface CompositionStats {
  primitives: number;
  byRole: Record<OrnamentRole, number>;
  nestedKinds: number;
  flowCurves: number;
  boundaryConnections: number;
}

const FLOW_TYPES = new Set<ElementType>(["bezier", "scurve", "curl", "ccurve", "hook", "vine", "doublecurl", "opposedcurl", "tendril", "spiral"]);

export function compositionStats(ring: Ring): CompositionStats {
  const byRole: Record<OrnamentRole, number> = { primary: 0, secondary: 0, flow: 0, filler: 0, boundary: 0 };
  const nested = new Set<string>();
  let flow = 0;
  let boundary = 0;
  for (const e of ring.elements) {
    if (e.role) byRole[e.role]++;
    if (e.children && e.children.length > 0) nested.add(`${e.type}>${e.children.map((c) => c.type).join(",")}`);
    if (e.type === "paisley" && (e.params.innerInset ?? 0) > 0 && (e.params.innerCurl ?? 0) > 0) nested.add("paisley>curl");
    if (FLOW_TYPES.has(e.type)) flow++;
    if (e.role === "boundary") boundary++;
  }
  return { primitives: ring.elements.length, byRole, nestedKinds: nested.size, flowCurves: flow, boundaryConnections: boundary };
}

/** Number of adjacent band pairs whose radial extents overlap (ring-to-ring interlock). */
export function bandInterlocks(project: Project): number {
  const extents = project.rings.map((ring) => {
    const g = generateRing(ring, project);
    let min = Infinity;
    let max = -Infinity;
    for (const r of g.apertures) for (const p of r.outer) {
      const d = Math.hypot(p.x, p.y);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return { min, max };
  });
  let n = 0;
  for (let i = 1; i < extents.length; i++) if (extents[i]!.min < extents[i - 1]!.max - 0.5) n++;
  return n;
}
