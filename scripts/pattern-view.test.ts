import { it } from "vitest";
import { writeFileSync } from "node:fs";
import "../src/geometry/motifs";
import { newElement } from "../src/model/project";
import { elementLocalRegions } from "../src/geometry/elements/sector";
import { regionsToPath } from "../src/editor/pipeline";

const OUT = "/private/tmp/claude-501/-Users-fooping-python-ws-MandalaFab/e8240cf9-55b4-42f9-a285-5e3ada416108/scratchpad/pw/pattern.html";
it.skipIf(!process.env.GALLERY)("pattern view", () => {
  let html = `<html><body style="background:#eee;font-family:sans-serif;font-size:11px"><div style="display:flex;flex-wrap:wrap;gap:6px">`;
  const cell = (label: string, d: string) => { html += `<div style="background:#fff;padding:3px"><svg width="260" height="200" viewBox="-13 -10 26 20"><line x1="-13" y1="0" x2="13" y2="0" stroke="#ddd" stroke-width="0.1"/><path d="${d}" fill="#2b3a48" fill-rule="evenodd" fill-opacity="0.8"/></svg><br>${label}</div>`; };
  const show = (label: string, el: ReturnType<typeof newElement>) => { const notes: string[] = []; const regs = elementLocalRegions(el, 40, 1, notes); cell(`${label} (regions ${regs.length}) ${notes.join(" ")}`, regionsToPath(regs)); };
  show("morew 18x11 t1 thorn0", newElement("shape", { motif: "morew", length: 18, width: 11, params: { turns: 1, thorn: 0, direction: 1 } }));
  show("morew 18x11 t1 thorn0.6 dir-1", newElement("shape", { motif: "morew", length: 18, width: 11, params: { turns: 1, thorn: 0.6, direction: -1 } }));
  show("morew 13x8 t1.5", newElement("shape", { motif: "morew", length: 13, width: 8, params: { turns: 1.5, thorn: 0, direction: 1 } }));
  show("morew 8x5 t1", newElement("shape", { motif: "morew", length: 8, width: 5, params: { turns: 1, thorn: 0, direction: 1 } }));
  show("urenmorew 24x22 t0.75", newElement("shape", { motif: "urenmorew", length: 24, width: 22, params: { turns: 0.75 } }));
  show("urenmorew 9x8 t0.75", newElement("shape", { motif: "urenmorew", length: 9, width: 8, params: { turns: 0.75 } }));
  show("urenmorew 20x14 t1", newElement("shape", { motif: "urenmorew", length: 20, width: 14, params: { turns: 1 } }));
  show("arch 19x15 p0.55 inset", newElement("arch", { length: 19, width: 15, inset: 1.6, insetStem: 2, params: { pointed: 0.55 } }));
  show("arch 9x10 p0", newElement("arch", { length: 9, width: 10, params: { pointed: 0 } }));
  show("fan 19x18 spokes6 eye rim", newElement("fan", { length: 19, width: 18, params: { pointed: 0.45, spokes: 6, spokeWidth: 1.3, eye: 0.22, rim: 1.6 } }));
  show("fan 15x11 spokes4", newElement("fan", { length: 15, width: 11, params: { pointed: 0.2, spokes: 4, spokeWidth: 1.3, eye: 0.28, rim: 0 } }));
  show("zigzag 22x6 waves2", newElement("zigzag", { length: 22, width: 6, strokeWidth: 2.2, params: { waves: 2, tip: 1 } }));
  show("zigzag 9x7 waves1", newElement("zigzag", { length: 9, width: 7, strokeWidth: 1.6, params: { waves: 1, tip: 1 } }));
  show("heart 17 + inner uren", newElement("shape", { motif: "heart", length: 17, width: 17, inset: 1.8, insetStem: 2.2, children: [newElement("shape", { motif: "urenmorew", x: -1, length: 9, width: 8, params: { turns: 0.75 } })] }));
  html += `</div></body></html>`;
  writeFileSync(OUT, html);
});
