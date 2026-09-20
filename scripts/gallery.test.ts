import { it } from "vitest";
import { writeFileSync } from "node:fs";
import "../src/geometry/motifs";
import { PRESETS, loadPreset } from "../src/presets";
import { computeRender } from "../src/editor/pipeline";
import { generateProject } from "../src/generate";

it.skipIf(!process.env.GALLERY)("renders gallery (GALLERY=1 npx vitest run scripts)", () => {
  (globalThis as any).performance ??= { now: () => Date.now() };
  const items: { label: string; project: ReturnType<typeof loadPreset> }[] = PRESETS.map((p) => ({ label: p.label, project: loadPreset(p.id) }));
  for (const seed of [1, 2, 3]) items.push({ label: `gen d=0.9 s=${seed}`, project: generateProject({ symmetry: 12, density: 0.9, seed }) });
  items.push({ label: `gen d=0.4 s=5`, project: generateProject({ symmetry: 8, density: 0.4, seed: 5 }) });
  let html = `<html><body style="background:#eee;font-family:sans-serif;font-size:11px"><div style="display:flex;flex-wrap:wrap;gap:8px">`;
  const report: string[] = [];
  for (const it of items) {
    const t0 = Date.now();
    const r = computeRender(it.project);
    const ms = Date.now() - t0;
    const w = it.project.sheet.width;
    const subpaths = (r.finalPath.match(/M/g) ?? []).length;
    const issues = r.validation.issues.map((i) => `${i.severity[0]}:${i.code}`).join(",");
    const line = `${it.label}: shapes=${subpaths} islandsBefore=${r.stencil.islandsBefore.length} islands=${r.stencil.islands.length} bridges=${r.stencil.bridges.length} ${ms}ms [${issues}]`;
    report.push(line);
    html += `<div style="background:#fff;padding:4px;width:460px"><svg width="460" height="460" viewBox="${-w / 2} ${-w / 2} ${w} ${w}"><rect x="${-w / 2}" y="${-w / 2}" width="${w}" height="${w}" fill="#f3efe6"/><path d="${r.finalPath}" fill="#4a3a2a" fill-rule="evenodd"/><path d="${r.bridgePath}" fill="#f6b26b"/>${r.issuePaths.map((i) => `<path d="${i.d}" fill="${i.severity === "error" ? "#f00" : "#ff0"}" fill-opacity="0.6"/>`).join("")}</svg><br>${line}</div>`;
  }
  html += `</div></body></html>`;
  writeFileSync("/private/tmp/claude-501/-Users-fooping-python-ws-MandalaFab/e8240cf9-55b4-42f9-a285-5e3ada416108/scratchpad/pw/gallery.html", html);
  console.log(report.join("\n"));
}, 120000);
