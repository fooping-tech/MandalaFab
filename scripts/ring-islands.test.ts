import { it } from "vitest";
import "../src/geometry/motifs";
import { loadPreset } from "../src/presets";
import { computeRender } from "../src/editor/pipeline";

it.skipIf(!process.env.GALLERY)("islands per ring", () => {
  const id = process.env.GALLERY_ONLY ?? "ainu-morew";
  const p = loadPreset(id);
  for (const ring of p.rings) {
    const q = { ...p, rings: p.rings.map((r) => ({ ...r, visible: r.id === ring.id })), center: { ...p.center, visible: false } as any };
    const r = computeRender(q);
    console.log(`${ring.name}: islandsBefore=${r.counts.islandsBefore} bridges=${r.counts.bridges}`);
  }
}, 120000);
