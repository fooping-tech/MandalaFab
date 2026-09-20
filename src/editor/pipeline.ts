/**
 * Turns a Project into everything the canvas needs, as plain path strings so the
 * DOM stays small (one path per element, not per copy). Runs in a Web Worker in
 * the app and synchronously in tests.
 */
import type { Project } from "../model/project";
import { generateMandala, CENTER_ID } from "../geometry/radial/mandala";
import { buildStencil } from "../geometry/stencil/pipeline";
import { bridgeContour } from "../geometry/stencil/bridges";
import { flattenRegions } from "../geometry/boolean";
import type { Contour, Region } from "../geometry/types";
import { validateStencil, type ValidationResult, type ValidationStats } from "../validation";
import { formatNumber, regionsPathData } from "../export/svg";

export interface IssuePath {
  id: string;
  severity: "error" | "warning" | "info";
  d: string;
}

export interface ElementPath {
  ringId: string;
  elementId: string;
  mode: "cut" | "keep";
  d: string;
}

/** Geometry stage (fast): what is drawn. */
export interface StencilRender {
  /** Per-element raw outlines (all copies) for the design view and hit-testing. */
  elementPaths: ElementPath[];
  /** Per-ring compound paths (raw cut regions). */
  ringPaths: { ringId: string; d: string }[];
  /** Center motif raw path. */
  centerPath: string;
  /** Final apertures after union + bridges (evenodd compound path) = what is exported. */
  finalPath: string;
  /** The exact path data the SVG export writes (optimised, deduplicated), in design coordinates. */
  exportPath: string;
  exportSubpaths: number;
  bridgePath: string;
  islandPath: string;
  notes: string[];
  counts: { islandsBefore: number; islands: number; bridges: number; subpaths: number; overflow: boolean };
  computeMs: number;
}

/** Validation stage (slower). */
export interface ValidationRender {
  validation: ValidationResult;
  issuePaths: IssuePath[];
  computeMs: number;
}

export interface RenderData extends StencilRender {
  validation: ValidationResult | null;
  issuePaths: IssuePath[];
  validationMs: number;
}

const P = 3;

export function contourToPath(c: Contour): string {
  let d = "";
  for (let i = 0; i < c.length; i++) {
    const p = c[i]!;
    d += `${i === 0 ? "M" : "L"}${formatNumber(p.x, P)} ${formatNumber(p.y, P)}`;
  }
  return d + "Z";
}

export const contoursToPath = (cs: readonly Contour[]): string => cs.map(contourToPath).join("");

export function regionsToPath(rs: readonly Region[]): string {
  const parts: string[] = [];
  for (const r of rs) {
    parts.push(contourToPath(r.outer));
    for (const h of r.holes) parts.push(contourToPath(h));
  }
  return parts.join("");
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

export interface Staged {
  stencil: StencilRender;
  validate: () => ValidationRender;
}

/** Compute the geometry stage and return a thunk for validation so callers can stream results. */
export function computeStaged(project: Project): Staged {
  const t0 = now();
  const geometry = generateMandala(project);
  const stencilGeom = buildStencil(project, geometry);
  const elementPaths: ElementPath[] = [];
  const ringPaths = geometry.rings.map((ring) => {
    for (const e of ring.elements) elementPaths.push({ ringId: ring.ringId, elementId: e.elementId, mode: e.mode, d: regionsToPath(e.regions) });
    return { ringId: ring.ringId, d: regionsToPath(ring.apertures) };
  });
  const centerPath = regionsToPath(geometry.center);
  if (centerPath) elementPaths.push({ ringId: CENTER_ID, elementId: CENTER_ID, mode: "cut", d: centerPath });
  const finalFlat = flattenRegions(stencilGeom.final);
  const finalPath = regionsToPath(finalFlat);
  const exported = regionsPathData(stencilGeom.final, { x: 0, y: 0 }, 3);
  const subpaths = finalFlat.reduce((n, r) => n + 1 + r.holes.length, 0);
  const stencil: StencilRender = {
    elementPaths,
    ringPaths,
    centerPath,
    finalPath,
    exportPath: exported.d,
    exportSubpaths: exported.subpaths,
    bridgePath: stencilGeom.bridges.map((b) => contourToPath(bridgeContour(b))).join(""),
    islandPath: stencilGeom.islandsBefore.map((i) => contourToPath(i.contour)).join(""),
    notes: geometry.rings.flatMap((r) => r.notes),
    counts: { islandsBefore: stencilGeom.islandsBefore.length, islands: stencilGeom.islands.length, bridges: stencilGeom.bridges.length, subpaths, overflow: stencilGeom.overflow },
    computeMs: now() - t0,
  };
  const validate = (): ValidationRender => {
    const t1 = now();
    const validation = validateStencil({ geometry, stencil: stencilGeom, constraints: project.constraints, sheet: project.sheet });
    const issuePaths = validation.issues.filter((i) => i.contours.length > 0).map((i) => ({ id: i.id, severity: i.severity, d: contoursToPath(i.contours) }));
    return { validation, issuePaths, computeMs: now() - t1 };
  };
  return { stencil, validate };
}

/** Full synchronous render (tests, thumbnails, export). */
export function computeRender(project: Project): RenderData {
  const staged = computeStaged(project);
  const v = staged.validate();
  return { ...staged.stencil, validation: v.validation, issuePaths: v.issuePaths, validationMs: v.computeMs };
}

export const EMPTY_STATS: ValidationStats = { regions: 0, islands: 0, bridges: 0, cutLength: 0, apertureArea: 0 };
