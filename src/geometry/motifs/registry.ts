/**
 * Motif plugin registry.
 *
 * A motif is built in its own local frame: +x points radially outward, +y is the
 * tangential direction, and the shape is centred on the origin. `length` is the
 * radial extent, `width` the tangential extent. A motif may return closed
 * contours (cut as filled apertures or outline bands) and/or open polylines
 * (always stroked into bands so they can be cut).
 */
import type { Contour, Polyline } from "../types";

export interface MotifParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface MotifContext {
  /** Radial extent (mm). */
  length: number;
  /** Tangential extent (mm). */
  width: number;
  /** Ring radius (mm) so motifs like arcs can follow the ring curvature. */
  ringRadius: number;
  /** Curve flattening tolerance (mm). */
  tolerance: number;
  params: Record<string, number>;
}

export interface MotifShape {
  closed: Contour[];
  open: Polyline[];
}

export interface MotifDefinition {
  id: string;
  label: string;
  /** Short description shown in the UI. */
  description?: string;
  params: readonly MotifParamSpec[];
  /** Whether the motif is line-like (its open polylines need a stroke width). */
  lineLike?: boolean;
  build(ctx: MotifContext): MotifShape;
}

const registry = new Map<string, MotifDefinition>();

export function registerMotif(def: MotifDefinition): void {
  if (registry.has(def.id)) throw new Error(`Motif "${def.id}" is already registered.`);
  registry.set(def.id, def);
}

export function hasMotif(id: string): boolean {
  return registry.has(id);
}

export function getMotif(id: string): MotifDefinition {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown motif "${id}".`);
  return def;
}

export function listMotifs(): MotifDefinition[] {
  return [...registry.values()];
}

/** Resolve motif params with defaults so builders never see undefined. */
export function resolveParams(def: MotifDefinition, params: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of def.params) {
    const v = params[p.key];
    out[p.key] = typeof v === "number" && Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
  }
  return out;
}
