import { it } from "vitest";
import "../src/geometry/motifs";
import { loadPreset } from "../src/presets";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildOutput, generateConnectors, materialComponents } from "../src/geometry/stencil/output";
import { unionApertures } from "../src/geometry/stencil/pipeline";
import { validatePositive } from "../src/validation/positive";
import { flattenRegions } from "../src/geometry/boolean";

it.skipIf(!process.env.GALLERY)("profile positive", () => {
  (globalThis as any).performance ??= { now: () => Date.now() };
  for (const id of ["dense-floral", "ethnic-border"]) {
    const p = loadPreset(id);
    p.output = { ...p.output, polarity: "positive" };
    const g = generateMandala(p);
    let t = performance.now();
    const design = unionApertures(g);
    const comps = materialComponents(design);
    const pts = flattenRegions(design).reduce((n, r) => n + r.outer.length + r.holes.reduce((m, h) => m + h.length, 0), 0);
    console.log(`${id}: union ${(performance.now() - t).toFixed(0)}ms components=${comps.length} points=${pts}`);
    t = performance.now();
    const c = generateConnectors(design, { width: 1.5, maxSpan: 14 });
    console.log(`${id}: connectors ${(performance.now() - t).toFixed(0)}ms n=${c.connectors.length} iterations=${c.iterations} components after=${materialComponents(c.material).length}`);
    t = performance.now();
    const out = buildOutput(p, g);
    console.log(`${id}: buildOutput ${(performance.now() - t).toFixed(0)}ms`);
    t = performance.now();
    const v = validatePositive({ output: out, constraints: p.constraints, minConnectionWidth: 1.5, sheet: p.sheet });
    console.log(`${id}: validatePositive ${(performance.now() - t).toFixed(0)}ms issues=${v.issues.map((i) => i.code).join(",")}`);
  }
}, 600000);
