import { it } from "vitest";
import { writeFileSync } from "node:fs";
import "../src/geometry/motifs";
import { composeMandala, TEMPLATE_NAMES } from "../src/generate/compose";
import { buildSector, elementLocalRegions } from "../src/geometry/elements/sector";
import { union, flattenRegions } from "../src/geometry/boolean";
import { findIslands } from "../src/geometry/stencil/islands";
import { regionsToPath, contourToPath } from "../src/editor/pipeline";
import type { Region } from "../src/geometry/types";

const OUT = "/private/tmp/claude-501/-Users-fooping-python-ws-MandalaFab/e8240cf9-55b4-42f9-a285-5e3ada416108/scratchpad/pw/sector.html";
const COLORS: Record<string, string> = { primary: "#2b3a48", secondary: "#2f7bb5", flow: "#c8793f", filler: "#7a8c99", boundary: "#3f8f6b" };

it.skipIf(!process.env.GALLERY)("sector view", () => {
  const templates = process.env.TPL ? process.env.TPL.split(",") : TEMPLATE_NAMES;
  let html = `<html><body style="background:#eee;font-family:sans-serif;font-size:11px"><div style="display:flex;flex-wrap:wrap;gap:8px">`;
  for (const t of templates) {
    const p = composeMandala({ symmetry: 12, density: 0.85, seed: 3, templates: [t] }, { sheet: { width: 200, height: 200, outline: false, cornerRadius: 0 } });
    const ring = p.rings[1]!;
    const R = ring.radius;
    const theta = Math.PI / ring.repeat;
    const sec = buildSector(ring, p);
    const islands = findIslands(union(sec.cuts));
    // sector frame drawing: x range [-range/2-4, range/2+4], y range [-hw, hw]
    const hw = (R + 12) * theta + 2;
    const x0 = -R + (p.rings[0]!.radius) ; // show from previous band start
    const vb = `${-18} ${-hw} ${36} ${2 * hw}`;
    const edges = [1, -1].map((s) => `M${-R} 0 L${-R + 60 * Math.cos(s * theta)} ${60 * Math.sin(s * theta)}`).join("");
    let svg = `<svg width="700" height="${Math.round((700 * 2 * hw) / 36)}" viewBox="${vb}" style="background:#fff"><path d="${edges}" stroke="#bbb" stroke-width="0.15" fill="none"/><line x1="-18" y1="0" x2="18" y2="0" stroke="#ddd" stroke-width="0.1"/>`;
    for (const e of sec.elements) {
      const el = ring.elements.find((x) => x.id === e.elementId);
      svg += `<path d="${regionsToPath(e.regions)}" fill="${COLORS[el?.role ?? "filler"]}" fill-opacity="0.55" fill-rule="evenodd"/>`;
    }
    for (const isl of islands) svg += `<path d="${contourToPath(isl.contour)}" fill="#ff2020" fill-opacity="0.8"/>`;
    svg += `</svg>`;
    html += `<div style="background:#fff;padding:4px"><b>${t}</b> islands=${islands.length} ${islands.map((i) => `(${i.centroid.x.toFixed(1)},${i.centroid.y.toFixed(1)}) ${i.area.toFixed(1)}`).join(" ")}<br>${svg}</div>`;
    void x0;
  }
  html += `</div></body></html>`;
  writeFileSync(OUT, html);
}, 120000);
