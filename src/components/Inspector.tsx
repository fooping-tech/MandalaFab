import { duplicateRing, removeRing, setSymmetry, updateBridges, updateConstraints, updateProject, updateRing, updateRingParam, updateSheet } from "../editor/commands";
import { useRender } from "../editor/render-context";
import { useEditor, type EditorStore } from "../editor/store";
import { getMotif, listMotifs } from "../geometry/motifs";
import { LIMITS, MATERIAL_PRESETS, SHEET_PRESETS, SYMMETRY_PRESETS, type Ring } from "../model/project";
import { NumberField, Section, SelectField, SmallButton, TextField, Toggle } from "./fields";

export function Inspector({ store }: { store: EditorStore }) {
  const selected = useEditor((s) => s.selectedRingId);
  const project = useEditor((s) => s.project);
  const ring = selected ? project.rings.find((r) => r.id === selected) : undefined;
  return (
    <aside className="flex min-h-0 flex-col border-l border-line bg-panel">
      <div className="panel-title">
        <span>{ring ? "Ring Inspector" : "Mandala Inspector"}</span>
        {ring && (
          <button type="button" className="text-[11px] normal-case tracking-normal text-ink-3 hover:text-ink" onClick={() => store.select(null)}>
            ← 全体
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {ring ? <RingPanel store={store} ring={ring} symmetry={project.symmetry} /> : <ProjectPanel store={store} />}
        <ChecksPanel store={store} />
      </div>
    </aside>
  );
}

function RingPanel({ store, ring, symmetry }: { store: EditorStore; ring: Ring; symmetry: number }) {
  const set = (patch: Partial<Ring>): void => store.execute(updateRing(ring.id, patch));
  const def = getMotif(ring.motif);
  const lineLike = def.lineLike === true;
  return (
    <>
      <Section title="リング">
        <TextField label="名前" value={ring.name} onChange={(name) => set({ name })} />
        <SelectField
          label="モチーフ"
          value={ring.motif}
          onChange={(motif) => set({ motif, params: {} })}
          options={listMotifs().map((m) => ({ value: m.id, label: `${m.label}${m.lineLike ? "（線）" : ""}` }))}
        />
        {def.description && <p className="-mt-1 text-[10px] text-ink-3">{def.description}</p>}
        <div>
          <NumberField label="モチーフ数" value={ring.count} onChange={(count) => set({ count: Math.round(count) })} min={LIMITS.count.min} max={64} step={1} />
          <div className="mt-1 flex flex-wrap gap-1">
            {[0.5, 1, 2, 3, 4].map((k) => {
              const c = Math.max(1, Math.round(symmetry * k));
              return (
                <SmallButton key={k} active={ring.count === c} onClick={() => set({ count: c })} title={`対称数 ${symmetry} × ${k}`}>
                  {k === 0.5 ? "½" : `×${k}`} = {c}
                </SmallButton>
              );
            })}
          </div>
        </div>
        <NumberField label="半径（中心からの距離）" value={ring.radius} onChange={(radius) => set({ radius })} min={LIMITS.radius.min} max={150} step={0.5} unit="mm" />
        <NumberField label="幅（放射方向の長さ）" value={ring.length} onChange={(length) => set({ length })} min={LIMITS.length.min} max={100} step={0.5} unit="mm" />
        <NumberField label="サイズ（接線方向）" value={ring.width} onChange={(width) => set({ width })} min={LIMITS.width.min} max={100} step={0.5} unit="mm" />
        <NumberField label="回転角" value={ring.rotation} onChange={(rotation) => set({ rotation })} min={LIMITS.rotation.min} max={LIMITS.rotation.max} step={1} unit="°" />
        <NumberField label="オフセット（位相）" value={ring.phase} onChange={(phase) => set({ phase })} min={LIMITS.phase.min} max={LIMITS.phase.max} step={0.5} unit="°" />
        <div className="flex gap-1">
          <SmallButton active={ring.phase === 0} onClick={() => set({ phase: 0 })}>
            0°
          </SmallButton>
          <SmallButton active={Math.abs(ring.phase - 180 / Math.max(1, ring.count)) < 1e-9} onClick={() => set({ phase: Math.round((180 / Math.max(1, ring.count)) * 1000) / 1000 })} title="隣のリングと半ピッチずらす">
            半ピッチ
          </SmallButton>
        </div>
        <NumberField label={lineLike ? "線幅（帯の幅）" : "線幅（0 = 塗り、>0 = 輪郭線）"} value={ring.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth })} min={0} max={LIMITS.strokeWidth.max} step={0.1} unit="mm" />
        <NumberField label="間隔（交互の放射オフセット）" value={ring.stagger} onChange={(stagger) => set({ stagger })} min={LIMITS.stagger.min} max={LIMITS.stagger.max} step={0.5} unit="mm" />
        <SelectField
          label="向き"
          value={ring.direction}
          onChange={(direction) => set({ direction })}
          options={[
            { value: "outward", label: "外向き" },
            { value: "inward", label: "内向き" },
          ]}
        />
        <SelectField
          label="回転モード"
          value={ring.rotationMode}
          onChange={(rotationMode) => set({ rotationMode })}
          options={[
            { value: "radial", label: "放射（中心を向く）" },
            { value: "fixed", label: "固定（同じ向き）" },
          ]}
        />
        <Toggle label="表示" checked={ring.visible} onChange={(visible) => set({ visible })} />
      </Section>
      {def.params.length > 0 && (
        <Section title={`${def.label} のパラメータ`}>
          {def.params.map((p) => (
            <NumberField key={p.key} label={p.label} value={ring.params[p.key] ?? p.default} onChange={(v) => store.execute(updateRingParam(ring.id, p.key, v))} min={p.min} max={p.max} step={p.step} />
          ))}
        </Section>
      )}
      <Section title="操作">
        <div className="flex gap-2">
          <SmallButton onClick={() => store.execute(duplicateRing(ring.id))}>複製</SmallButton>
          <SmallButton danger onClick={() => store.execute(removeRing(ring.id))}>
            削除
          </SmallButton>
        </div>
      </Section>
    </>
  );
}

function ProjectPanel({ store }: { store: EditorStore }) {
  const project = useEditor((s) => s.project);
  const { sheet, constraints, bridges } = project;
  const sheetPreset = SHEET_PRESETS.find((p) => p.width === sheet.width && p.height === sheet.height);
  const materialMatch = MATERIAL_PRESETS.find((m) => JSON.stringify(m.constraints) === JSON.stringify(constraints));
  return (
    <>
      <Section title="プロジェクト">
        <TextField label="名前" value={project.name} onChange={(name) => store.execute(updateProject({ name }, "名前を変更"))} />
        <div>
          <span className="mb-0.5 block text-[11px] text-ink-2">対称数（symmetry）</span>
          <div className="flex flex-wrap gap-1">
            {SYMMETRY_PRESETS.map((s) => (
              <SmallButton key={s} active={project.symmetry === s} onClick={() => store.execute(setSymmetry(s, true))}>
                {s}
              </SmallButton>
            ))}
          </div>
          <div className="mt-1.5">
            <NumberField label="任意の対称数" value={project.symmetry} onChange={(v) => store.execute(setSymmetry(Math.round(v), true))} min={LIMITS.symmetry.min} max={LIMITS.symmetry.max} step={1} slider={false} />
          </div>
          <p className="mt-1 text-[10px] text-ink-3">対称数を変えると、その倍数だったリングのモチーフ数も連動します。</p>
        </div>
        {project.seed !== undefined && (
          <div className="text-[11px] text-ink-3">
            seed: <span className="font-mono">{project.seed}</span>
          </div>
        )}
      </Section>
      <Section title="シート">
        <SelectField
          label="サイズ"
          value={sheetPreset ? sheetPreset.label : "custom"}
          onChange={(v) => {
            const p = SHEET_PRESETS.find((x) => x.label === v);
            if (p) store.execute(updateSheet({ width: p.width, height: p.height }));
          }}
          options={[...SHEET_PRESETS.map((p) => ({ value: p.label, label: p.label })), { value: "custom", label: "カスタム" }]}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="幅" value={sheet.width} onChange={(width) => store.execute(updateSheet({ width }))} min={LIMITS.sheet.min} max={LIMITS.sheet.max} step={1} unit="mm" slider={false} />
          <NumberField label="高さ" value={sheet.height} onChange={(height) => store.execute(updateSheet({ height }))} min={LIMITS.sheet.min} max={LIMITS.sheet.max} step={1} unit="mm" slider={false} />
        </div>
        <Toggle label="外形も出力する" checked={sheet.outline} onChange={(outline) => store.execute(updateSheet({ outline }))} title="SVGにシートの外形線を含める" />
        {sheet.outline && <NumberField label="角の丸み" value={sheet.cornerRadius} onChange={(cornerRadius) => store.execute(updateSheet({ cornerRadius }))} min={0} max={50} step={0.5} unit="mm" />}
      </Section>
      <Section title="ブリッジ">
        <Toggle label="自動ブリッジ" checked={bridges.auto} onChange={(auto) => store.execute(updateBridges({ auto }))} title="脱落する島を外側へ自動で接続する" />
        <NumberField label="ブリッジ幅" value={bridges.width} onChange={(width) => store.execute(updateBridges({ width }))} min={0.2} max={10} step={0.1} unit="mm" />
        <SelectField
          label="中心の島のブリッジ数"
          value={bridges.centerCount === "auto" ? "auto" : String(bridges.centerCount)}
          onChange={(v) => store.execute(updateBridges({ centerCount: v === "auto" ? "auto" : Number(v) }))}
          options={[{ value: "auto", label: "自動（対称数から）" }, ...[1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => ({ value: String(n), label: `${n}` }))]}
        />
        <SelectField
          label="島ごとのブリッジ"
          value={String(bridges.perIsland)}
          onChange={(v) => store.execute(updateBridges({ perIsland: v === "1" ? 1 : 2 }))}
          options={[
            { value: "2", label: "2本（内側 + 外側）" },
            { value: "1", label: "1本（最短）" },
          ]}
        />
        <NumberField label="食い込み（オーバーラップ）" value={bridges.overlap} onChange={(overlap) => store.execute(updateBridges({ overlap }))} min={0} max={3} step={0.1} unit="mm" />
      </Section>
      <Section title="加工制約">
        <SelectField
          label="材料プリセット"
          value={materialMatch?.id ?? "custom"}
          onChange={(id) => {
            const m = MATERIAL_PRESETS.find((x) => x.id === id);
            if (m) store.execute(updateConstraints({ ...m.constraints }));
          }}
          options={[...MATERIAL_PRESETS.map((m) => ({ value: m.id, label: m.label })), { value: "custom", label: "カスタム" }]}
        />
        <NumberField label="最小ブリッジ幅" value={constraints.minBridgeWidth} onChange={(minBridgeWidth) => store.execute(updateConstraints({ minBridgeWidth }))} min={0.1} max={10} step={0.1} unit="mm" />
        <NumberField label="最小形状幅（切り抜き）" value={constraints.minFeatureWidth} onChange={(minFeatureWidth) => store.execute(updateConstraints({ minFeatureWidth }))} min={0.1} max={10} step={0.1} unit="mm" />
        <NumberField label="最小間隔（残す材料）" value={constraints.minGap} onChange={(minGap) => store.execute(updateConstraints({ minGap }))} min={0.1} max={10} step={0.1} unit="mm" />
        <NumberField label="最小穴径" value={constraints.minHoleDiameter} onChange={(minHoleDiameter) => store.execute(updateConstraints({ minHoleDiameter }))} min={0.1} max={10} step={0.1} unit="mm" />
      </Section>
    </>
  );
}

function ChecksPanel({ store }: { store: EditorStore }) {
  const render = useRender();
  const focused = useEditor((s) => s.focusedIssueId);
  const { issues, stats } = render.validation;
  const notes = render.geometry.rings.flatMap((r) => r.notes);
  return (
    <Section
      title="加工チェック"
      right={<span className={`text-[10px] normal-case ${issues.some((i) => i.severity === "error") ? "text-error" : issues.length ? "text-warn" : "text-ok"}`}>{issues.length === 0 ? "問題なし" : `${issues.length} 件`}</span>}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-ink-2">
        <span>切り抜き領域</span>
        <span className="text-right font-mono">{stats.regions}</span>
        <span>島（ブリッジ前）</span>
        <span className="text-right font-mono">{render.stencil.islandsBefore.length}</span>
        <span>島（残り）</span>
        <span className={`text-right font-mono ${stats.islands > 0 ? "text-error" : ""}`}>{stats.islands}</span>
        <span>ブリッジ</span>
        <span className="text-right font-mono">{stats.bridges}</span>
        <span>カット長</span>
        <span className="text-right font-mono">{stats.cutLength.toFixed(0)} mm</span>
        <span>切り抜き面積</span>
        <span className="text-right font-mono">{stats.apertureArea.toFixed(0)} mm²</span>
      </div>
      {notes.map((n, i) => (
        <p key={i} className="text-[10px] text-ink-3">
          {n}
        </p>
      ))}
      {issues.length > 0 && (
        <ul className="grid gap-1">
          {issues.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className={`w-full rounded border px-2 py-1 text-left text-[11px] leading-snug ${focused === i.id ? "border-select bg-select-bg" : "border-line-2 bg-paper hover:border-line"}`}
                onClick={() => {
                  store.focusIssue(focused === i.id ? null : i.id);
                  if (i.ringIds?.[0]) store.select(i.ringIds[0]);
                }}
              >
                <span className={`mr-1 ${i.severity === "error" ? "text-error" : i.severity === "warning" ? "text-warn" : "text-ink-3"}`}>{i.severity === "error" ? "✕" : i.severity === "warning" ? "△" : "ⓘ"}</span>
                {i.message}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] leading-relaxed text-ink-3">検証は形状上の問題を見つけるためのものです。材料強度や切断後の完全性を保証するものではありません。</p>
    </Section>
  );
}
