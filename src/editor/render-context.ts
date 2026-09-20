import { createContext, useContext } from "react";
import type { RenderState } from "./use-render";

export const RenderContext = createContext<RenderState | null>(null);

export function useRenderState(): RenderState {
  const r = useContext(RenderContext);
  if (!r) throw new Error("RenderContext missing");
  return r;
}
