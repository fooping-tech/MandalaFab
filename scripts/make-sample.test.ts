/** Writes a filled SVG of a 12-fold mandala to the scratchpad for manual import testing. */
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import "../src/geometry/motifs";
import { composeMandala } from "../src/generate/compose";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil } from "../src/geometry/stencil/pipeline";
import { exportSVG } from "../src/export/svg";

it.skipIf(!process.env.GALLERY)("writes sample svg", () => {
  const p = composeMandala({ symmetry: 12, density: 0.55, seed: 4, templates: ["floralArabesque", "lotusScroll"] }, { sheet: { width: 150, height: 150, outline: false, cornerRadius: 0 } });
  const { svg } = exportSVG(p, buildStencil(p, generateMandala(p)).final, { fill: true, metadata: false });
  const out = process.env.SAMPLE_OUT ?? "/private/tmp/claude-501/-Users-fooping-python-ws-MandalaFab/e8240cf9-55b4-42f9-a285-5e3ada416108/scratchpad/pw/sample-mandala.svg";
  writeFileSync(out, svg);
  console.log("wrote", out);
});
