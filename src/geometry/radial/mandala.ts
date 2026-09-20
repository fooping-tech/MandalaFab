/**
 * generateMandala(project): turns the ring list into per-ring aperture geometry.
 * No boolean union happens here; that is the stencil stage.
 */
import type { Project, Ring } from "../../model/project";
import { flattenRegions, strokeClosed, strokeOpen } from "../boolean";
import { getMotif, resolveParams, type MotifShape } from "../motifs";
import type { Contour, Region } from "../types";
import { TOLERANCE } from "../types";
import { radialRepeat, type RadialInstance } from "./repeat";

export interface RingGeometry {
  ringId: string;
  /** Raw instances (motif-local shapes placed on the ring). */
  instances: RadialInstance[];
  /** Closed aperture regions for this ring (open motifs already stroked into bands). */
  apertures: Region[];
  /** Non-fatal notes (e.g. an open motif with zero stroke width got a default). */
  notes: string[];
}

export interface MandalaGeometry {
  rings: RingGeometry[];
  /** Symmetry order declared by the project (used by bridge generation). */
  symmetry: number;
}

/** Build the local motif shape for a ring. */
export function buildRingMotif(ring: Ring): MotifShape {
  const def = getMotif(ring.motif);
  return def.build({
    length: ring.length,
    width: ring.width,
    ringRadius: ring.radius,
    tolerance: TOLERANCE,
    params: resolveParams(def, ring.params),
  });
}

/** Minimum band width used when a line-like motif has no stroke width set. */
export const DEFAULT_LINE_WIDTH = 1.0;

export function generateRing(ring: Ring, minFeatureWidth: number): RingGeometry {
  const notes: string[] = [];
  const shape = buildRingMotif(ring);
  const instances = radialRepeat(shape, {
    count: ring.count,
    radius: ring.radius,
    phaseDeg: ring.phase,
    rotationDeg: ring.rotation,
    rotationMode: ring.rotationMode,
    direction: ring.direction,
    stagger: ring.stagger,
  });
  const apertures: Region[] = [];
  const lineWidth = ring.strokeWidth > 0 ? ring.strokeWidth : Math.max(DEFAULT_LINE_WIDTH, minFeatureWidth);
  let defaulted = false;
  for (const inst of instances) {
    for (const c of inst.closed) {
      if (c.length < 3) continue;
      if (ring.strokeWidth > 0) apertures.push(...flattenRegions(strokeClosed(c, ring.strokeWidth)));
      else apertures.push({ outer: c, holes: [] });
    }
    for (const line of inst.open) {
      if (line.length < 2) continue;
      if (ring.strokeWidth <= 0) defaulted = true;
      apertures.push(...flattenRegions(strokeOpen(line, lineWidth)));
    }
  }
  if (defaulted) notes.push(`線状モチーフの線幅が0なので ${lineWidth} mm を使いました。`);
  return { ringId: ring.id, instances, apertures, notes };
}

export function generateMandala(project: Project): MandalaGeometry {
  const rings = project.rings.filter((r) => r.visible).map((r) => generateRing(r, project.constraints.minFeatureWidth));
  return { rings, symmetry: project.symmetry };
}

/** All raw closed contours of a mandala (for duplicate/self-intersection checks). */
export function rawContours(geometry: MandalaGeometry): { ringId: string; contour: Contour }[] {
  const out: { ringId: string; contour: Contour }[] = [];
  for (const ring of geometry.rings) for (const inst of ring.instances) for (const c of inst.closed) out.push({ ringId: ring.ringId, contour: c });
  return out;
}
