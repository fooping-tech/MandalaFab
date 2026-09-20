import { it } from "vitest";
import { writeFileSync } from "node:fs";
import "../src/geometry/motifs";
import { buildTruePaisley, buildHook, buildTendril, buildDoubleCurl, buildOpposedCurl, buildVine, buildCCurve, cleanBand } from "../src/geometry/elements/builders";
import { contourToPath } from "../src/editor/pipeline";
import { newElement } from "../src/model/project";
import { elementLocalRegions } from "../src/geometry/elements/sector";
import { regionsToPath } from "../src/editor/pipeline";

const OUT = "/private/tmp/claude-501/-Users-fooping-python-ws-MandalaFab/e8240cf9-55b4-42f9-a285-5e3ada416108/scratchpad/pw/paisley.html";
it.skipIf(!process.env.GALLERY)("paisley view", () => {
  let html = `<html><body style="background:#eee;font-family:sans-serif;font-size:11px"><div style="display:flex;flex-wrap:wrap;gap:6px">`;
  const cell = (label: string, d: string, extra = "") => { html += `<div style="background:#fff;padding:3px"><svg width="260" height="200" viewBox="-13 -10 26 20"><line x1="-13" y1="0" x2="13" y2="0" stroke="#ddd" stroke-width="0.1"/><path d="${d}" fill="#2b3a48" fill-rule="evenodd" fill-opacity="0.8"/>${extra}</svg><br>${label}</div>`; };
  for (const [belly, curl, tip, inset, ic] of [[0, 0, 0.7, 0, 0], [0.5, 0.4, 0.7, 0, 0], [0.5, 0.7, 0.7, 0, 0], [0.8, 1.0, 0.9, 0, 0], [0.5, 0.7, 0.7, 1.5, 0], [0.5, 0.7, 0.7, 1.5, 0.8]] as const) {
    const ps = buildTruePaisley({ length: 20, width: 10, belly, curlRadius: 0, curlAmount: curl, tipSharpness: tip, innerInset: inset, innerCurl: ic, direction: 1 }, 0.02);
    const spineD = ps.spine.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("");
    const el = newElement("paisley", { length: 20, width: 10, insetStem: 2, params: { belly, curlRadius: 0, curlAmount: curl, tipSharpness: tip, innerInset: inset, innerCurl: ic, direction: 1 } });
    const regs = elementLocalRegions(el, 40, 1, []);
    cell(`paisley belly=${belly} curl=${curl} tip=${tip} inset=${inset} ic=${ic} (regions ${regs.length})`, regionsToPath(regs), `<path d="${spineD}" stroke="#f00" stroke-width="0.15" fill="none"/>`);
  }
  cell("hook", cleanBand(buildHook(20, 10, 2, 0.35, 0.75, 1, 0.02)).map(contourToPath).join(""));
  cell("tendril", cleanBand(buildTendril(20, 10, 1.8, 0.25, 1.5, 1, 0.02)).map(contourToPath).join(""));
  cell("doublecurl", cleanBand(buildDoubleCurl(20, 10, 2, 0.35, 0.75, 0.02)).map(contourToPath).join(""));
  cell("opposedcurl", buildOpposedCurl(20, 10, 2, 0.35, 0.75, 0.02).closed.flatMap(cleanBand).map(contourToPath).join(""));
  cell("vine", cleanBand(buildVine(20, 10, 2, 0.3, 2, 0.02)).map(contourToPath).join(""));
  cell("ccurve", cleanBand(buildCCurve(20, 10, 2, 0.35, 0.02)).map(contourToPath).join(""));
  for (const kind of ["teardrop", "leaf"] as const) {
    const el = newElement(kind, { length: 20, width: 10, inset: 1.6, insetStem: 2, children: [newElement("teardrop", { x: 1, length: 12, width: 5, mode: "cut" })] });
    cell(`nested ${kind}`, regionsToPath(elementLocalRegions(el, 40, 1, [])));
  }
  html += `</div></body></html>`;
  writeFileSync(OUT, html);
});
