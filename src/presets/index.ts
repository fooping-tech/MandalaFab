import { normalizeProject } from "../model/validate";
import type { Project } from "../model/project";
import denseFloral from "./dense-floral.json";
import floralLace from "./floral-lace.json";
import paisleyMandala from "./paisley-mandala.json";
import lotusLace from "./lotus-lace.json";
import arabesque from "./arabesque.json";
import archLace from "./arch-lace.json";
import scallopFanLace from "./scallop-fan-lace.json";
import ainuMorew from "./ainu-morew.json";
import ethnicBorder from "./ethnic-border.json";

export interface Preset {
  id: string;
  label: string;
  description: string;
  raw: unknown;
}

export const PRESETS: readonly Preset[] = [
  { id: "dense-floral", label: "Dense Floral Stencil", description: "12回対称・4帯+区切り帯。涙滴・葉・唐草・ペイズリー・S字を高密度に配置した参考画像級のレース。200 mm。", raw: denseFloral },
  { id: "floral-lace", label: "Floral Lace", description: "8回対称の花柄レース。縁取り付き蓮弁とペイズリー。", raw: floralLace },
  { id: "paisley-mandala", label: "Paisley Mandala", description: "10回対称。大小のペイズリーと唐草の縁。", raw: paisleyMandala },
  { id: "lotus-lace", label: "Lotus Lace", description: "12回対称。縁取り蓮弁と葉の扇（局所リピート）。", raw: lotusLace },
  { id: "arabesque", label: "Ornamental Arabesque", description: "8回対称。唐草の渦とS字格子。", raw: arabesque },
  { id: "arch-lace", label: "Arch Lace", description: "アーチ窓の重ね（扇・眼・ドット・縁取りアーチ）。ドゥードル風。", raw: archLace },
  { id: "scallop-fan-lace", label: "Scallop Fan Lace", description: "スカラップ縁と放射線の扇、ビーズ列のレース。", raw: scallopFanLace },
  { id: "ainu-morew", label: "Ainu Morew", description: "アイヌ文様風: 渦巻き（モレウ）・棘（アイウシ）・眼（シク）・ハート。", raw: ainuMorew },
  { id: "ethnic-border", label: "Ethnic Border", description: "エスニックな帯: 三角・バー・葉脈付きの葉・ジグザグ・ドット付きアーチ・太陽花・格子。", raw: ethnicBorder },
];

export function loadPreset(id: string): Project {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset "${id}".`);
  return normalizeProject(p.raw);
}
