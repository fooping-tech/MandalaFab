import { useMemo, useState } from "react";
import { replaceProject } from "../../editor/commands";
import { useLibrary } from "../../editor/library-store";
import { useEditor, type EditorStore } from "../../editor/store";
import { generateProject, randomSeed } from "../../generate";
import type { ElementPart } from "../../model/library";
import { SYMMETRY_PRESETS } from "../../model/project";
import { NumberField, SmallButton } from "../fields";
import { Dialog } from "./Dialog";

/** Weight presets shown per part. */
const WEIGHTS: { value: number; label: string }[] = [
  { value: 0.5, label: "低" },
  { value: 1, label: "標準" },
  { value: 2, label: "高" },
  { value: 4, label: "最高" },
];

export function GenerateDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const library = useLibrary();
  const parts = useMemo(() => library.filter((i): i is ElementPart => i.kind === "element"), [library]);
  const [symmetry, setSymmetry] = useState(project.generator?.symmetry ?? project.symmetry);
  const [density, setDensity] = useState(project.generator?.density ?? 0.7);
  const [seed, setSeed] = useState(project.generator?.seed ?? randomSeed());
  const [partsFrequency, setPartsFrequency] = useState(project.generator?.partsFrequency ?? 0.5);
  const [weights, setWeights] = useState<Record<string, number>>(project.generator?.partWeights ?? {});
  const weightOf = (id: string): number => weights[id] ?? 1;
  const setWeight = (id: string, w: number): void => setWeights((prev) => ({ ...prev, [id]: w }));
  const activeParts = parts.filter((p) => weightOf(p.id) > 0).length;

  const run = (s = seed): void => {
    const partWeights = Object.fromEntries(parts.map((p) => [p.id, weightOf(p.id)]));
    const params = { symmetry, density, seed: s, partsFrequency: parts.length > 0 ? partsFrequency : 0, partWeights };
    const generated = generateProject(params, { sheet: project.sheet, constraints: project.constraints, bridges: project.bridges }, parts);
    store.execute(replaceProject(generated, `生成 (seed ${s})`));
    const used = parts.length > 0 && partsFrequency > 0 && activeParts > 0 ? `、マイパーツ ${activeParts} 種 × 頻度 ${Math.round(partsFrequency * 100)}%` : "";
    store.notify(`曼荼羅を生成しました（seed ${s}, density ${density}${used}）。同じ設定と seed で同じ結果になります。`, "success");
  };

  return (
    <Dialog open={open} onClose={onClose} title="曼荼羅を自動生成" width={640}>
      <div className="grid gap-4">
        <div>
          <span className="mb-1 block text-[11px] text-ink-2">対称数</span>
          <div className="flex flex-wrap gap-1">
            {SYMMETRY_PRESETS.map((s) => (
              <SmallButton key={s} active={symmetry === s} onClick={() => setSymmetry(s)}>
                {s}
              </SmallButton>
            ))}
          </div>
        </div>
        <div>
          <NumberField label="密度（density）" value={density} onChange={setDensity} min={0} max={1} step={0.05} />
          <p className="mt-1 text-[10px] leading-relaxed text-ink-3">密度が上がるほど、帯の数・セクタ内の要素数・局所リピート・装飾ドット・曲線の細部が増え、余白が減ります。</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <NumberField label="Random seed" value={seed} onChange={(v) => setSeed(Math.max(0, Math.floor(v)))} min={0} max={4294967295} step={1} slider={false} />
          </div>
          <SmallButton onClick={() => setSeed(randomSeed())}>🎲 ランダム</SmallButton>
        </div>
        <div className="rounded-lg border border-line bg-panel-2 p-3" data-testid="parts-section">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[12px] font-medium">マイパーツを使う</span>
            <span className="text-[10px] text-ink-3">{parts.length > 0 ? `要素パーツ ${parts.length} 件（有効 ${activeParts}）` : "要素パーツはまだありません"}</span>
          </div>
          {parts.length === 0 ? (
            <p className="text-[10px] leading-relaxed text-ink-3">要素を選択して Inspector の「パーツ保存」で登録すると、ここで生成に混ぜられます（リング・プロジェクトのパーツは対象外）。</p>
          ) : (
            <>
              <NumberField label="使用頻度（0 = 使わない、1 = 毎回まず試す）" value={partsFrequency} onChange={setPartsFrequency} min={0} max={1} step={0.05} />
              <p className="mb-2 mt-1 text-[10px] leading-relaxed text-ink-3">
                主モチーフ・副モチーフ・フィラーの各枠で、この確率でマイパーツを先に試します（入らなければ組み込みの形に戻ります）。パーツは枠の大きさに合わせて拡大縮小され、非対称なパーツは左右対のペアになります。重みは複数パーツの中で選ばれやすさを決めます。
              </p>
              <ul className="max-h-48 divide-y divide-line-2 overflow-auto rounded border border-line bg-paper">
                {parts.map((p) => {
                  const w = weightOf(p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-2 px-2 py-1 text-[11px]" data-part-row={p.id}>
                      <input type="checkbox" checked={w > 0} onChange={(e) => setWeight(p.id, e.target.checked ? 1 : 0)} title="生成に使う" />
                      <span className="min-w-0 flex-1 truncate" title={p.name}>
                        {p.name}
                      </span>
                      <span className="text-[10px] text-ink-3">{p.data.type}</span>
                      <div className="flex gap-0.5">
                        {WEIGHTS.map((o) => (
                          <SmallButton key={o.value} active={w === o.value} onClick={() => setWeight(p.id, o.value)} title={`重み ${o.value}`}>
                            {o.label}
                          </SmallButton>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <p className="text-[11px] text-ink-3">生成結果は現在のプロジェクトを置き換えます（元に戻すで復帰できます）。シート・加工制約・ブリッジ設定は引き継がれます。</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border border-line px-3 py-1.5 text-[12px] hover:bg-panel-2" onClick={onClose}>
            閉じる
          </button>
          <button
            type="button"
            className="rounded bg-panel-2 px-3 py-1.5 text-[12px] hover:bg-line"
            onClick={() => {
              const s = randomSeed();
              setSeed(s);
              run(s);
            }}
          >
            新しいseedで生成
          </button>
          <button type="button" className="rounded bg-accent px-4 py-1.5 text-[12px] font-medium text-white hover:bg-accent-2" onClick={() => run()}>
            生成
          </button>
        </div>
      </div>
    </Dialog>
  );
}
