/// <reference lib="webworker" />
/**
 * Geometry worker: receives a project and posts the stencil stage (what is drawn
 * and exported). Validation runs in its own worker (validation.worker.ts) so a
 * slow validation pass never delays the next geometry update.
 */
import "../geometry/motifs";
import type { Project } from "../model/project";
import { computeStaged, type StencilRender } from "./pipeline";

export interface WorkerRequest {
  id: number;
  project: Project;
}

export type WorkerResponse = { id: number; phase: "stencil"; data: StencilRender } | { id: number; phase: "error"; message: string };

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, project } = ev.data;
  try {
    const staged = computeStaged(project);
    (self as unknown as Worker).postMessage({ id, phase: "stencil", data: staged.stencil } satisfies WorkerResponse);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, phase: "error", message: e instanceof Error ? e.message : String(e) } satisfies WorkerResponse);
  }
};
