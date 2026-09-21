import { useEffect, useRef, useState } from "react";
import type { Project } from "../model/project";
import { computeStaged, type RenderData } from "./pipeline";
import type { WorkerRequest, WorkerResponse } from "./render.worker";
import type { ValidationRequest, ValidationResponse } from "./validation.worker";

export interface RenderState {
  data: RenderData;
  /** True while the geometry of the current project is still being computed. */
  stale: boolean;
  /** True while validation of the current geometry is pending. */
  validating: boolean;
  error: string | null;
}

/** Validation starts this long after the last edit (it is the expensive stage). */
const VALIDATION_DELAY_MS = 450;

/**
 * Computes RenderData for a project in two Web Workers: geometry (fast, one
 * request in flight, intermediate states dropped) and validation (slow, started
 * once the design has settled, superseded results discarded). The first
 * geometry pass runs synchronously so the canvas is never empty.
 */
export function useRender(project: Project): RenderState {
  const [state, setState] = useState<RenderState>(() => ({ data: { ...computeStaged(project).stencil, validation: null, issuePaths: [], validationMs: 0 }, stale: false, validating: true, error: null }));
  const geomWorker = useRef<Worker | null>(null);
  const valWorker = useRef<Worker | null>(null);
  const nextId = useRef(1);
  const first = useRef(true);
  /** Newest project not yet sent while the geometry worker is busy. */
  const pending = useRef<Project | null>(null);
  const inFlight = useRef(false);
  const sendGeometry = useRef<(p: Project) => void>(() => {});
  /** Validation: newest project waiting for the worker, and whether one is running. */
  const valPending = useRef<Project | null>(null);
  const valInFlight = useRef(false);
  const valTimer = useRef<number | null>(null);
  const sendValidation = useRef<(p: Project) => void>(() => {});
  const latestProject = useRef(project);
  latestProject.current = project;

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const gw = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
    const vw = new Worker(new URL("./validation.worker.ts", import.meta.url), { type: "module" });
    geomWorker.current = gw;
    valWorker.current = vw;
    let currentGeom = 0;
    let currentVal = 0;
    const projectOfId = new Map<number, Project>();
    sendGeometry.current = (p: Project) => {
      const id = nextId.current++;
      inFlight.current = true;
      gw.postMessage({ id, project: p } satisfies WorkerRequest);
    };
    sendValidation.current = (p: Project) => {
      const id = nextId.current++;
      valInFlight.current = true;
      projectOfId.set(id, p);
      vw.postMessage({ id, project: p } satisfies ValidationRequest);
    };
    gw.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.id < currentGeom) return;
      currentGeom = msg.id;
      inFlight.current = false;
      const next = pending.current;
      pending.current = null;
      if (next) sendGeometry.current(next); // drop every intermediate state, compute only the newest
      if (msg.phase === "stencil") setState((s) => ({ data: { ...msg.data, validation: null, issuePaths: [], validationMs: 0 }, stale: next !== null, validating: true, error: s.error }));
      else setState((s) => ({ ...s, stale: false, error: msg.message }));
    };
    vw.onmessage = (ev: MessageEvent<ValidationResponse>) => {
      const msg = ev.data;
      const forProject = projectOfId.get(msg.id);
      projectOfId.delete(msg.id);
      valInFlight.current = false;
      const next = valPending.current;
      valPending.current = null;
      if (next) sendValidation.current(next);
      if (msg.id < currentVal) return;
      currentVal = msg.id;
      // Only attach a result that belongs to the project currently shown.
      if (forProject !== latestProject.current) return;
      if (msg.phase === "validation") setState((s) => ({ ...s, data: { ...s.data, validation: msg.data.validation, issuePaths: msg.data.issuePaths, validationMs: msg.data.computeMs }, validating: false, error: null }));
      else setState((s) => ({ ...s, validating: false, error: msg.message }));
    };
    // Validate the initial project too.
    valTimer.current = window.setTimeout(() => sendValidation.current(latestProject.current), VALIDATION_DELAY_MS);
    return () => {
      gw.terminate();
      vw.terminate();
      geomWorker.current = null;
      valWorker.current = null;
      if (valTimer.current !== null) window.clearTimeout(valTimer.current);
    };
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const gw = geomWorker.current;
    if (!gw) {
      setState({ data: { ...computeStaged(project).stencil, validation: null, issuePaths: [], validationMs: 0 }, stale: false, validating: false, error: null });
      return;
    }
    setState((s) => ({ ...s, stale: true, validating: true }));
    if (inFlight.current) pending.current = project;
    else sendGeometry.current(project);
    // Validation: wait for the design to settle, then run one pass on the newest project.
    if (valTimer.current !== null) window.clearTimeout(valTimer.current);
    valTimer.current = window.setTimeout(() => {
      valTimer.current = null;
      const p = latestProject.current;
      if (valInFlight.current) valPending.current = p;
      else sendValidation.current(p);
    }, VALIDATION_DELAY_MS);
  }, [project]);

  return state;
}
