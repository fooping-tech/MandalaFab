/**
 * Automatic bridge generation.
 *
 * A bridge is a rectangle of material that is *subtracted from the apertures*,
 * so an island (a hole of an aperture region) gets reconnected to the material
 * outside that aperture. Bridges are chosen by ray casting from the island:
 *   - central islands (containing the mandala center) get `n` bridges at
 *     symmetric angles; the common phase is chosen so the bridges are shortest.
 *   - other islands get radial bridges (inward / outward), which keeps the
 *     k-fold symmetry of the design because every symmetric copy of an island
 *     makes the same decision in its own local frame.
 * Generation is iterated because adding bridges changes the topology.
 */
import type { Contour, Region, RegionNode, Vec2 } from "../types";
import { containsPoint, raySegment } from "../vec";
import { difference } from "../boolean";
import { findIslands, type Island } from "./islands";

export interface Bridge {
  id: string;
  /** Center of the bridge rectangle (design coordinates, mm). */
  x: number;
  y: number;
  /** Extent along the bridge direction (mm). */
  length: number;
  width: number;
  /** Direction in radians. */
  rotation: number;
  auto: boolean;
}

export interface BridgeOptions {
  width: number;
  overlap: number;
  symmetry: number;
  centerCount: number | "auto";
  perIsland: 1 | 2;
  maxIterations?: number;
  /** Refuse bridges longer than this (mm). */
  maxSpan?: number;
}

export interface BridgeResult {
  bridges: Bridge[];
  /** Apertures after all bridges were subtracted. */
  apertures: RegionNode[];
  /** Islands that could not be bridged. */
  unresolved: Island[];
  iterations: number;
}

/** Rectangle contour of a bridge. */
export function bridgeContour(b: Bridge): Contour {
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  const hl = b.length / 2;
  const hw = b.width / 2;
  const corner = (u: number, w: number): Vec2 => ({ x: b.x + u * c - w * s, y: b.y + u * s + w * c });
  return [corner(-hl, -hw), corner(hl, -hw), corner(hl, hw), corner(-hl, hw)];
}

export const bridgeRegions = (bridges: readonly Bridge[]): Region[] => bridges.map((b) => ({ outer: bridgeContour(b), holes: [] }));

/** Subtract bridge rectangles from apertures. */
export function applyBridges(apertures: readonly Region[], bridges: readonly Bridge[]): RegionNode[] {
  return difference(apertures, bridgeRegions(bridges));
}

/** Number of symmetric bridges for the central island. */
export function autoCenterCount(symmetry: number): number {
  const s = Math.max(1, Math.round(symmetry));
  if (s <= 8) return s;
  for (let d = 8; d >= 3; d--) if (s % d === 0) return d;
  return s <= 16 ? s : 4;
}

interface Hit {
  t: number;
  /** -1 = outer contour, otherwise hole index. */
  tag: number;
}

function castRay(region: RegionNode, origin: Vec2, dir: Vec2): Hit[] {
  const hits: Hit[] = [];
  const collect = (c: Contour, tag: number): void => {
    for (let i = 0, n = c.length; i < n; i++) {
      const t = raySegment(origin, dir, c[i]!, c[(i + 1) % n]!);
      if (t !== null && t > 1e-9) hits.push({ t, tag });
    }
  };
  collect(region.outer, -1);
  region.holes.forEach((h, i) => collect(h, i));
  hits.sort((a, b) => a.t - b.t);
  return hits;
}

/**
 * Find the span of aperture crossed by a ray leaving island `island` in direction `dir`.
 * Returns the [t0, t1] interval along the ray or null when the ray does not land on
 * material of the same aperture region.
 */
export function raySpan(island: Island, origin: Vec2, dir: Vec2): { t0: number; t1: number } | null {
  const hits = castRay(island.region, origin, dir);
  let inside = containsPoint(island.contour, origin);
  let exitT: number | null = null;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]!;
    if (exitT === null) {
      if (h.tag === island.holeIndex) {
        inside = !inside;
        if (!inside) exitT = h.t;
      }
      continue;
    }
    // First boundary after leaving the island: must not be the island itself.
    if (h.tag === island.holeIndex) return null;
    if (h.t - exitT < 1e-6) continue;
    return { t0: exitT, t1: h.t };
  }
  return null;
}

function makeBridge(origin: Vec2, dir: Vec2, span: { t0: number; t1: number }, o: BridgeOptions, id: string): Bridge {
  const mid = (span.t0 + span.t1) / 2;
  return {
    id,
    x: origin.x + dir.x * mid,
    y: origin.y + dir.y * mid,
    length: span.t1 - span.t0 + 2 * o.overlap,
    width: o.width,
    rotation: Math.atan2(dir.y, dir.x),
    auto: true,
  };
}

const dirOf = (rad: number): Vec2 => ({ x: Math.cos(rad), y: Math.sin(rad) });

/** Bridges for an island containing the mandala center: n symmetric rays with the cheapest common phase. */
function centralBridges(island: Island, o: BridgeOptions, idBase: string): Bridge[] {
  const n = o.centerCount === "auto" ? autoCenterCount(o.symmetry) : Math.max(1, o.centerCount);
  const step = (Math.PI * 2) / n;
  const samples = 24;
  const maxSpan = o.maxSpan ?? Infinity;
  let best: { phase: number; total: number; spans: { t0: number; t1: number }[] } | null = null;
  const origin = { x: 0, y: 0 };
  for (let s = 0; s < samples; s++) {
    const phase = -Math.PI / 2 + (step * s) / samples;
    const spans: { t0: number; t1: number }[] = [];
    let total = 0;
    let ok = true;
    for (let j = 0; j < n; j++) {
      const span = raySpan(island, origin, dirOf(phase + step * j));
      if (!span || span.t1 - span.t0 > maxSpan) {
        ok = false;
        break;
      }
      spans.push(span);
      total += span.t1 - span.t0;
    }
    if (ok && (!best || total < best.total - 1e-9)) best = { phase, total, spans };
  }
  if (!best) return [];
  return best.spans.map((span, j) => makeBridge(origin, dirOf(best.phase + step * j), span, o, `${idBase}-${j}`));
}

/** Radial (inward/outward) bridges for an off-center island, with angular fallbacks. */
function radialBridges(island: Island, o: BridgeOptions, idBase: string): Bridge[] {
  const c = island.centroid;
  const origin = containsPoint(island.contour, c) ? c : nearestInteriorPoint(island);
  const outward = Math.atan2(c.y, c.x);
  const maxSpan = o.maxSpan ?? Infinity;
  const candidates: { angle: number; span: { t0: number; t1: number } }[] = [];
  const tryAngle = (angle: number): void => {
    const span = raySpan(island, origin, dirOf(angle));
    if (span && span.t1 - span.t0 <= maxSpan) candidates.push({ angle, span });
  };
  tryAngle(outward + Math.PI); // inward first
  tryAngle(outward);
  if (candidates.length === 0) {
    for (let k = 1; k < 16; k++) tryAngle(outward + (Math.PI * 2 * k) / 16);
    candidates.sort((a, b) => a.span.t1 - a.span.t0 - (b.span.t1 - b.span.t0));
    candidates.splice(1);
  } else if (o.perIsland === 1 && candidates.length > 1) {
    candidates.sort((a, b) => a.span.t1 - a.span.t0 - (b.span.t1 - b.span.t0));
    candidates.splice(1);
  }
  return candidates.map((cand, j) => makeBridge(origin, dirOf(cand.angle), cand.span, o, `${idBase}-${j}`));
}

/** A point inside a (possibly concave) contour: midpoint of the widest horizontal span through the bbox center row. */
function nearestInteriorPoint(island: Island): Vec2 {
  const c = island.contour;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of c) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const y = (minY + maxY) / 2 + 1e-4;
  const xs: number[] = [];
  for (let i = 0, n = c.length; i < n; i++) {
    const a = c[i]!;
    const b = c[(i + 1) % n]!;
    if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  xs.sort((p, q) => p - q);
  let best = { x: island.centroid.x, y: island.centroid.y };
  let bestW = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const w = xs[i + 1]! - xs[i]!;
    if (w > bestW) {
      bestW = w;
      best = { x: (xs[i]! + xs[i + 1]!) / 2, y };
    }
  }
  return best;
}

/** Bridges for one island. */
export function bridgesForIsland(island: Island, o: BridgeOptions, idBase: string): Bridge[] {
  const central = containsPoint(island.contour, { x: 0, y: 0 });
  return central ? centralBridges(island, o, idBase) : radialBridges(island, o, idBase);
}

/**
 * Generate bridges until no island remains (or no progress is made).
 * `apertures` must already be a union (no overlapping regions).
 */
export function generateBridges(apertures: readonly RegionNode[], o: BridgeOptions): BridgeResult {
  let current: RegionNode[] = [...apertures];
  const bridges: Bridge[] = [];
  const maxIterations = o.maxIterations ?? 6;
  let iterations = 0;
  let unresolved: Island[] = [];
  for (; iterations < maxIterations; iterations++) {
    const islands = findIslands(current);
    if (islands.length === 0) {
      unresolved = [];
      break;
    }
    const added: Bridge[] = [];
    unresolved = [];
    islands.forEach((island, i) => {
      const b = bridgesForIsland(island, o, `auto-${iterations}-${i}`);
      if (b.length === 0) unresolved.push(island);
      added.push(...b);
    });
    if (added.length === 0) break;
    bridges.push(...added);
    current = applyBridges(current, added);
  }
  if (iterations === maxIterations) unresolved = findIslands(current);
  return { bridges, apertures: current, unresolved, iterations };
}
