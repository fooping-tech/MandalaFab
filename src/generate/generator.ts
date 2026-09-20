/**
 * Density-driven procedural mandala generator, built on the Ornamental
 * Composition Engine (see compose.ts). Same (symmetry, density, seed) => same project.
 */
import type { GeneratorParams, Project } from "../model/project";
import type { ElementPart } from "../model/library";
import { composeMandala, type PartsSettings } from "./compose";

/**
 * Turn library element parts into composer candidates using the generator's
 * frequency / weights (parts with weight 0 are excluded).
 */
export function partsSettingsFor(params: GeneratorParams, parts: readonly ElementPart[]): PartsSettings | undefined {
  const frequency = params.partsFrequency ?? 0;
  if (frequency <= 0 || parts.length === 0) return undefined;
  const candidates = parts.map((p) => ({ id: p.id, name: p.name, element: p.data, compounds: p.compounds, weight: params.partWeights?.[p.id] ?? 1 })).filter((c) => c.weight > 0);
  return candidates.length > 0 ? { candidates, frequency } : undefined;
}

export function generateProject(params: GeneratorParams, base?: Partial<Project>, parts: readonly ElementPart[] = []): Project {
  return composeMandala({ symmetry: params.symmetry, density: params.density, seed: params.seed, parts: partsSettingsFor(params, parts) }, base);
}
