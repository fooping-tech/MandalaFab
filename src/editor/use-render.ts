import { useEffect, useRef, useState } from "react";
import type { Project } from "../model/project";
import { computeRender, type RenderData } from "./pipeline";
import type { WorkerRequest, WorkerResponse } from "./render.worker";

export interface RenderState {
  data: RenderData;
  /** True while the geometry of the current project is still being computed. */
  stale: boolean;
  /** True while validation of the current geometry is pending. */
  validating: boolean;
  error: string | null;
}

/**
 * Computes RenderData for a project in a Web Worker. The first render is done
 * synchronously so the canvas is never empty; later projects are queued and only
 * the latest one is computed.
 */
export function useRender(project: Project): RenderState {
  const [state, setState] = useState<RenderState>(() => ({ data: computeRender(project), stale: false, validating: false, error: null }));
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(1);
  const first = useRef(true);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const w = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    let current = 0;
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.id < current) return;
      current = msg.id;
      if (msg.phase === "stencil") {
        setState((s) => ({ data: { ...msg.data, validation: null, issuePaths: [], validationMs: 0 }, stale: msg.id !== nextId.current - 1, validating: true, error: s.error }));
      } else if (msg.phase === "validation") {
        setState((s) => ({ ...s, data: { ...s.data, validation: msg.data.validation, issuePaths: msg.data.issuePaths, validationMs: msg.data.computeMs }, validating: false, error: null }));
      } else {
        setState((s) => ({ ...s, stale: false, validating: false, error: msg.message }));
      }
    };
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const w = worker.current;
    if (!w) {
      setState({ data: computeRender(project), stale: false, validating: false, error: null });
      return;
    }
    const id = nextId.current++;
    setState((s) => ({ ...s, stale: true, validating: true }));
    w.postMessage({ id, project } satisfies WorkerRequest);
  }, [project]);

  return state;
}
