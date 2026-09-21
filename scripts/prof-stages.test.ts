import { it } from "vitest";
import "../src/geometry/motifs";
import { loadPreset } from "../src/presets";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil } from "../src/geometry/stencil/pipeline";
import { computeStaged } from "../src/editor/pipeline";
import { validateStencil } from "../src/validation";

it.skipIf(!process.env.GALLERY)("profile stages", () => {
  (globalThis as any).performance ??= { now: () => Date.now() };
  for (const id of ["dense-floral", "ethnic-border"]) {
    const p = loadPreset(id);
    for (let i = 0; i < 2; i++) {
      let t = performance.now();
      const g = generateMandala(p);
      const tg = performance.now() - t; t = performance.now();
      const s = buildStencil(p, g);
      const ts = performance.now() - t; t = performance.now();
      const st = computeStaged(p);
      const tst = performance.now() - t; t = performance.now();
      st.validate();
      const tv = performance.now() - t; t = performance.now();
      validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet: p.sheet });
      const tv2 = performance.now() - t;
      const modified = { ...p, rings: p.rings.map((r, j) => (j === 0 ? { ...r, radius: r.radius + 0.5 } : r)) };
      t = performance.now();
      generateMandala(modified);
      const tg2 = performance.now() - t;
      console.log(`${id} run${i}: generate ${tg.toFixed(0)} | stencil ${ts.toFixed(0)} | computeStaged(total) ${tst.toFixed(0)} | validate ${tv.toFixed(0)} / ${tv2.toFixed(0)} | generate(1 ring changed) ${tg2.toFixed(0)} ms; paths=${st.stencil.elementPaths.length} pathChars=${st.stencil.elementPaths.reduce((n, e) => n + e.d.length, 0)}`);
    }
  }
}, 120000);
