/** Promise wrapper around the import worker. */
import type { CenterCandidate } from "./center-detect";
import type { ImportRequest, ImportResponse } from "./import.worker";
import type { PreprocessOptions } from "./preprocess";
import type { ConversionResult, ConvertSettings } from "./project-converter";
import type { BandSymmetry, SymmetryResult } from "./symmetry-detect";
import type { Point, TracedContour } from "./types";
import type { Project } from "../model/project";

export interface PreprocessReply {
  width: number;
  height: number;
  autoThreshold: number;
  backgroundLight: boolean;
  inkPixels: number;
  preview: { width: number; height: number; data: ArrayBuffer; scale: number };
}

export class ImportClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL("./import.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<ImportResponse>) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      this.pending.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.result);
      else p.reject(new Error(ev.data.error));
    };
  }

  private call<T>(req: Record<string, unknown> & { op: ImportRequest["op"] }, transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...req, id } as unknown as ImportRequest, transfer);
    });
  }

  setImage(width: number, height: number, data: Uint8ClampedArray): Promise<{ width: number; height: number }> {
    const copy = data.slice();
    return this.call({ op: "setImage", width, height, data: copy.buffer }, [copy.buffer]);
  }
  preprocess(opts: PreprocessOptions, crop: { x: number; y: number; w: number; h: number } | null, previewMax = 720): Promise<PreprocessReply> {
    return this.call({ op: "preprocess", opts, crop, previewMax });
  }
  center(): Promise<CenterCandidate[]> {
    return this.call({ op: "center" });
  }
  symmetry(center: Point): Promise<SymmetryResult & { bands: BandSymmetry[] }> {
    return this.call({ op: "symmetry", center });
  }
  trace(minAreaPx: number, cells: boolean): Promise<{ count: number; strokePx: number; contours: TracedContour[] }> {
    return this.call({ op: "trace", minAreaPx, cells });
  }
  stencilStats(project: Project): Promise<{ subpaths: number; islands: number; bridges: number; issues: number; errors: number; warnings: number }> {
    return this.call({ op: "stencilStats", project });
  }
  convert(settings: ConvertSettings): Promise<ConversionResult> {
    return this.call({ op: "convert", settings });
  }
  dispose(): void {
    this.worker.terminate();
  }
}
