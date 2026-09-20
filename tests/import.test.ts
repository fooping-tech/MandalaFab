import { describe, it, expect } from "vitest";
import "../src/geometry/motifs";
import { composeMandala } from "../src/generate/compose";
import { generateMandala } from "../src/geometry/radial/mandala";
import { buildStencil, unionApertures } from "../src/geometry/stencil/pipeline";
import { flattenRegions } from "../src/geometry/boolean";
import { exportSVG } from "../src/export/svg";
import { rasterizeRegions, binaryToRgba, binaryIoU } from "../src/import/raster";
import { preprocess, DEFAULT_PREPROCESS, otsuThreshold, toGray } from "../src/import/preprocess";
import { detectCenter } from "../src/import/center-detect";
import { detectSymmetry } from "../src/import/symmetry-detect";
import { traceContours } from "../src/import/contours";
import { fitCurve, simplifyPolyline, fitClosedPolygon } from "../src/import/bezier-fit";
import { recognizePrimitive } from "../src/import/primitive-recognition";
import { clusterRings } from "../src/import/ring-cluster";
import { convertContours } from "../src/import/project-converter";
import { buildTeardrop } from "../src/geometry/elements/builders";
import { flattenPath } from "../src/geometry/bezier";
import { pointSegmentDistance } from "../src/geometry/vec";
import type { Project } from "../src/model/project";

const SIZE = 600;
const SHEET = 150;
const MM_PER_PX = SHEET / SIZE;

function referenceProject(): Project {
  const p = composeMandala({ symmetry: 12, density: 0.55, seed: 4, templates: ["floralArabesque", "lotusScroll"] }, { sheet: { width: SHEET, height: SHEET, outline: false, cornerRadius: 0 } });
  // Force a true 12-fold image (narrow inner bands are otherwise composed with 6 sectors).
  for (const r of p.rings) r.repeat = 12;
  return p;
}

function rasterOf(p: Project) {
  const final = flattenRegions(buildStencil(p, generateMandala(p)).final);
  return rasterizeRegions(final, SIZE, SIZE, MM_PER_PX);
}

describe("reference image import: raster + preprocess", () => {
  it("thresholds dark-on-light and light-on-dark images to the same ink mask", () => {
    const bin = rasterOf(referenceProject());
    const light = preprocess(binaryToRgba(bin, true), { ...DEFAULT_PREPROCESS, denoise: 0 });
    const dark = preprocess(binaryToRgba(bin, false), { ...DEFAULT_PREPROCESS, denoise: 0 });
    expect(light.backgroundLight).toBe(true);
    expect(dark.backgroundLight).toBe(false);
    expect(binaryIoU(light.binary, bin)).toBeGreaterThan(0.98);
    expect(binaryIoU(dark.binary, bin)).toBeGreaterThan(0.98);
    const t = otsuThreshold(toGray(binaryToRgba(bin, true)));
    expect(t).toBeGreaterThan(0.05);
    expect(t).toBeLessThan(0.96);
  });
});

describe("reference image import: analysis", () => {
  const p = referenceProject();
  const bin = rasterOf(p);

  it("finds the center within a few pixels", () => {
    const shifted = rasterizeRegions(flattenRegions(buildStencil(p, generateMandala(p)).final), SIZE, SIZE, MM_PER_PX, { x: 330, y: 280 });
    const c = detectCenter(shifted)[0]!;
    expect(Math.abs(c.point.x - 330)).toBeLessThan(4);
    expect(Math.abs(c.point.y - 280)).toBeLessThan(4);
  });

  it("detects 12-fold symmetry and the mirror axis", () => {
    const res = detectSymmetry(bin, { x: SIZE / 2, y: SIZE / 2 });
    expect(res.best).toBe(12);
    expect(res.candidates[0]!.n === 12 || res.candidates.slice(0, 3).some((c) => c.n === 12)).toBe(true);
    expect(res.mirrorAxisDeg).not.toBeNull();
    // Sector axis of band 0 is at 0° (up); a mirror axis appears every 15°.
    const a = ((res.mirrorAxisDeg! % 15) + 15) % 15;
    expect(Math.min(a, 15 - a)).toBeLessThan(2);
  });

  it("traces closed contours with holes", () => {
    const cs = traceContours(bin);
    expect(cs.length).toBeGreaterThan(20);
    expect(cs.some((c) => c.hole)).toBe(true);
    for (const c of cs) expect(c.points.length).toBeGreaterThanOrEqual(3);
    const ink = bin.data.reduce((n, v) => n + v, 0);
    const traced = cs.reduce((n, c) => n + (c.hole ? -c.area : c.area), 0);
    expect(Math.abs(traced - ink) / ink).toBeLessThan(0.1);
  });
});

describe("reference image import: fitting and recognition", () => {
  it("Douglas–Peucker keeps the polyline within epsilon", () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({ x: i / 10, y: Math.sin(i / 10) * 5 }));
    const s = simplifyPolyline(pts, 0.1);
    expect(s.length).toBeLessThan(pts.length / 2);
    for (const p of pts) {
      let best = Infinity;
      for (let i = 0; i + 1 < s.length; i++) best = Math.min(best, pointSegmentDistance(p, s[i]!, s[i + 1]!));
      expect(best).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });

  it("cubic fitting stays within the error tolerance", () => {
    const pts = Array.from({ length: 80 }, (_, i) => ({ x: i * 0.5, y: 8 * Math.sin(i * 0.12) }));
    const cubics = fitCurve(pts, 0.15);
    expect(cubics.length).toBeGreaterThan(0);
    const flat = flattenPath(cubics.flatMap((c, i) => (i === 0 ? [c[0], c[1], c[2], c[3]] : [c[1], c[2], c[3]])), false, 0.01);
    for (const p of pts) {
      let best = Infinity;
      for (let i = 0; i + 1 < flat.length; i++) best = Math.min(best, pointSegmentDistance(p, flat[i]!, flat[i + 1]!));
      expect(best).toBeLessThan(0.4);
    }
  });

  it("closed fitting keeps sharp tips as corners", () => {
    const tear = buildTeardrop(20, 8, 0.9, 0, 0.05);
    const pts = fitClosedPolygon([...tear], 0.1);
    expect(pts.length).toBeGreaterThanOrEqual(7);
    const maxX = Math.max(...pts.map((p) => p.x));
    expect(maxX).toBeCloseTo(10, 0);
  });

  it("recognises a teardrop, a circle and keeps odd shapes as Bézier", () => {
    const rot = (c: { x: number; y: number }[], deg: number, dx: number, dy: number) => c.map((p) => ({ x: dx + p.x * Math.cos((deg * Math.PI) / 180) - p.y * Math.sin((deg * Math.PI) / 180), y: dy + p.x * Math.sin((deg * Math.PI) / 180) + p.y * Math.cos((deg * Math.PI) / 180) }));
    const tear = recognizePrimitive(rot([...buildTeardrop(20, 8, 0.8, 0, 0.05)], 35, 30, -10));
    expect(tear.type).toBe("teardrop");
    expect(tear.confidence).toBeGreaterThan(0.85);
    expect(((tear.rotationDeg - 35) % 360 + 360) % 360).toBeLessThan(3);
    const circle = Array.from({ length: 64 }, (_, i) => ({ x: 5 * Math.cos((i / 64) * Math.PI * 2), y: 5 * Math.sin((i / 64) * Math.PI * 2) }));
    expect(recognizePrimitive(circle).type).toBe("circle");
    const zig = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 8 }, { x: 10, y: 8 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(recognizePrimitive(zig).type).toBe("bezier");
  });

  it("clusters radii into rings and flags cross-ring items", () => {
    const items = [10, 11, 12, 30, 31, 52, 50, 51].map((r, i) => ({ index: i, radius: r, span: 4 }));
    items.push({ index: 99, radius: 40, span: 40 });
    const c = clusterRings(items, 60);
    expect(c.rings).toHaveLength(3);
    expect(c.free).toEqual([99]);
  });
});

describe("reference image import: end-to-end (acceptance)", () => {
  const p = referenceProject();
  const bin = rasterOf(p);

  it("a 12-fold image becomes an editable 12-sector project that reproduces the image", () => {
    const sym = detectSymmetry(bin, { x: SIZE / 2, y: SIZE / 2 });
    const contours = traceContours(bin).filter((c) => c.area > 6);
    const result = convertContours(contours, {
      symmetry: sym.best,
      phaseDeg: sym.mirrorAxisDeg ?? 0,
      mirror: sym.mirrorAxisDeg !== null,
      center: { x: SIZE / 2, y: SIZE / 2 },
      mmPerPx: MM_PER_PX,
      sheet: { width: SHEET, height: SHEET },
      mode: "trace",
      simplifyMm: 0.15,
      bezierErrorMm: 0.25,
      recognize: true,
      ringDetect: true,
      minFeatureWidth: 1,
      minHoleDiameter: 1,
      minGap: 1,
      name: "imported",
    });
    const proj = result.project;
    expect(proj.symmetry).toBe(12);
    const sectorRings = proj.rings.filter((r) => r.repeat === 12);
    expect(sectorRings.length).toBeGreaterThanOrEqual(2);
    expect(sectorRings.every((r) => r.mirrorLocal)).toBe(true);
    expect(result.stats.elements).toBeGreaterThan(5);
    // Elements are editable model objects: Bézier paths or recognised primitives with confidence.
    for (const r of sectorRings) for (const e of r.elements) expect(e.imported?.confidence).toBeGreaterThan(0);
    // The regenerated design overlaps the reference image well.
    const regen = rasterizeRegions(flattenRegions(unionApertures(generateMandala(proj))), SIZE, SIZE, MM_PER_PX);
    expect(binaryIoU(regen, bin)).toBeGreaterThan(0.6);
    // And it exports.
    const svg = exportSVG(proj, buildStencil(proj, generateMandala(proj)).final);
    expect(svg.subpaths).toBeGreaterThan(20);
  });

  it("stencilize mode drops specks and enables bridges", () => {
    const contours = traceContours(bin);
    const result = convertContours(contours, { symmetry: 12, phaseDeg: 0, mirror: true, center: { x: SIZE / 2, y: SIZE / 2 }, mmPerPx: MM_PER_PX, sheet: { width: SHEET, height: SHEET }, mode: "stencil", simplifyMm: 0.15, bezierErrorMm: 0.25, recognize: false, ringDetect: true, minFeatureWidth: 1, minHoleDiameter: 2, minGap: 1, name: "s" });
    expect(result.project.bridges.auto).toBe(true);
    const s = buildStencil(result.project, generateMandala(result.project));
    expect(s.islands).toHaveLength(0);
  });
});
