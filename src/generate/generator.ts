/**
 * Random mandala generator. Same (params, seed) => same project.
 * The generator biases toward stencil-friendly output: mostly filled shapes,
 * outline bands only at moderate density, ring radii spread across the sheet.
 */
import { defaultRing, emptyProject, type GeneratorParams, type Project, type Ring } from "../model/project";
import { mulberry32 } from "./random";

const FILLED_MOTIFS = ["petal", "leaf", "diamond", "triangle", "teardrop", "circle", "dot", "line", "arc"] as const;
const LINE_MOTIFS = ["wave", "spiral"] as const;

export function generateProject(params: GeneratorParams, base?: Partial<Project>): Project {
  const rng = mulberry32(params.seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const range = (min: number, max: number): number => min + rng() * (max - min);
  const round = (v: number, step = 0.5): number => Math.round(v / step) * step;

  const project = emptyProject(`Mandala #${params.seed}`);
  Object.assign(project, base ?? {});
  project.symmetry = params.symmetry;
  project.seed = params.seed;
  project.generator = { ...params };

  const sheetMin = Math.min(project.sheet.width, project.sheet.height);
  const outerRadius = sheetMin / 2 - Math.max(4, sheetMin * 0.05);
  const ringCount = Math.max(1, Math.round(params.ringCount));
  const complexity = Math.min(5, Math.max(1, params.complexity));
  const density = Math.min(1, Math.max(0, params.density));
  const sym = Math.max(1, Math.round(params.symmetry));

  const rings: Ring[] = [];
  // Center element.
  const centerR = round(range(outerRadius * 0.04, outerRadius * 0.1));
  rings.push(defaultRing({ name: "Center", motif: rng() < 0.7 ? "circle" : "dot", count: 1, radius: 0, length: centerR * 2, width: centerR * 2 }));

  const innerStart = centerR + Math.max(3, outerRadius * 0.06);
  const step = (outerRadius - innerStart) / ringCount;
  for (let i = 0; i < ringCount; i++) {
    const rInner = innerStart + step * i;
    const rOuter = rInner + step;
    const radius = round((rInner + rOuter) / 2);
    const bandLength = round(step * range(0.55, 0.95));
    const multiplier = complexity >= 4 && rng() < 0.4 ? 2 : complexity <= 2 && rng() < 0.3 && sym % 2 === 0 ? 0.5 : 1;
    const count = Math.max(1, Math.round(sym * multiplier));
    const circumference = 2 * Math.PI * radius;
    const slot = circumference / count;
    const useLine = complexity >= 3 && rng() < 0.15;
    const motif = useLine ? pick(LINE_MOTIFS) : pick(FILLED_MOTIFS);
    const width = round(Math.max(1.5, slot * range(0.35, 0.5 + 0.4 * density)));
    const outline = !useLine && density > 0.4 && complexity >= 3 && rng() < 0.3 && bandLength > 8 && width > 8;
    const ring = defaultRing({
      name: `Ring ${i + 1}`,
      motif,
      count,
      radius,
      length: bandLength,
      width: Math.min(width, slot * 0.9),
      phase: rng() < 0.5 ? 0 : 180 / count,
      strokeWidth: useLine ? round(range(1.2, 2.2), 0.1) : outline ? round(range(1.5, 2.5), 0.1) : 0,
      direction: rng() < 0.2 ? "inward" : "outward",
      stagger: complexity >= 4 && rng() < 0.25 && count % 2 === 0 ? round(range(-step * 0.2, step * 0.2)) : 0,
    });
    rings.push(ring);
    // Dense designs add a small dot ring between bands.
    if (density > 0.6 && rng() < density - 0.3 && i < ringCount - 1) {
      const dotR = round(rOuter);
      const dotSize = round(Math.min(3, Math.max(1.2, step * 0.18)), 0.1);
      rings.push(defaultRing({ name: `Dots ${i + 1}`, motif: "dot", count: count * 2, radius: dotR, length: dotSize, width: dotSize, phase: 180 / (count * 2) }));
    }
  }
  project.rings = rings;
  return project;
}
