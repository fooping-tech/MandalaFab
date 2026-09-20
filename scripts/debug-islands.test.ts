import { it } from "vitest";
import "../src/geometry/motifs";
import { composeMandala } from "../src/generate/compose";
import { generateMandala } from "../src/geometry/radial/mandala";
import { unionApertures } from "../src/geometry/stencil/pipeline";
import { findIslands } from "../src/geometry/stencil/islands";

it.skipIf(!process.env.GALLERY)("island debug", () => {
  const tpl = process.env.TPL ?? "floralArabesque";
  const p = composeMandala({ symmetry: 12, density: 0.85, seed: 3, templates: [tpl] }, { sheet: { width: 200, height: 200, outline: false, cornerRadius: 0 } });
  console.log("bands", p.rings.map((r) => `${r.name} R=${r.radius}`).join(" | "));
  const g = generateMandala(p);
  const all = findIslands(unionApertures(g));
  const sector = 360 / 12;
  const rows = all.map((i) => {
    const ang = ((Math.atan2(i.centroid.y, i.centroid.x) * 180) / Math.PI + 90 + 3600) % sector;
    return `r=${i.radius.toFixed(1)} ang=${ang.toFixed(1)} a=${i.area.toFixed(2)}`;
  });
  const uniq = new Map<string, number>();
  for (const r of rows) uniq.set(r, (uniq.get(r) ?? 0) + 1);
  console.log("islands", all.length);
  for (const [k, v] of [...uniq.entries()].sort()) console.log(v, k);
}, 120000);
