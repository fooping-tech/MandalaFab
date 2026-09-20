import { useState } from "react";
import { replaceProject } from "../../editor/commands";
import { useEditor, type EditorStore } from "../../editor/store";
import { generateProject, randomSeed } from "../../generate";
import { SYMMETRY_PRESETS } from "../../model/project";
import { NumberField, SmallButton } from "../fields";
import { Dialog } from "./Dialog";

export function GenerateDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const [symmetry, setSymmetry] = useState(project.generator?.symmetry ?? project.symmetry);
  const [complexity, setComplexity] = useState(project.generator?.complexity ?? 3);
  const [ringCount, setRingCount] = useState(project.generator?.ringCount ?? 5);
  const [density, setDensity] = useState(project.generator?.density ?? 0.5);
  const [seed, setSeed] = useState(project.generator?.seed ?? randomSeed());

  const run = (s = seed): void => {
    const params = { symmetry, complexity, ringCount, density, seed: s };
    const generated = generateProject(params, { sheet: project.sheet, constraints: project.constraints, bridges: project.bridges });
    store.execute(replaceProject(generated, `生成 (seed ${s})`));
    store.notify(`曼荼羅を生成しました（seed ${s}）。同じseedで同じ結果になります。`, "success");
  };

  return (
    <Dialog open={open} onClose={onClose} title="曼荼羅を自動生成">
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
        <NumberField label="複雑さ（complexity）" value={complexity} onChange={setComplexity} min={1} max={5} step={1} />
        <NumberField label="リング数" value={ringCount} onChange={(v) => setRingCount(Math.round(v))} min={1} max={12} step={1} />
        <NumberField label="密度（density）" value={density} onChange={setDensity} min={0} max={1} step={0.05} />
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <NumberField label="Random seed" value={seed} onChange={(v) => setSeed(Math.max(0, Math.floor(v)))} min={0} max={4294967295} step={1} slider={false} />
          </div>
          <SmallButton onClick={() => setSeed(randomSeed())}>🎲 ランダム</SmallButton>
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
