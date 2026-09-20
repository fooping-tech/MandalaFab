import { it } from "vitest";
import { writeFileSync } from "node:fs";
import "../src/geometry/motifs";
import { PRESETS, loadPreset } from "../src/presets";
import { computeRender } from "../src/editor/pipeline";
import { composeMandala, compositionStats, TEMPLATE_NAMES } from "../src/generate/compose";
import type { Project } from "../src/model/project";

const OUT = "/private/tmp/claude-501/-Users-fooping-python-ws-MandalaFab/e8240cf9-55b4-42f9-a285-5e3ada416108/scratchpad/pw/gallery.html";

it.skipIf(!process.env.GALLERY)("renders gallery (GALLERY=1 npx vitest run scripts)", () => {
  (globalThis as any).performance ??= { now: () => Date.now() };
  const items: { label: string; project: Project; big?: boolean }[] = [];
  const mode = process.env.GALLERY;
  if (mode === "presets") for (const p of PRESETS) items.push({ label: p.label, project: loadPreset(p.id), big: p.id === "dense-floral" });
  else {
    const base = { sheet: { width: 200, height: 200, outline: false, cornerRadius: 0 } };
    for (const t of TEMPLATE_NAMES) items.push({ label: `template ${t}`, project: composeMandala({ symmetry: 12, density: 0.85, seed: 3, templates: [t] }, base), big: t === TEMPLATE_NAMES[0] });
    for (const seed of [11, 12]) items.push({ label: `mix d=0.9 s=${seed}`, project: composeMandala({ symmetry: 12, density: 0.9, seed }, base) });
    items.push({ label: `mix d=0.4 s=5`, project: composeMandala({ symmetry: 8, density: 0.4, seed: 5 }, base) });
  }
  let html = `<html><body style="background:#eee;font-family:sans-serif;font-size:11px"><div style="display:flex;flex-wrap:wrap;gap:8px">`;
  const report: string[] = [];
  for (const it of items) {
    const t0 = Date.now();
    const r = computeRender(it.project);
    const ms = Date.now() - t0;
    const w = it.project.sheet.width;
    const issues = (r.validation?.issues ?? []).map((i) => `${i.severity[0]}:${i.code}`).join(",");
    const stats = it.project.rings.map((ring) => { const s = compositionStats(ring); return `[${s.primitives}p/${s.byRole.primary}-${s.byRole.secondary}-${s.byRole.flow}-${s.byRole.filler}-${s.byRole.boundary} n${s.nestedKinds} f${s.flowCurves} b${s.boundaryConnections}]`; }).join(" ");
    const line = `${it.label}: paths=${r.counts.subpaths} islandsBefore=${r.counts.islandsBefore} islands=${r.counts.islands} bridges=${r.counts.bridges} ${ms}ms [${issues}] ${stats}`;
    report.push(line);
    const size = it.big ? 900 : 440;
    html += `<div style="background:#fff;padding:4px;width:${size}px"><svg width="${size}" height="${size}" viewBox="${-w / 2} ${-w / 2} ${w} ${w}"><rect x="${-w / 2}" y="${-w / 2}" width="${w}" height="${w}" fill="#f3efe6"/><path d="${r.finalPath}" fill="#4a3a2a" fill-rule="evenodd"/><path d="${r.bridgePath}" fill="#f6b26b"/>${r.issuePaths.map((i) => `<path d="${i.d}" fill="${i.severity === "error" ? "#f00" : "#ff0"}" fill-opacity="0.6"/>`).join("")}</svg><br>${line}</div>`;
  }
  html += `</div></body></html>`;
  writeFileSync(OUT, html);
  console.log(report.join("\n"));
}, 300000);
