/**
 * generateMandala(project): center motif + every ring's sector, repeated around
 * the origin. No union happens here; that is the stencil stage.
 */
import type { Project, Ring } from "../../model/project";
import { buildCenter } from "../center";
import { buildSector, type ElementRegions } from "../elements/sector";
import type { Contour, Region } from "../types";
import { radialRepeatRegions, type RegionInstance } from "./repeat";

export interface ElementGeometry {
  elementId: string;
  mode: "cut" | "keep";
  /** All copies in world coordinates. */
  regions: Region[];
}

export interface RingGeometry {
  ringId: string;
  /** One instance per sector copy (world coordinates). */
  instances: RegionInstance[];
  /** Cut regions of this ring (world, keep elements subtracted). */
  apertures: Region[];
  /** Per-element world regions for display / hit-testing. */
  elements: ElementGeometry[];
  notes: string[];
}

export interface MandalaGeometry {
  center: Region[];
  rings: RingGeometry[];
  symmetry: number;
}

export const CENTER_ID = "center";

export function generateRing(ring: Ring, project: Project): RingGeometry {
  const sector = buildSector(ring, project);
  const opts = { count: ring.repeat, radius: ring.radius, phaseDeg: ring.phase, rotationDeg: 0, rotationMode: "radial" as const, direction: "outward" as const, stagger: 0 };
  const instances = radialRepeatRegions(sector.cuts, opts);
  const apertures: Region[] = [];
  for (const inst of instances) apertures.push(...inst.regions);
  const elements: ElementGeometry[] = sector.elements.map((e: ElementRegions) => ({
    elementId: e.elementId,
    mode: e.mode,
    regions: radialRepeatRegions(e.regions, opts).flatMap((i) => i.regions),
  }));
  return { ringId: ring.id, instances, apertures, elements, notes: sector.notes };
}

/**
 * Per-ring cache: rings are immutable objects, so an unchanged ring (same
 * reference, same compounds and constraints) reuses its geometry. Editing one
 * ring then only rebuilds that ring; the union stage still runs globally.
 */
const ringCache = new WeakMap<Ring, { compounds: Project["compounds"]; minFeatureWidth: number; geometry: RingGeometry }>();
const centerCache = new WeakMap<Project["center"], Region[]>();

export function generateMandala(project: Project): MandalaGeometry {
  const rings = project.rings
    .filter((r) => r.visible)
    .map((r) => {
      const hit = ringCache.get(r);
      if (hit && hit.compounds === project.compounds && hit.minFeatureWidth === project.constraints.minFeatureWidth) return hit.geometry;
      const geometry = generateRing(r, project);
      ringCache.set(r, { compounds: project.compounds, minFeatureWidth: project.constraints.minFeatureWidth, geometry });
      return geometry;
    });
  let center = centerCache.get(project.center);
  if (!center) {
    center = buildCenter(project.center);
    centerCache.set(project.center, center);
  }
  return { center, rings, symmetry: project.symmetry };
}

/** All raw closed contours of a mandala (for duplicate/self-intersection checks). */
export function rawContours(geometry: MandalaGeometry): { ringId: string; contour: Contour }[] {
  const out: { ringId: string; contour: Contour }[] = [];
  for (const r of geometry.center) out.push({ ringId: CENTER_ID, contour: r.outer });
  for (const ring of geometry.rings) for (const inst of ring.instances) for (const c of inst.closed) out.push({ ringId: ring.ringId, contour: c });
  return out;
}
