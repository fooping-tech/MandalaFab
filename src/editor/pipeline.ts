/**
 * Turns a Project into everything the canvas needs, as plain path strings so the
 * DOM stays O(rings) regardless of how many motif copies exist.
 */
import type { Project } from "../model/project";
import { generateMandala, type MandalaGeometry } from "../geometry/radial/mandala";
import { buildStencil, type StencilGeometry } from "../geometry/stencil/pipeline";
import { bridgeContour } from "../geometry/stencil/bridges";
import { flattenRegions } from "../geometry/boolean";
import type { Contour } from "../geometry/types";
import { validateStencil, type ValidationResult } from "../validation";
import { formatNumber } from "../export/svg";

export interface IssuePath {
  id: string;
  severity: "error" | "warning" | "info";
  d: string;
}

export interface RenderData {
  geometry: MandalaGeometry;
  stencil: StencilGeometry;
  validation: ValidationResult;
  /** Raw (pre-union) aperture outlines per ring, as one compound path each. */
  ringPaths: { ringId: string; d: string }[];
  /** Final apertures after union + bridges (evenodd compound path). */
  finalPath: string;
  /** Bridge rectangles. */
  bridgePath: string;
  /** Islands before bridging (for the design view). */
  islandPath: string;
  issuePaths: IssuePath[];
  computeMs: number;
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

export function computeRender(project: Project): RenderData {
  const t0 = performance.now();
  const geometry = generateMandala(project);
  const stencil = buildStencil(project, geometry);
  const validation = validateStencil({ geometry, stencil, constraints: project.constraints, sheet: project.sheet });
  const ringPaths = geometry.rings.map((ring) => {
    const parts: string[] = [];
    for (const r of ring.apertures) {
      parts.push(contourToPath(r.outer));
      for (const h of r.holes) parts.push(contourToPath(h));
    }
    return { ringId: ring.ringId, d: parts.join("") };
  });
  const finalParts: string[] = [];
  for (const r of flattenRegions(stencil.final)) {
    finalParts.push(contourToPath(r.outer));
    for (const h of r.holes) finalParts.push(contourToPath(h));
  }
  const bridgePath = stencil.bridges.map((b) => contourToPath(bridgeContour(b))).join("");
  const islandPath = stencil.islandsBefore.map((i) => contourToPath(i.contour)).join("");
  const issuePaths: IssuePath[] = validation.issues
    .filter((i) => i.contours.length > 0)
    .map((i) => ({ id: i.id, severity: i.severity, d: contoursToPath(i.contours) }));
  return { geometry, stencil, validation, ringPaths, finalPath: finalParts.join(""), bridgePath, islandPath, issuePaths, computeMs: performance.now() - t0 };
}
