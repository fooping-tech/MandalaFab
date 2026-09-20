/**
 * Regenerates src/presets/*.json from the Ornamental Composition Engine.
 * Run: GALLERY=1 npx vitest run scripts/make-presets.test.ts
 */
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import "../src/geometry/motifs";
import { composeMandala } from "../src/generate/compose";

const OUT = new URL("../src/presets/", import.meta.url).pathname;
const sheet = (w: number) => ({ width: w, height: w, outline: false, cornerRadius: 0 });

it.skipIf(!process.env.GALLERY)("writes presets", () => {
  const specs: { file: string; name: string; symmetry: number; density: number; seed: number; templates: string[]; sheet: number }[] = [
    { file: "dense-floral.json", name: "Dense Floral Stencil", symmetry: 12, density: 0.95, seed: 3, templates: ["floralArabesque", "gothicFloral", "lotusScroll", "laceFlower", "floralArabesque"], sheet: 200 },
    { file: "floral-lace.json", name: "Floral Lace", symmetry: 10, density: 0.75, seed: 21, templates: ["laceFlower", "floralArabesque", "lotusScroll"], sheet: 150 },
    { file: "paisley-mandala.json", name: "Paisley Mandala", symmetry: 8, density: 0.8, seed: 8, templates: ["paisleyVine", "floralArabesque", "ornamentalVine"], sheet: 200 },
    { file: "lotus-lace.json", name: "Lotus Lace", symmetry: 12, density: 0.8, seed: 12, templates: ["lotusScroll", "laceFlower", "gothicFloral"], sheet: 200 },
    { file: "arabesque.json", name: "Ornamental Arabesque", symmetry: 8, density: 0.85, seed: 5, templates: ["floralArabesque", "ornamentalVine", "gothicFloral", "laceFlower"], sheet: 200 },
  ];
  for (const sp of specs) {
    const p = composeMandala({ symmetry: sp.symmetry, density: sp.density, seed: sp.seed, templates: sp.templates, name: sp.name }, { sheet: sheet(sp.sheet) });
    writeFileSync(OUT + sp.file, JSON.stringify(p, null, 2));
    console.log("wrote", sp.file, p.rings.length, "bands", p.rings.reduce((n, r) => n + r.elements.length, 0), "elements");
  }
}, 300000);
