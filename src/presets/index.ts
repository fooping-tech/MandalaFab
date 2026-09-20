import { normalizeProject } from "../model/validate";
import type { Project } from "../model/project";
import flower from "./flower.json";
import lotus from "./lotus.json";
import geometric from "./geometric.json";
import sun from "./sun.json";
import snowflake from "./snowflake.json";
import sacred from "./sacred.json";
import kids from "./kids.json";
import japanese from "./japanese.json";

export interface Preset {
  id: string;
  label: string;
  description: string;
  raw: unknown;
}

export const PRESETS: readonly Preset[] = [
  { id: "flower", label: "Flower", description: "花びら2重 + ドット + 円弧の基本形。", raw: flower },
  { id: "lotus", label: "Lotus", description: "12回対称。外周は花びらの輪郭線でブリッジが自動生成される。", raw: lotus },
  { id: "geometric", label: "Geometric", description: "ひし形・三角・バーの6回対称。", raw: geometric },
  { id: "sun", label: "Sun", description: "中心の輪（島）を対称ブリッジで支える太陽。", raw: sun },
  { id: "snowflake", label: "Snowflake", description: "6回対称の枝と結晶。", raw: snowflake },
  { id: "sacred", label: "Sacred Geometry", description: "重なる円の輪郭線。島が多くブリッジの見本になる。", raw: sacred },
  { id: "kids", label: "Simple Kids", description: "大きな形だけの4回対称。紙でも切りやすい。", raw: kids },
  { id: "japanese", label: "Japanese Pattern", description: "青海波と麻の葉風。", raw: japanese },
];

export function loadPreset(id: string): Project {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset "${id}".`);
  return normalizeProject(p.raw);
}
