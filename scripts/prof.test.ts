import { it } from "vitest";
import "../src/geometry/motifs";
import { loadPreset } from "../src/presets";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil } from "../src/geometry/stencil/pipeline";
import { cleanRegions, difference, flattenRegions, offset } from "../src/geometry/boolean";
import { sheetRegion } from "../src/geometry/stencil/sheet";
import { validateStencil } from "../src/validation";

it.skipIf(!process.env.GALLERY)("profile validation", () => {
  const p = loadPreset("dense-floral");
  const g = generateMandala(p);
  const s = buildStencil(p, g);
  const flat = flattenRegions(s.final);
  const pts = flat.reduce((n, r) => n + r.outer.length + r.holes.reduce((m, h) => m + h.length, 0), 0);
  console.log("final regions", flat.length, "points", pts);
  let t = Date.now();
  const material = difference([sheetRegion(p.sheet)], flat);
  console.log("material diff", Date.now() - t, "ms");
  t = Date.now();
  const eroded = offset(flattenRegions(material), -0.5, "square");
  console.log("erode material", Date.now() - t, "ms", flattenRegions(eroded).length);
  for (const dist of [0.02, 0.05, 0.1]) {
    t = Date.now();
    const coarse = cleanRegions(flattenRegions(material), dist);
    const pts2 = coarse.reduce((n, r) => n + r.outer.length + r.holes.reduce((m, h) => m + h.length, 0), 0);
    const er = flattenRegions(offset(coarse, -0.5, "square"));
    const t2 = Date.now();
    offset(er, 0.5, "square");
    console.log("clean", dist, "points", pts2, "erode+dilate", Date.now() - t, "ms (dilate", Date.now() - t2, "ms)");
  }
  for (const [join, tol] of [["square", 0.02], ["round", 0.2]] as const) {
    t = Date.now();
    offset(flattenRegions(material), -0.5, join, tol);
    console.log("erode", join, tol, Date.now() - t, "ms");
  }
  t = Date.now();
  const opened = offset(flattenRegions(eroded), 0.5, "round", 0.2);
  t = Date.now();
  difference(flattenRegions(material), flattenRegions(opened));
  console.log("difference slivers", Date.now() - t, "ms");
  t = Date.now();
  offset(flat, -0.5, "square");
  console.log("erode apertures", Date.now() - t, "ms");
  t = Date.now();
  validateStencil({ geometry: g, stencil: s, constraints: p.constraints, sheet: p.sheet });
  console.log("validate total", Date.now() - t, "ms");
}, 120000);
