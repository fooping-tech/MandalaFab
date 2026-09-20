/**
 * Stencil pipeline: ring apertures -> union -> clip to sheet -> bridges.
 */
import type { Project } from "../../model/project";
import { intersection, union } from "../boolean";
import type { Region, RegionNode } from "../types";
import type { MandalaGeometry } from "../radial/mandala";
import { applyBridges, generateBridges, type Bridge } from "./bridges";
import { findIslands, type Island } from "./islands";
import { sheetRegion } from "./sheet";

export interface StencilGeometry {
  /** Unioned apertures clipped to the sheet, before bridges. */
  apertures: RegionNode[];
  /** Islands found before bridging. */
  islandsBefore: Island[];
  /** Manual + automatic bridges that were applied. */
  bridges: Bridge[];
  /** Final apertures (after bridges). This is what gets exported. */
  final: RegionNode[];
  /** Islands remaining after bridging. */
  islands: Island[];
  /** True when any aperture reaches outside the sheet. */
  overflow: boolean;
}

export function unionApertures(geometry: MandalaGeometry): RegionNode[] {
  const all: Region[] = [];
  for (const ring of geometry.rings) all.push(...ring.apertures);
  return union(all);
}

export function buildStencil(project: Project, geometry: MandalaGeometry): StencilGeometry {
  const unioned = unionApertures(geometry);
  const sheet = sheetRegion(project.sheet);
  const hw = project.sheet.width / 2;
  const hh = project.sheet.height / 2;
  let overflow = false;
  for (const r of unioned) for (const p of r.outer) if (Math.abs(p.x) > hw + 1e-6 || Math.abs(p.y) > hh + 1e-6) overflow = true;
  const apertures = overflow ? intersection(unioned, [sheet]) : unioned;
  const islandsBefore = findIslands(apertures);

  const manual: Bridge[] = project.manualBridges.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    length: b.length,
    width: b.width,
    rotation: (b.rotation * Math.PI) / 180,
    auto: false,
  }));
  let current = manual.length > 0 ? applyBridges(apertures, manual) : apertures;
  const bridges: Bridge[] = [...manual];
  if (project.bridges.auto) {
    const result = generateBridges(current, {
      width: project.bridges.width,
      overlap: project.bridges.overlap,
      symmetry: project.symmetry,
      centerCount: project.bridges.centerCount,
      perIsland: project.bridges.perIsland,
    });
    bridges.push(...result.bridges);
    current = result.apertures;
  }
  return { apertures, islandsBefore, bridges, final: current, islands: findIslands(current), overflow };
}
