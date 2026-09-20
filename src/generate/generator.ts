/**
 * Density-driven procedural mandala generator. Same (symmetry, density, seed) => same project.
 *
 * density 0..1 raises the number of bands, elements per sector, nested repeats,
 * decorative dots and curve detail, and shrinks the negative space between bands.
 * Every band is a sector template (teardrops, leaves, curls, paisleys, S-curves,
 * dots) designed on the half sector and mirrored.
 */
import { emptyProject, newElement, newId, type CenterMotif, type GeneratorParams, type Project, type Ring, type SectorElement } from "../model/project";
import { mulberry32 } from "./random";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface BandCtx {
  rng: () => number;
  density: number;
  /** Radial extent available to the band (mm). */
  L: number;
  /** Tangential extent of the sector at the band radius (mm). */
  W: number;
  /** Sector angle (deg). */
  angle: number;
  radius: number;
}

type Template = (c: BandCtx) => SectorElement[];

const rnd = (c: BandCtx, a: number, b: number): number => Math.round((a + (b - a) * c.rng()) * 10) / 10;

const el = (type: SectorElement["type"], p: Partial<SectorElement>): SectorElement => newElement(type, p);

/** Axis teardrop + leaf pair + dots (+ curls when dense). */
const teardropCluster: Template = (c) => {
  const out: SectorElement[] = [];
  const L = c.L * rnd(c, 0.75, 0.95);
  const W = Math.min(c.W * 0.36, L * 0.55);
  out.push(el("teardrop", { name: "teardrop", x: 0, y: 0, length: L, width: W, params: { tipSharpness: rnd(c, 0.5, 0.9), curvature: 0 } }));
  out.push(el("leaf", { name: "leaf", x: -L * 0.15, y: W * 0.55 + c.W * 0.1, rotation: rnd(c, 20, 40), length: L * 0.55, width: W * 0.55, params: { tipSharpness: 0.8, bend: rnd(c, -0.2, 0.3) } }));
  if (c.density > 0.35) out.push(el("dot", { name: "dot", x: L * 0.3, y: c.W * 0.3, length: 2, width: 2 }));
  if (c.density > 0.55) out.push(el("curl", { name: "curl", x: L * 0.1, y: c.W * 0.36, rotation: rnd(c, 35, 60), length: L * 0.55, width: W * 0.9, strokeWidth: 1.3, params: { turns: 1.25, taper: 0.7, direction: 1, radius: 0 } }));
  if (c.density > 0.8) out.push(el("dot", { name: "dot", x: -L * 0.42, y: c.W * 0.22, length: 1.8, width: 1.8 }));
  return out;
};

/** Mirrored paisley pair with inner gap + axis accent. */
const paisleyPair: Template = (c) => {
  const out: SectorElement[] = [];
  const L = c.L * rnd(c, 0.75, 0.95);
  const W = Math.min(c.W * 0.34, L * 0.55);
  const gap = c.density > 0.45 && W > 5 ? rnd(c, 1.2, 1.8) : 0;
  out.push(el("paisley", { name: "paisley", x: 0, y: W * 0.62, rotation: rnd(c, 5, 20), length: L, width: W, insetStem: gap > 0 ? 1.8 : 0, params: { curl: rnd(c, 0.5, 0.9), tip: 0.75, innerGap: gap } }));
  out.push(el("dot", { name: "dot", x: -L * 0.4, y: 0, length: Math.min(3, W * 0.45), width: Math.min(3, W * 0.45) }));
  if (c.density > 0.4) out.push(el("leaf", { name: "leaf", x: L * 0.42, y: 0, length: L * 0.35, width: W * 0.45, params: { tipSharpness: 0.9, bend: 0 } }));
  if (c.density > 0.65) out.push(el("dot", { name: "dot", x: L * 0.05, y: c.W * 0.44, length: 1.8, width: 1.8 }));
  return out;
};

/** Curl pairs (arabesque) with a small axis teardrop. */
const curlPair: Template = (c) => {
  const out: SectorElement[] = [];
  const L = c.L * rnd(c, 0.8, 0.95);
  const W = Math.min(c.W * 0.42, L * 0.75);
  out.push(el("curl", { name: "curl", x: -L * 0.05, y: W * 0.45, rotation: rnd(c, 10, 30), length: L * 0.85, width: W, strokeWidth: rnd(c, 1.2, 1.6), params: { turns: rnd(c, 1, 1.75), taper: 0.7, direction: 1, radius: 0 } }));
  out.push(el("teardrop", { name: "teardrop", x: -L * 0.15, y: 0, length: L * 0.45, width: W * 0.45, params: { tipSharpness: 0.7, curvature: 0 } }));
  if (c.density > 0.4) out.push(el("dot", { name: "dot", x: L * 0.42, y: 0, length: 2.2, width: 2.2 }));
  if (c.density > 0.6) out.push(el("dot", { name: "dot", x: L * 0.15, y: c.W * 0.42, length: 1.8, width: 1.8 }));
  return out;
};

/** Bordered lotus (teardrop with inset + stem) flanked by leaves. */
const lotusBordered: Template = (c) => {
  const out: SectorElement[] = [];
  const L = c.L * rnd(c, 0.85, 1);
  const W = Math.min(c.W * 0.45, L * 0.6);
  const inset = W > 7 ? rnd(c, 1.5, 2.2) : 0;
  out.push(el("teardrop", { name: "lotus", x: 0, y: 0, length: L, width: W, inset, insetStem: inset > 0 ? 2 : 0, params: { tipSharpness: 0.85, curvature: 0 } }));
  out.push(el("leaf", { name: "leaf", x: -L * 0.2, y: W * 0.5 + c.W * 0.08, rotation: rnd(c, 25, 45), length: L * 0.5, width: W * 0.4, params: { tipSharpness: 0.85, bend: 0.2 } }));
  if (c.density > 0.5) out.push(el("dot", { name: "dot", x: L * 0.2, y: c.W * 0.36, length: 2, width: 2 }));
  if (c.density > 0.7) out.push(el("teardrop", { name: "drop", x: L * 0.35, y: c.W * 0.3, rotation: rnd(c, 20, 35), length: L * 0.3, width: W * 0.3, params: { tipSharpness: 0.7, curvature: 0 } }));
  return out;
};

/** S-curve lattice with dots. */
const scurveLattice: Template = (c) => {
  const out: SectorElement[] = [];
  const L = c.L * rnd(c, 0.8, 0.95);
  const W = Math.min(c.W * 0.4, L * 0.8);
  out.push(el("scurve", { name: "s-curve", x: 0, y: W * 0.45, rotation: rnd(c, 0, 20), length: L, width: W * 0.8, strokeWidth: rnd(c, 1.2, 1.6), params: { curvature: rnd(c, 0.4, 0.8) } }));
  out.push(el("dot", { name: "dot", x: -L * 0.35, y: 0, length: 2.4, width: 2.4 }));
  out.push(el("dot", { name: "dot", x: L * 0.35, y: 0, length: 2.4, width: 2.4 }));
  if (c.density > 0.5) out.push(el("leaf", { name: "leaf", x: 0, y: 0, length: L * 0.45, width: W * 0.3, params: { tipSharpness: 0.9, bend: 0 } }));
  return out;
};

/** Fan of leaves (local repeat) with a dot row. */
const fanLeaves: Template = (c) => {
  const out: SectorElement[] = [];
  const L = c.L * rnd(c, 0.8, 0.95);
  const n = c.density > 0.6 ? 3 : 2;
  const W = Math.min((c.W / (n * 2)) * 0.8, L * 0.4);
  out.push(el("leaf", { name: "leaf fan", x: 0, y: 0, length: L, width: W, repeat: n * 2, repeatSpread: c.angle * 0.9, orient: "radial", params: { tipSharpness: 0.8, bend: 0 } }));
  if (c.density > 0.35) out.push(el("dot", { name: "dots", x: -L * 0.45, y: 0, length: 1.8, width: 1.8, repeat: n * 2, repeatSpread: c.angle * 0.9 }));
  return out;
};

/** Petal row (local repeat 2) with teardrop tips. */
const petalRow: Template = (c) => {
  const out: SectorElement[] = [];
  const L = c.L * rnd(c, 0.8, 0.95);
  const W = Math.min(c.W * 0.24, L * 0.55);
  out.push(el("petal", { name: "petals", x: 0, y: 0, length: L, width: W, repeat: 2, repeatSpread: c.angle * 0.5, orient: "radial", params: { bulge: 1, shoulder: 0.35 } }));
  out.push(el("teardrop", { name: "tip", x: L * 0.55, y: 0, length: L * 0.35, width: W * 0.7, params: { tipSharpness: 0.9, curvature: 0 } }));
  if (c.density > 0.5) out.push(el("dot", { name: "dot", x: -L * 0.5, y: 0, length: 2, width: 2 }));
  return out;
};

/** Small teardrops and dots (band separators). */
const arcDots: Template = (c) => {
  const out: SectorElement[] = [];
  const L = Math.min(5, c.L * 0.9);
  out.push(el("teardrop", { name: "drop", x: 0, y: 0, length: L, width: Math.min(2.6, L * 0.55), params: { tipSharpness: 0.75, curvature: 0 } }));
  out.push(el("dot", { name: "dot", x: -L * 0.2, y: c.W * 0.3, length: 1.8, width: 1.8 }));
  return out;
};

const TEMPLATES: Template[] = [teardropCluster, paisleyPair, curlPair, lotusBordered, scurveLattice, fanLeaves, petalRow];

export function generateProject(params: GeneratorParams, base?: Partial<Project>): Project {
  const rng = mulberry32(params.seed);
  const density = Math.min(1, Math.max(0, params.density));
  const sym = Math.max(1, Math.round(params.symmetry));
  const project = emptyProject(`Mandala #${params.seed}`);
  Object.assign(project, base ?? {});
  project.symmetry = sym;
  project.seed = params.seed;
  project.generator = { ...params };

  const sheetMin = Math.min(project.sheet.width, project.sheet.height);
  const Rmax = sheetMin / 2 - Math.max(4, sheetMin * 0.04);

  // Center flower.
  const centerTypes: CenterMotif["type"][] = ["radialPetals", "sunflower", "circularPetals", "starburst"];
  const centerOuter = Math.round(Rmax * lerp(0.14, 0.2, rng()));
  const centerInner = Math.max(2, Math.round(centerOuter * 0.3));
  // Petal pitch at the inner radius must leave a gap of about the minimum material width.
  let petals = sym * (density > 0.5 ? 3 : 2);
  const maxPetals = Math.floor((2 * Math.PI * centerInner) / 3);
  while (petals > Math.max(sym, maxPetals) && petals > sym) petals -= sym;
  project.center = {
    type: centerTypes[Math.floor(rng() * centerTypes.length)]!,
    petals,
    innerRadius: centerInner,
    outerRadius: centerOuter,
    petalWidth: Math.max(1.5, Math.round(((2 * Math.PI * centerInner) / petals - 1.2) * 10) / 10),
    coreRadius: Math.max(1.5, Math.round(centerOuter * 0.14 * 10) / 10),
    strokeWidth: 0,
    rotation: 0,
  };

  // Bands.
  const bands = Math.round(lerp(2, 5, density));
  const gap = lerp(6, 2.5, density);
  const start = centerOuter + gap + 2;
  const step = (Rmax - start) / bands;
  const rings: Ring[] = [];
  let lastTemplate = -1;
  for (let i = 0; i < bands; i++) {
    const r0 = start + step * i;
    const radius = Math.round((r0 + step / 2) * 10) / 10;
    const repeat = i % 2 === 1 && density > 0.6 && rng() < 0.4 ? sym * 2 : sym;
    const angle = 360 / repeat;
    const W = 2 * Math.PI * radius * (angle / 360);
    const L = step - gap;
    let ti = Math.floor(rng() * TEMPLATES.length);
    if (ti === lastTemplate) ti = (ti + 1) % TEMPLATES.length;
    lastTemplate = ti;
    const ctx: BandCtx = { rng, density, L, W, angle, radius };
    const elements = TEMPLATES[ti]!(ctx);
    rings.push({ id: newId("r"), name: `Band ${i + 1}`, visible: true, radius, repeat, phase: i % 2 === 1 ? angle / 2 : 0, mirrorLocal: true, elements });
    // Dense designs add a thin separator band of arcs/dots between bands.
    if (density > 0.7 && i < bands - 1 && rng() < density - 0.3) {
      const sr = Math.round((r0 + step - gap * 0.45) * 10) / 10;
      const sAngle = 360 / (sym * 2);
      rings.push({ id: newId("r"), name: `Separator ${i + 1}`, visible: true, radius: sr, repeat: sym * 2, phase: sAngle / 2, mirrorLocal: true, elements: arcDots({ rng, density, L: gap * 0.9, W: 2 * Math.PI * sr * (sAngle / 360), angle: sAngle, radius: sr }) });
    }
  }
  project.rings = rings;
  return project;
}
