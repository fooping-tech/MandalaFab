import { useMemo } from "react";
import { actionAddElement, actionDuplicateSelected, actionDeleteSelected, actionGroupSelected, actionSavePart } from "../editor/actions";
import {
  addChild,
  addBezierSegment,
  findElementDeep,
  duplicateElement,
  duplicateRing,
  makeCompound,
  removeBezierSegment,
  removeElement,
  removeRing,
  setBezierPoint,
  setElementType,
  setSymmetry,
  updateBridges,
  updateCenter,
  updateConstraints,
  updateElement,
  updateElementParam,
  updateProject,
  updateRing,
  updateSheet,
} from "../editor/commands";
import { useRenderState } from "../editor/render-context";
import { useEditor, type EditorStore } from "../editor/store";
import { elementParamSpecs } from "../geometry/elements/builders";
import { listMotifs } from "../geometry/motifs";
import { ELEMENT_TYPES, LIMITS, MATERIAL_PRESETS, SHEET_PRESETS, SYMMETRY_PRESETS, newElement, type CenterMotif, type ElementType, type Ring, type SectorElement } from "../model/project";
import { NumberField, Section, SelectField, SmallButton, TextField, Toggle } from "./fields";
import { AddElementMenu } from "./RingTree";

export function Inspector({ store }: { store: EditorStore }) {
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  const ring = selection.kind === "ring" || selection.kind === "element" ? project.rings.find((r) => r.id === selection.ringId) : undefined;
  const element = selection.kind === "element" && ring ? findElementDeep(ring.elements, selection.elementId) : undefined;
  const title = selection.kind === "multi" ? "Selection" : element ? "Element Inspector" : ring ? "Ring Inspector" : selection.kind === "center" ? "Center Inspector" : "Mandala Inspector";
  return (
    <aside className="flex min-h-0 flex-col border-l border-line bg-panel">
      <div className="panel-title">
        <span>{title}</span>
        {selection.kind !== "project" && (
          <button type="button" className="text-[11px] normal-case tracking-normal text-ink-3 hover:text-ink" onClick={() => store.select(element && ring ? { kind: "ring", ringId: ring.id } : { kind: "project" })}>
            ← {element ? "リング" : "全体"}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {selection.kind === "multi" ? <MultiPanel store={store} /> : element && ring ? <ElementPanel store={store} ring={ring} element={element} /> : ring ? <RingPanel store={store} ring={ring} symmetry={project.symmetry} /> : selection.kind === "center" ? <CenterPanel store={store} center={project.center} /> : <ProjectPanel store={store} />}
        <ChecksPanel store={store} />
      </div>
    </aside>
  );
}

/** Several elements selected (Shift+click / marquee): batch operations. */
function MultiPanel({ store }: { store: EditorStore }) {
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  if (selection.kind !== "multi") return null;
  const items = selection.items;
  const rings = [...new Set(items.map((i) => i.ringId))].map((id) => project.rings.find((r) => r.id === id)).filter((r): r is Ring => !!r);
  const sameRing = rings.length === 1;
  const topLevel = sameRing ? items.filter((i) => rings[0]!.elements.some((e) => e.id === i.elementId)).length : 0;
  return (
    <>
      <Section title={`${items.length} 要素を選択中`}>
        <p className="text-[11px] text-ink-3">{sameRing ? `リング「${rings[0]!.name}」の要素` : `${rings.length} つのリングにまたがる選択`}。Shift+クリックで追加・解除、Esc で解除。</p>
        <ul className="max-h-40 overflow-auto rounded border border-line bg-paper text-[11px]">
          {items.map((i) => {
            const ring = project.rings.find((r) => r.id === i.ringId);
            const el = ring ? findElementDeep(ring.elements, i.elementId) : undefined;
            return (
              <li key={i.elementId} className="flex items-center gap-2 px-2 py-0.5">
                <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-select" onClick={() => store.select({ kind: "element", ringId: i.ringId, elementId: i.elementId })} title="この要素だけを選択">
                  {el?.name ?? el?.type ?? i.elementId}
                </button>
                <span className="text-[9px] text-ink-3">{ring?.name}</span>
                <button type="button" className="text-ink-3 hover:text-ink" onClick={() => store.toggleSelect(i.ringId, i.elementId)} title="選択から外す">
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="操作">
        <div className="flex flex-wrap gap-2">
          <SmallButton onClick={() => actionGroupSelected(store)} title={sameRing && topLevel >= 2 ? "選択した要素を 1 つの複合モチーフにまとめる (⌘G)" : "同じリング直下の要素を 2 つ以上選ぶとグループ化できます"}>
            グループ化{sameRing && topLevel >= 2 ? "" : "（同じリング内のみ）"}
          </SmallButton>
          <SmallButton onClick={() => actionDuplicateSelected(store)} title="⌘D">複製</SmallButton>
          <SmallButton onClick={() => actionSavePart(store)} title={sameRing ? "選択した要素を 1 つのグループとしてマイパーツに登録" : "同じリング内の要素を選ぶと登録できます"}>
            マイパーツに登録
          </SmallButton>
          <SmallButton danger onClick={() => actionDeleteSelected(store)} title="Delete">
            削除
          </SmallButton>
          <SmallButton onClick={() => store.select({ kind: "project" })}>選択解除</SmallButton>
        </div>
      </Section>
    </>
  );
}

function RingPanel({ store, ring, symmetry }: { store: EditorStore; ring: Ring; symmetry: number }) {
  const set = (patch: Partial<Ring>): void => store.execute(updateRing(ring.id, patch));
  const sectorAngle = 360 / Math.max(1, ring.repeat);
  const W = 2 * Math.PI * ring.radius * (sectorAngle / 360);
  return (
    <>
      <Section title="リング（セクタ）">
        <TextField label="名前" value={ring.name} onChange={(name) => set({ name })} />
        <NumberField label="半径（セクタ原点の距離）" value={ring.radius} onChange={(radius) => set({ radius })} min={LIMITS.radius.min} max={150} step={0.5} unit="mm" />
        <div>
          <NumberField label="回転複製数（repeat）" value={ring.repeat} onChange={(v) => set({ repeat: Math.round(v) })} min={1} max={64} step={1} />
          <div className="mt-1 flex flex-wrap gap-1">
            {[0.5, 1, 2, 3].map((k) => {
              const c = Math.max(1, Math.round(symmetry * k));
              return (
                <SmallButton key={k} active={ring.repeat === c} onClick={() => set({ repeat: c })} title={`対称数 ${symmetry} × ${k}`}>
                  {k === 0.5 ? "½" : `×${k}`} = {c}
                </SmallButton>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-ink-3">
            セクタ角 {sectorAngle.toFixed(1)}° · この半径での幅 ≈ {W.toFixed(1)} mm（y は ±{(W / 2).toFixed(1)} まで）
          </p>
        </div>
        <NumberField label="位相（オフセット）" value={ring.phase} onChange={(phase) => set({ phase })} min={LIMITS.phase.min} max={LIMITS.phase.max} step={0.5} unit="°" />
        <div className="flex gap-1">
          <SmallButton active={ring.phase === 0} onClick={() => set({ phase: 0 })}>
            0°
          </SmallButton>
          <SmallButton active={Math.abs(ring.phase - sectorAngle / 2) < 1e-9} onClick={() => set({ phase: Math.round((sectorAngle / 2) * 1000) / 1000 })} title="隣のリングと半セクタずらす">
            半セクタ
          </SmallButton>
        </div>
        <Toggle label="セクタ内ミラー（左右対称）" checked={ring.mirrorLocal} onChange={(mirrorLocal) => set({ mirrorLocal })} title="y ≥ 0 側にデザインした要素をセクタ軸で鏡映して両側に配置" />
        <Toggle label="表示" checked={ring.visible} onChange={(visible) => set({ visible })} />
      </Section>
      <Section title="要素を追加">
        <AddElementMenu onPick={(t) => actionAddElement(store, t)} />
      </Section>
      <Section title="操作">
        <div className="flex gap-2">
          <SmallButton onClick={() => store.execute(duplicateRing(ring.id))}>複製</SmallButton>
          <SmallButton onClick={() => actionSavePart(store)} title="このリング（セクタのデザイン）をマイパーツに登録">
            マイパーツに登録
          </SmallButton>
          <SmallButton danger onClick={() => store.execute(removeRing(ring.id))}>
            削除
          </SmallButton>
        </div>
      </Section>
    </>
  );
}

function ElementPanel({ store, ring, element: el }: { store: EditorStore; ring: Ring; element: SectorElement }) {
  const set = (patch: Partial<SectorElement>): void => store.execute(updateElement(ring.id, el.id, patch));
  const specs = elementParamSpecs(el);
  const typeInfo = ELEMENT_TYPES.find((t) => t.type === el.type);
  const compounds = useEditor((s) => s.project.compounds);
  const lineLike = el.type === "scurve" || el.type === "curl" || el.type === "spiral" || el.type === "connector" || el.type === "zigzag" || (el.type === "bezier" && !el.closed);
  return (
    <>
      <Section title="要素">
        <TextField label="名前" value={el.name ?? ""} onChange={(name) => set({ name })} />
        <SelectField label="種類" value={el.type} onChange={(t) => store.execute(setElementType(ring.id, el.id, t as ElementType))} options={ELEMENT_TYPES.map((t) => ({ value: t.type, label: t.label }))} />
        {typeInfo && <p className="-mt-1 text-[10px] text-ink-3">{typeInfo.description}</p>}
        {el.imported && (
          <p className={`rounded border px-2 py-1 text-[10px] ${el.imported.confidence < 0.7 ? "border-warn bg-[#fdf3e0] text-warn" : "border-line-2 text-ink-3"}`}>
            画像から認識: {el.imported.detectedType} · confidence {Math.round(el.imported.confidence * 100)}%{el.imported.confidence < 0.7 ? " — 自信が低いので形を確認してください" : ""}
          </p>
        )}
        {el.type === "shape" && <SelectField label="形" value={el.motif} onChange={(motif) => set({ motif } as Partial<SectorElement>)} options={listMotifs().map((m) => ({ value: m.id, label: m.label }))} />}
        {el.type === "compound" && (
          <SelectField label="複合モチーフ" value={el.ref} onChange={(ref) => set({ ref } as Partial<SectorElement>)} options={[{ value: "", label: "（未選択）" }, ...compounds.map((c) => ({ value: c.id, label: c.name }))]} />
        )}
        <SelectField
          label="ブーリアン"
          value={el.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: "cut", label: "cut（切り抜く）" },
            { value: "keep", label: "keep（材料を残す）" },
          ]}
        />
        <Toggle label="表示" checked={el.visible} onChange={(visible) => set({ visible })} />
      </Section>
      <Section title="配置（セクタ座標）">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="x（外向き）" value={el.x} onChange={(x) => set({ x })} min={-60} max={60} step={0.5} unit="mm" />
          <NumberField label="y（接線方向）" value={el.y} onChange={(y) => set({ y })} min={-60} max={60} step={0.5} unit="mm" />
        </div>
        <NumberField label="回転" value={el.rotation} onChange={(rotation) => set({ rotation })} min={-180} max={180} step={1} unit="°" />
        <SelectField
          label="向き"
          value={el.orient}
          onChange={(orient) => set({ orient })}
          options={[
            { value: "sector", label: "セクタ基準（配置のまま）" },
            { value: "radial", label: "放射（中心から外を向く）" },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="scaleX" value={el.scaleX} onChange={(scaleX) => set({ scaleX })} min={0.1} max={4} step={0.05} />
          <NumberField label="scaleY" value={el.scaleY} onChange={(scaleY) => set({ scaleY })} min={0.1} max={4} step={0.05} />
        </div>
        <Toggle label="ミラー（要素自身を反転）" checked={el.mirror} onChange={(mirror) => set({ mirror })} />
      </Section>
      <Section title="形状">
        {el.type !== "bezier" && el.type !== "connector" && el.type !== "compound" && (
          <>
            <NumberField label="長さ（軸方向）" value={el.length} onChange={(length) => set({ length })} min={LIMITS.length.min} max={80} step={0.5} unit="mm" />
            <NumberField label="幅" value={el.width} onChange={(width) => set({ width })} min={LIMITS.width.min} max={80} step={0.5} unit="mm" />
          </>
        )}
        <NumberField label={lineLike ? "線幅（帯の幅）" : "線幅（0 = 塗り、>0 = 輪郭線）"} value={el.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth })} min={0} max={10} step={0.1} unit="mm" />
        {specs.map((p) => (
          <NumberField key={p.key} label={p.label} value={el.params[p.key] ?? p.default} onChange={(v) => store.execute(updateElementParam(ring.id, el.id, p.key, v))} min={p.min} max={p.max} step={p.step} />
        ))}
        {!lineLike && el.type !== "compound" && (
          <>
            <NumberField label="縁取り（内側に材料を残す幅）" value={el.inset} onChange={(inset) => set({ inset })} min={0} max={8} step={0.1} unit="mm" />
            {(el.inset > 0 || (el.type === "paisley" && (el.params.innerGap ?? 0) > 0)) && <NumberField label="茎の幅（0 = 自動ブリッジ）" value={el.insetStem} onChange={(insetStem) => set({ insetStem })} min={0} max={8} step={0.1} unit="mm" />}
          </>
        )}
      </Section>
      {el.type === "bezier" && <BezierPanel store={store} ring={ring} element={el} />}
      <Section title="内部モチーフ（入れ子）">
        <p className="text-[10px] text-ink-3">この要素のローカル座標に置く子要素。cut は内側の材料を切り抜き、keep は材料を残します。</p>
        {el.children && el.children.length > 0 && (
          <ul className="grid gap-1 text-[11px]">
            {el.children.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <button type="button" className="flex-1 rounded border border-line-2 bg-paper px-2 py-0.5 text-left hover:border-select" onClick={() => store.select({ kind: "element", ringId: ring.id, elementId: c.id })}>
                  {c.name ?? c.type} · {c.mode}
                </button>
                <SmallButton danger onClick={() => store.execute(removeElement(ring.id, c.id))}>
                  ✕
                </SmallButton>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1">
          {(["teardrop", "leaf", "petal", "curl", "hook", "dot"] as ElementType[]).map((t) => (
            <SmallButton key={t} onClick={() => store.execute(addChild(ring.id, el.id, newElement(t, { name: `inner ${t}`, length: Math.max(2, el.length * 0.5), width: Math.max(1.5, el.width * 0.45), mode: "cut", strokeWidth: t === "curl" || t === "hook" ? Math.max(0.8, el.width * 0.12) : 0 })))}>
              ＋ {t}
            </SmallButton>
          ))}
        </div>
      </Section>
      {el.type === "connector" && (
        <Section title="コネクタ">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="from x" value={el.from.x} onChange={(x) => set({ from: { ...el.from, x } } as Partial<SectorElement>)} min={-60} max={60} step={0.5} slider={false} />
            <NumberField label="from y" value={el.from.y} onChange={(y) => set({ from: { ...el.from, y } } as Partial<SectorElement>)} min={-60} max={60} step={0.5} slider={false} />
            <NumberField label="to x" value={el.to.x} onChange={(x) => set({ to: { ...el.to, x } } as Partial<SectorElement>)} min={-60} max={60} step={0.5} slider={false} />
            <NumberField label="to y" value={el.to.y} onChange={(y) => set({ to: { ...el.to, y } } as Partial<SectorElement>)} min={-60} max={60} step={0.5} slider={false} />
          </div>
          <NumberField label="ふくらみ" value={el.bulge} onChange={(bulge) => set({ bulge } as Partial<SectorElement>)} min={-20} max={20} step={0.5} unit="mm" />
        </Section>
      )}
      <Section title="局所リピート（セクタ内）">
        <NumberField label="コピー数" value={el.repeat} onChange={(v) => set({ repeat: Math.round(v) })} min={1} max={12} step={1} />
        {el.repeat > 1 && <NumberField label="広がり（0 = セクタ角）" value={el.repeatSpread} onChange={(repeatSpread) => set({ repeatSpread })} min={0} max={180} step={1} unit="°" />}
      </Section>
      <Section title="操作">
        <div className="flex flex-wrap gap-2">
          <SmallButton onClick={() => store.execute(duplicateElement(ring.id, el.id))}>複製</SmallButton>
          <SmallButton onClick={() => store.execute(makeCompound(ring.id, [el.id], el.name ?? "compound"))} title="この要素を再利用可能な複合モチーフにする">
            複合モチーフ化
          </SmallButton>
          <SmallButton onClick={() => actionSavePart(store)} title="この要素（入れ子と複合モチーフを含む）をマイパーツに登録">
            マイパーツに登録
          </SmallButton>
          <SmallButton danger onClick={() => store.execute(removeElement(ring.id, el.id))}>
            削除
          </SmallButton>
        </div>
      </Section>
    </>
  );
}

function BezierPanel({ store, ring, element: el }: { store: EditorStore; ring: Ring; element: Extract<SectorElement, { type: "bezier" }> }) {
  const set = (patch: Partial<SectorElement>): void => store.execute(updateElement(ring.id, el.id, patch));
  return (
    <Section
      title="Bezier 制御点"
      right={
        <span className="flex gap-1 normal-case">
          <SmallButton onClick={() => store.execute(addBezierSegment(ring.id, el.id))}>＋ セグメント</SmallButton>
          <SmallButton onClick={() => store.execute(removeBezierSegment(ring.id, el.id))}>−</SmallButton>
        </span>
      }
    >
      <Toggle label="閉じたパス（塗り形状）" checked={el.closed} onChange={(closed) => set({ closed } as Partial<SectorElement>)} />
      <p className="text-[10px] text-ink-3">キャンバス上のハンドルをドラッグしても編集できます（最初のコピー）。</p>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-1 text-[11px]">
        {el.points.map((p, i) => {
          const role = i === 0 ? "start" : (i - 1) % 3 === 0 ? "cp1" : (i - 1) % 3 === 1 ? "cp2" : "end";
          return (
            <div key={i} className="contents">
              <span className="self-center font-mono text-ink-3">
                {Math.floor((i + 2) / 3)}.{role}
              </span>
              <input type="number" step={0.5} className="field-input font-mono" value={p.x} onChange={(e) => store.execute(setBezierPoint(ring.id, el.id, i, { x: Number(e.target.value), y: p.y }))} />
              <input type="number" step={0.5} className="field-input font-mono" value={p.y} onChange={(e) => store.execute(setBezierPoint(ring.id, el.id, i, { x: p.x, y: Number(e.target.value) }))} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function CenterPanel({ store, center }: { store: EditorStore; center: CenterMotif }) {
  const set = (patch: Partial<CenterMotif>): void => store.execute(updateCenter(patch));
  return (
    <Section title="中心モチーフ">
      <SelectField
        label="種類"
        value={center.type}
        onChange={(type) => set({ type })}
        options={[
          { value: "none", label: "なし" },
          { value: "radialPetals", label: "Radial petals（放射状の花弁）" },
          { value: "sunflower", label: "Sunflower（2層 + ドット）" },
          { value: "starburst", label: "Starburst（光線）" },
          { value: "circularPetals", label: "Circular petals（丸い花弁）" },
        ]}
      />
      <NumberField label="花弁数" value={center.petals} onChange={(v) => set({ petals: Math.round(v) })} min={3} max={64} step={1} />
      <NumberField label="内側半径" value={center.innerRadius} onChange={(innerRadius) => set({ innerRadius })} min={0} max={60} step={0.5} unit="mm" />
      <NumberField label="外側半径" value={center.outerRadius} onChange={(outerRadius) => set({ outerRadius })} min={1} max={100} step={0.5} unit="mm" />
      <NumberField label="花弁の幅" value={center.petalWidth} onChange={(petalWidth) => set({ petalWidth })} min={0.5} max={30} step={0.1} unit="mm" />
      <NumberField label="中心の円（半径）" value={center.coreRadius} onChange={(coreRadius) => set({ coreRadius })} min={0} max={40} step={0.5} unit="mm" />
      <NumberField label="線幅（0 = 塗り）" value={center.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth })} min={0} max={8} step={0.1} unit="mm" />
      <NumberField label="回転" value={center.rotation} onChange={(rotation) => set({ rotation })} min={-180} max={180} step={1} unit="°" />
    </Section>
  );
}

function ReferencePanel({ store }: { store: EditorStore }) {
  const ref = useEditor((s) => s.reference);
  const diff = useEditor((s) => s.view.diff);
  if (!ref) return null;
  return (
    <Section title="参照画像（Reference Layer）" right={<SmallButton danger onClick={() => store.setReference(null)}>削除</SmallButton>}>
      <Toggle label="表示" checked={ref.visible} onChange={(visible) => store.updateReference({ visible })} />
      <NumberField label="不透明度" value={ref.opacity} onChange={(opacity) => store.updateReference({ opacity })} min={0} max={1} step={0.05} />
      <NumberField label="表示幅（スケール）" value={ref.widthMm} onChange={(widthMm) => store.updateReference({ widthMm })} min={10} max={600} step={0.5} unit="mm" />
      <NumberField label="回転" value={ref.rotation} onChange={(rotation) => store.updateReference({ rotation })} min={-180} max={180} step={0.5} unit="°" />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X オフセット" value={ref.x} onChange={(x) => store.updateReference({ x })} min={-200} max={200} step={0.5} unit="mm" slider={false} />
        <NumberField label="Y オフセット" value={ref.y} onChange={(y) => store.updateReference({ y })} min={-200} max={200} step={0.5} unit="mm" slider={false} />
      </div>
      <SelectField
        label="Difference View"
        value={diff}
        onChange={(v) => store.setView({ diff: v })}
        options={[
          { value: "off", label: "通常表示" },
          { value: "reference", label: "reference only（参照画像のみ）" },
          { value: "generated", label: "generated only（生成形状のみ）" },
          { value: "overlap", label: "overlap（重ね合わせ）" },
        ]}
      />
    </Section>
  );
}

function ProjectPanel({ store }: { store: EditorStore }) {
  const project = useEditor((s) => s.project);
  const { sheet, constraints, bridges } = project;
  const sheetPreset = SHEET_PRESETS.find((p) => p.width === sheet.width && p.height === sheet.height);
  const materialMatch = useMemo(() => MATERIAL_PRESETS.find((m) => JSON.stringify(m.constraints) === JSON.stringify(constraints)), [constraints]);
  return (
    <>
      <ReferencePanel store={store} />
      <Section title="プロジェクト">
        <TextField label="名前" value={project.name} onChange={(name) => store.execute(updateProject({ name }, "名前を変更"))} />
        <div className="flex gap-2">
          <SmallButton onClick={() => actionSavePart(store)} title="このプロジェクト全体を自分のプリセットとしてマイパーツに登録">
            マイパーツに登録
          </SmallButton>
        </div>
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
          <p className="mt-1 text-[10px] text-ink-3">対称数を変えると、その倍数だった repeat（リング・中心の花弁数）も連動します。</p>
        </div>
        {project.seed !== undefined && (
          <div className="text-[11px] text-ink-3">
            seed: <span className="font-mono">{project.seed}</span>
            {project.generator && <span> · density {project.generator.density}</span>}
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
        <Toggle label="外形も出力する" checked={sheet.outline} onChange={(outline) => store.execute(updateSheet({ outline }))} />
        {sheet.outline && <NumberField label="角の丸み" value={sheet.cornerRadius} onChange={(cornerRadius) => store.execute(updateSheet({ cornerRadius }))} min={0} max={50} step={0.5} unit="mm" />}
      </Section>
      <Section title="ブリッジ">
        <Toggle label="自動ブリッジ" checked={bridges.auto} onChange={(auto) => store.execute(updateBridges({ auto }))} />
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
        <NumberField label="食い込み" value={bridges.overlap} onChange={(overlap) => store.execute(updateBridges({ overlap }))} min={0} max={3} step={0.1} unit="mm" />
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
  const render = useRenderState();
  const focused = useEditor((s) => s.focusedIssueId);
  const d = render.data;
  const v = d.validation;
  const issues = v?.issues ?? [];
  const badge = render.validating ? "検証中…" : issues.length === 0 ? "問題なし" : `${issues.length} 件`;
  return (
    <Section title="加工チェック" right={<span className={`text-[10px] normal-case ${issues.some((i) => i.severity === "error") ? "text-error" : issues.some((i) => i.severity === "warning") ? "text-warn" : "text-ok"}`}>{badge}</span>}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-ink-2">
        <span>書き出しパス</span>
        <span className="text-right font-mono">{d.counts.subpaths}</span>
        <span>島（ブリッジ前）</span>
        <span className="text-right font-mono">{d.counts.islandsBefore}</span>
        <span>島（残り）</span>
        <span className={`text-right font-mono ${d.counts.islands > 0 ? "text-error" : ""}`}>{d.counts.islands}</span>
        <span>ブリッジ</span>
        <span className="text-right font-mono">{d.counts.bridges}</span>
        {v && (
          <>
            <span>カット長</span>
            <span className="text-right font-mono">{v.stats.cutLength.toFixed(0)} mm</span>
            <span>切り抜き面積</span>
            <span className="text-right font-mono">{v.stats.apertureArea.toFixed(0)} mm²</span>
          </>
        )}
      </div>
      {d.notes.map((n, i) => (
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
                  if (i.ringIds?.[0]) store.select({ kind: "ring", ringId: i.ringIds[0] });
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
