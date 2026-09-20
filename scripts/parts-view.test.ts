import { it } from "vitest";
import { writeFileSync } from "node:fs";
import "../src/geometry/motifs";
import { generateProject } from "../src/generate/generator";
import { partFromElement } from "../src/model/library";
import { emptyProject, newElement } from "../src/model/project";
import { computeRender } from "../src/editor/pipeline";

const OUT = "/private/tmp/claude-501/-Users-fooping-python-ws-MandalaFab/e8240cf9-55b4-42f9-a285-5e3ada416108/scratchpad/pw/gallery.html";
it.skipIf(!process.env.GALLERY)("parts view (GALLERY=1 npx vitest run scripts/parts-view.test.ts)", () => {
  (globalThis as any).performance ??= { now: () => Date.now() };
  const p0 = emptyProject("src");
  const leaf = newElement("leaf", { name: "user leaf", length: 12, width: 6, inset: 1.4, insetStem: 1.8, params: { tipSharpness: 0.85, bend: 0.2 }, children: [newElement("dot", { length: 2, width: 2 })] });
  const star = newElement("shape", { name: "user star", motif: "star", length: 8, width: 8, params: { points: 5, inner: 0.5 } });
  const parts = [partFromElement(leaf, p0.compounds, "user leaf"), partFromElement(star, p0.compounds, "user star")];
  const base = { sheet: { width: 200, height: 200, outline: false, cornerRadius: 0 } };
  let html = `<html><body style="background:#eee;font-family:sans-serif;font-size:11px"><div style="display:flex;flex-wrap:wrap;gap:8px">`;
  for (const f of [1, 0.5]) {
    const p = generateProject({ symmetry: 12, density: 0.8, seed: 5, partsFrequency: f, partWeights: { [parts[0]!.id]: 1, [parts[1]!.id]: 1 } }, base, parts);
    for (const r of p.rings) {
      const names = r.elements.map((e) => `${e.name}[${e.role ?? "-"}]${e.name?.startsWith("user") ? ` s=${e.scaleX} at ${e.x},${e.y}` : ""}`);
      console.log(`f=${f} ${r.name}: ${names.join(" | ")}`);
    }
    const r = computeRender(p);
    const w = 200;
    html += `<div style="background:#fff;padding:4px;width:900px"><svg width="900" height="900" viewBox="-100 -100 200 200"><rect x="-100" y="-100" width="200" height="200" fill="#f3efe6"/><path d="${r.finalPath}" fill="#4a3a2a" fill-rule="evenodd"/><path d="${r.bridgePath}" fill="#f6b26b"/></svg><br>f=${f} paths=${r.counts.subpaths} islands=${r.counts.islandsBefore} bridges=${r.counts.bridges}</div>`;
    void w;
  }
  html += `</div></body></html>`;
  writeFileSync(OUT, html);
}, 300000);
