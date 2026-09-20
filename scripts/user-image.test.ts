/** Runs the import pipeline on a BMP (24/32-bit, uncompressed) with timings. GALLERY=1 BMP=path npx vitest run scripts/user-image.test.ts */
import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import "../src/geometry/motifs";
import { preprocess, DEFAULT_PREPROCESS, dilate } from "../src/import/preprocess";
import { detectCenter } from "../src/import/center-detect";
import { detectSymmetry, detectSymmetryBands } from "../src/import/symmetry-detect";
import { traceContours, traceCells, estimateStrokeWidth } from "../src/import/contours";
import { convertContours } from "../src/import/project-converter";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil, unionApertures } from "../src/geometry/stencil/pipeline";
import { flattenRegions } from "../src/geometry/boolean";
import { rasterizeRegions, binaryIoU } from "../src/import/raster";
import { regionsToPath } from "../src/editor/pipeline";
import type { RgbaImage } from "../src/import/types";

function readBmp(path: string): RgbaImage {
  const buf = readFileSync(path);
  const off = buf.readUInt32LE(10);
  const w = buf.readInt32LE(18);
  const hRaw = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const h = Math.abs(hRaw);
  const rowBytes = Math.floor((w * bpp + 31) / 32) * 4;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcRow = hRaw > 0 ? h - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const i = off + srcRow * rowBytes + x * (bpp / 8);
      const o = (y * w + x) * 4;
      out[o] = buf[i + 2]!;
      out[o + 1] = buf[i + 1]!;
      out[o + 2] = buf[i]!;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

it.skipIf(!process.env.BMP)("user image pipeline", () => {
  const t = (label: string, t0: number) => console.log(`${label}: ${Date.now() - t0} ms`);
  let t0 = Date.now();
  const img = readBmp(process.env.BMP!);
  console.log("image", img.width, img.height);
  const pre = preprocess(img, { ...DEFAULT_PREPROCESS });
  t("preprocess", t0);
  console.log("bgLight", pre.backgroundLight, "otsu", pre.autoThreshold.toFixed(3), "ink%", ((100 * pre.inkPixels) / (img.width * img.height)).toFixed(2));
  t0 = Date.now();
  const centers = detectCenter(pre.binary);
  t("center", t0);
  console.log("centers", centers.map((c) => `${c.method} (${c.point.x.toFixed(1)},${c.point.y.toFixed(1)}) ${c.score.toFixed(3)}`).join(" | "));
  const center0 = centers[0]!.point;
  t0 = Date.now();
  const sym = detectSymmetry(pre.binary, center0);
  t("symmetry", t0);
  const center = sym.center;
  console.log("refined center", center.x.toFixed(1), center.y.toFixed(1));
  const bandsPx = detectSymmetryBands(pre.binary, center);
  console.log("bands", bandsPx.map((bd) => `[${bd.rMin.toFixed(0)}-${bd.rMax.toFixed(0)}] n=${bd.n} c=${bd.corr.toFixed(2)} w=${bd.weight.toFixed(2)} m=${bd.mirrorAxisDeg?.toFixed(1)}`).join(" "));
  console.log("symmetry best", sym.best, "mirror", sym.mirrorAxisDeg, sym.mirrorScore.toFixed(3), sym.candidates.map((c) => `${c.n}:${c.ratio.toFixed(2)}/${c.diff.toFixed(2)}`).join(" "));
  t0 = Date.now();
  const contours = traceContours(pre.binary).filter((c) => c.area >= 4);
  t("trace", t0);
  console.log("contours", contours.length, "holes", contours.filter((c) => c.hole).length);
  const mmPerPx = 200 / img.width;
  console.log("strokePx", estimateStrokeWidth(contours).toFixed(2));
  t0 = Date.now();
  const cells = traceCells(pre.binary, 4);
  t("cells", t0);
  console.log("cells", cells.length);
  for (const mode of ["trace", "cells"] as const) {
    t0 = Date.now();
    const bands = bandsPx.map((bd) => ({ rMinMm: bd.rMin * mmPerPx, rMaxMm: bd.rMax * mmPerPx, n: bd.corr >= 0.5 ? bd.n : sym.best, mirrorAxisDeg: bd.mirrorAxisDeg }));
    const res = convertContours(mode === "cells" ? cells : contours, { symmetry: sym.best, bands, phaseDeg: sym.mirrorAxisDeg ?? 0, mirror: sym.mirrorAxisDeg !== null, center, mmPerPx, sheet: { width: 200, height: 200 }, mode, simplifyMm: 0.15, bezierErrorMm: 0.25, recognize: mode === "trace", ringDetect: true, minFeatureWidth: 1, minHoleDiameter: 1, minGap: 1, name: "user" });
    t(`convert ${mode}`, t0);
    console.log(mode, JSON.stringify(res.stats), "rings", res.project.rings.map((r) => `${r.name}:${r.repeat}x${r.elements.length}`).join(" "));
    t0 = Date.now();
    const g = generateMandala(res.project);
    const regen = rasterizeRegions(flattenRegions(unionApertures(g)), img.width, img.height, mmPerPx, center);
    t(`regen ${mode}`, t0);
    const target = mode === "cells" ? { width: pre.binary.width, height: pre.binary.height, data: pre.binary.data.map((v) => (v ? 0 : 1)) } : pre.binary;
    console.log(mode, "IoU vs", mode === "cells" ? "paper" : "ink", binaryIoU(regen, target).toFixed(3), "dilated", binaryIoU(dilate(regen, 2), dilate(target, 2)).toFixed(3));
    if (mode === "cells") {
      const s = buildStencil(res.project, g);
      console.log("stencil islandsBefore", s.islandsBefore.length, "islands", s.islands.length, "bridges", s.bridges.length);
    }
    const w = 200;
    const d = regionsToPath(flattenRegions(unionApertures(g)));
    writeFileSync(`/private/tmp/claude-501/-Users-fooping-python-ws-MandalaFab/e8240cf9-55b4-42f9-a285-5e3ada416108/scratchpad/pw/user-${mode}.html`, `<html><body style="background:#eee"><svg width="800" height="800" viewBox="${-w / 2} ${-w / 2} ${w} ${w}"><rect x="${-w / 2}" y="${-w / 2}" width="${w}" height="${w}" fill="#fff"/><path d="${d}" fill="#333" fill-rule="evenodd"/></svg></body></html>`);
  }
}, 600000);
