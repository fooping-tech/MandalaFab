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

export function generateMandala(project: Project): MandalaGeometry {
  const rings = project.rings.filter((r) => r.visible).map((r) => generateRing(r, project));
  return { center: buildCenter(project.center), rings, symmetry: project.symmetry };
}

/** All raw closed contours of a mandala (for duplicate/self-intersection checks). */
export function rawContours(geometry: MandalaGeometry): { ringId: string; contour: Contour }[] {
  const out: { ringId: string; contour: Contour }[] = [];
  for (const r of geometry.center) out.push({ ringId: CENTER_ID, contour: r.outer });
  for (const ring of geometry.rings) for (const inst of ring.instances) for (const c of inst.closed) out.push({ ringId: ring.ringId, contour: c });
  return out;
}
