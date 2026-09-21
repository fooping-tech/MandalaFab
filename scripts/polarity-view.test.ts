import { it } from "vitest";
import { writeFileSync } from "node:fs";
import "../src/geometry/motifs";
import { loadPreset } from "../src/presets";
import { computeStaged } from "../src/editor/pipeline";
import { contourToPath } from "../src/editor/pipeline";
import { sheetContour } from "../src/geometry/stencil/sheet";

const OUT = "/private/tmp/claude-501/-Users-fooping-python-ws-MandalaFab/e8240cf9-55b4-42f9-a285-5e3ada416108/scratchpad/pw/gallery.html";
it.skipIf(!process.env.GALLERY)("polarity view (GALLERY=1 npx vitest run scripts/polarity-view.test.ts)", () => {
  (globalThis as any).performance ??= { now: () => Date.now() };
  let html = `<html><body style="background:#eee;font-family:sans-serif;font-size:11px"><div style="display:flex;flex-wrap:wrap;gap:8px">`;
  for (const id of ["ethnic-border", "dense-floral"]) {
    for (const polarity of ["stencil", "positive"] as const) {
      const p = loadPreset(id);
      p.output = { ...p.output, polarity };
      const t0 = Date.now();
      const r = computeStaged(p).stencil;
      const ms = Date.now() - t0;
      const w = p.sheet.width;
      const sheet = contourToPath(sheetContour(p.sheet));
      const body =
        polarity === "stencil"
          ? `<path d="${sheet}" fill="#ffffff"/><path d="${r.finalPath}" fill="#5b6470" fill-rule="evenodd"/><path d="${r.bridgePath}" fill="#f6b26b"/>`
          : `<path d="${sheet}" fill="#8a939e"/><path d="${r.materialPath}" fill="#ffffff" fill-rule="evenodd"/><path d="${r.connectorPath}" fill="#8fc3a5" stroke="#3f8f6b" stroke-width="0.2"/><path d="${r.strayPath}" fill="none" stroke="#d84435" stroke-width="0.6"/>`;
      html += `<div style="background:#fff;padding:4px;width:640px"><svg width="640" height="640" viewBox="${-w / 2} ${-w / 2} ${w} ${w}"><rect x="${-w / 2}" y="${-w / 2}" width="${w}" height="${w}" fill="#5b6470"/>${body}</svg><br>${id} · ${polarity}: paths=${r.exportSubpaths} components=${r.counts.components} (before ${r.counts.componentsBefore}) connectors=${r.counts.connectors} ${ms}ms</div>`;
      console.log(`${id} ${polarity}: paths=${r.exportSubpaths} components=${r.counts.components}/${r.counts.componentsBefore} connectors=${r.counts.connectors} ${ms}ms`);
    }
  }
  html += `</div></body></html>`;
  writeFileSync(OUT, html);
}, 300000);
