/**
 * Density-driven procedural mandala generator, built on the Ornamental
 * Composition Engine (see compose.ts). Same (symmetry, density, seed) => same project.
 */
import type { GeneratorParams, Project } from "../model/project";
import { composeMandala } from "./compose";

export function generateProject(params: GeneratorParams, base?: Partial<Project>): Project {
  return composeMandala({ symmetry: params.symmetry, density: params.density, seed: params.seed }, base);
}
