/**
 * Core geometry types. Everything is in millimetres, y grows downward (SVG convention).
 * The geometry engine is pure TypeScript with no React/DOM dependency.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * A closed contour: a polygon given by its vertices in order. The closing edge
 * (last -> first) is implicit; the first point is NOT repeated at the end.
 */
export type Contour = readonly Vec2[];

/** An open polyline (used by line-like motifs before they are stroked into a band). */
export type Polyline = readonly Vec2[];

/**
 * The result of a polygon union: an outer contour plus its holes.
 * Nested material inside a hole is a separate Region (see `RegionTree`).
 */
export interface Region {
  readonly outer: Contour;
  readonly holes: readonly Contour[];
}

/** A Region together with the regions that live inside its holes. */
export interface RegionNode extends Region {
  /** Regions contained inside `holes` (grand-children of this outer in the polytree). */
  readonly children: readonly RegionNode[];
  /** Index into `holes` for each child: the hole that contains child i. */
  readonly childHole: readonly number[];
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Curve flattening tolerance in mm (chord error). Same order as TypeFab (0.02 mm). */
export const TOLERANCE = 0.02;

/** Numeric equality tolerance in mm for point comparisons. */
export const EPS = 1e-6;
