/// <reference lib="webworker" />
/**
 * Validation worker: the slow morphology checks run here, separately from the
 * geometry worker, so dragging never waits behind a validation pass. A newer
 * request supersedes an older one (the older result is dropped by the caller).
 */
import "../geometry/motifs";
import type { Project } from "../model/project";
import { computeValidation, type ValidationRender } from "./pipeline";

export interface ValidationRequest {
  id: number;
  project: Project;
}

export type ValidationResponse = { id: number; phase: "validation"; data: ValidationRender } | { id: number; phase: "error"; message: string };

self.onmessage = (ev: MessageEvent<ValidationRequest>) => {
  const { id, project } = ev.data;
  try {
    const data = computeValidation(project);
    (self as unknown as Worker).postMessage({ id, phase: "validation", data } satisfies ValidationResponse);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, phase: "error", message: e instanceof Error ? e.message : String(e) } satisfies ValidationResponse);
  }
};
