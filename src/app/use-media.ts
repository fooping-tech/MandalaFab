import { useEffect, useState } from "react";

/** React to a CSS media query (false during SSR / when matchMedia is missing). */
export function useMediaQuery(query: string): boolean {
  const get = (): boolean => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = (): void => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Phone / small tablet layout: single column with bottom sheets instead of side panels. */
export const MOBILE_QUERY = "(max-width: 860px)";
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

/** Touch-first device: bigger handles, long-press menu, box-select toggle. */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}
