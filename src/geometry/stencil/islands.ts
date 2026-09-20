/**
 * Island detection.
 *
 * Stencil semantics: the design is cut OUT of a sheet (apertures). Material is
 * sheet − apertures. A hole inside a unioned aperture region is a piece of
 * material completely surrounded by cut: an island that falls out. The Clipper
 * polytree gives us exactly that structure, including nesting.
 */
import type { Contour, RegionNode, Vec2 } from "../types";
import { area, centroid, bounds } from "../vec";

export interface Island {
  /** Hole contour (boundary of the island material). */
  contour: Contour;
  /** The aperture region the island sits in. */
  region: RegionNode;
  /** Index of the hole in region.holes. */
  holeIndex: number;
  area: number;
  centroid: Vec2;
  /** Distance of the centroid from the mandala center (0,0). */
  radius: number;
}

export function findIslands(regions: readonly RegionNode[]): Island[] {
  const out: Island[] = [];
  const walk = (r: RegionNode): void => {
    r.holes.forEach((h, i) => {
      const c = centroid(h);
      out.push({ contour: h, region: r, holeIndex: i, area: area(h), centroid: c, radius: Math.hypot(c.x, c.y) });
    });
    r.children.forEach(walk);
  };
  regions.forEach(walk);
  return out;
}

/** Largest bounding-box dimension of a contour. */
export function contourExtent(c: Contour): number {
  const b = bounds([c]);
  return Math.max(b.maxX - b.minX, b.maxY - b.minY);
}
