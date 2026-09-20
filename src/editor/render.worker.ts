/// <reference lib="webworker" />
/**
 * Render worker: receives a project, posts the geometry stage first (so the
 * canvas updates quickly) and the validation stage afterwards. A newer request
 * cancels the pending validation of an older one.
 */
import "../geometry/motifs";
import type { Project } from "../model/project";
import { computeStaged } from "./pipeline";

export interface WorkerRequest {
  id: number;
  project: Project;
}

export type WorkerResponse = { id: number; phase: "stencil"; data: ReturnType<typeof computeStaged>["stencil"] } | { id: number; phase: "validation"; data: ReturnType<ReturnType<typeof computeStaged>["validate"]> } | { id: number; phase: "error"; message: string };

let latest = 0;

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, project } = ev.data;
  latest = id;
  try {
    const staged = computeStaged(project);
    (self as unknown as Worker).postMessage({ id, phase: "stencil", data: staged.stencil } satisfies WorkerResponse);
    // Validation is expensive; skip it if a newer project already arrived.
    setTimeout(() => {
      if (latest !== id) return;
      try {
        const v = staged.validate();
        if (latest === id) (self as unknown as Worker).postMessage({ id, phase: "validation", data: v } satisfies WorkerResponse);
      } catch (e) {
        (self as unknown as Worker).postMessage({ id, phase: "error", message: e instanceof Error ? e.message : String(e) } satisfies WorkerResponse);
      }
    }, 0);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, phase: "error", message: e instanceof Error ? e.message : String(e) } satisfies WorkerResponse);
  }
};
