import { createContext, useContext } from "react";
import type { RenderData } from "./pipeline";

export const RenderContext = createContext<RenderData | null>(null);

export function useRender(): RenderData {
  const r = useContext(RenderContext);
  if (!r) throw new Error("RenderContext missing");
  return r;
}
