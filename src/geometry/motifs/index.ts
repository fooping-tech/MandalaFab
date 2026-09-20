import { BUILTIN_MOTIFS } from "./builtin";
import { hasMotif, registerMotif } from "./registry";

export * from "./registry";
export { BUILTIN_MOTIFS } from "./builtin";

/** Register the built-in motifs once (safe to call repeatedly). */
export function registerBuiltinMotifs(): void {
  for (const m of BUILTIN_MOTIFS) if (!hasMotif(m.id)) registerMotif(m);
}

registerBuiltinMotifs();
