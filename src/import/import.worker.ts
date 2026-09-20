/// <reference lib="webworker" />
/**
 * Import worker: keeps the uploaded image and the current binary mask, and runs
 * each wizard step on request so the UI never blocks.
 */
import "../geometry/motifs";
import { detectCenter } from "./center-detect";
import { estimateStrokeWidth, traceCells, traceContours } from "./contours";
import { generateMandala } from "../geometry/radial/mandala";
import { buildStencil } from "../geometry/stencil/pipeline";
import { validateStencil } from "../validation";
import type { Project } from "../model/project";
import { cropImage, downscaleBinary, preprocess, type PreprocessOptions } from "./preprocess";
import { convertContours, type ConvertSettings } from "./project-converter";
import { detectSymmetry, detectSymmetryBands } from "./symmetry-detect";
import type { BinaryImage, Point, RgbaImage, TracedContour } from "./types";

export type ImportRequest =
  | { id: number; op: "setImage"; width: number; height: number; data: ArrayBuffer }
  | { id: number; op: "preprocess"; opts: PreprocessOptions; crop: { x: number; y: number; w: number; h: number } | null; previewMax: number }
  | { id: number; op: "center" }
  | { id: number; op: "symmetry"; center: Point }
  | { id: number; op: "trace"; minAreaPx: number; cells: boolean }
  | { id: number; op: "convert"; settings: ConvertSettings }
  | { id: number; op: "stencilStats"; project: Project };

export type ImportResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

let image: RgbaImage | null = null;
let binary: BinaryImage | null = null;
let contours: TracedContour[] = [];

function post(msg: ImportResponse, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

/** RGBA preview of the binary mask (ink dark on white), downscaled. */
function preview(b: BinaryImage, max: number): { width: number; height: number; data: ArrayBuffer; scale: number } {
  const { image: small, scale } = downscaleBinary(b, max, "max");
  const out = new Uint8ClampedArray(small.width * small.height * 4);
  for (let i = 0; i < small.data.length; i++) {
    const v = small.data[i] ? 40 : 255;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return { width: small.width, height: small.height, data: out.buffer, scale };
}

self.onmessage = (ev: MessageEvent<ImportRequest>) => {
  const msg = ev.data;
  try {
    switch (msg.op) {
      case "setImage":
        image = { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.data) };
        binary = null;
        contours = [];
        post({ id: msg.id, ok: true, result: { width: msg.width, height: msg.height } });
        return;
      case "preprocess": {
        if (!image) throw new Error("画像がありません。");
        const src = msg.crop ? cropImage(image, msg.crop.x, msg.crop.y, msg.crop.w, msg.crop.h) : image;
        const res = preprocess(src, msg.opts);
        binary = res.binary;
        contours = [];
        const pv = preview(binary, msg.previewMax);
        post({ id: msg.id, ok: true, result: { width: binary.width, height: binary.height, autoThreshold: res.autoThreshold, backgroundLight: res.backgroundLight, inkPixels: res.inkPixels, preview: pv } }, [pv.data]);
        return;
      }
      case "center": {
        if (!binary) throw new Error("二値化が済んでいません。");
        post({ id: msg.id, ok: true, result: detectCenter(binary) });
        return;
      }
      case "symmetry": {
        if (!binary) throw new Error("二値化が済んでいません。");
        const sym = detectSymmetry(binary, msg.center);
        post({ id: msg.id, ok: true, result: { ...sym, bands: detectSymmetryBands(binary, sym.center) } });
        return;
      }
      case "trace": {
        if (!binary) throw new Error("二値化が済んでいません。");
        contours = msg.cells ? traceCells(binary, msg.minAreaPx) : traceContours(binary).filter((c) => c.area >= msg.minAreaPx);
        const strokePx = estimateStrokeWidth(msg.cells ? traceContours(binary) : contours);
        post({ id: msg.id, ok: true, result: { count: contours.length, strokePx, contours: contours.map((c) => ({ hole: c.hole, area: c.area, points: c.points })) } });
        return;
      }
      case "stencilStats": {
        const g = generateMandala(msg.project);
        const st = buildStencil(msg.project, g);
        const v = validateStencil({ geometry: g, stencil: st, constraints: msg.project.constraints, sheet: msg.project.sheet });
        const subpaths = st.final.reduce((n, r) => n + 1 + r.holes.length, 0);
        post({ id: msg.id, ok: true, result: { subpaths, islands: st.islands.length, bridges: st.bridges.length, issues: v.issues.length, errors: v.issues.filter((i) => i.severity === "error").length, warnings: v.issues.filter((i) => i.severity === "warning").length } });
        return;
      }
      case "convert": {
        if (contours.length === 0) throw new Error("輪郭がありません。先に Vectorize を実行してください。");
        post({ id: msg.id, ok: true, result: convertContours(contours, msg.settings) });
        return;
      }
    }
  } catch (e) {
    post({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
