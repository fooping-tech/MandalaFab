import { useMemo, useState } from "react";
import { actionExportParts, actionImportParts, actionInsertPart, actionLoadPreset, actionSavePart } from "../../editor/actions";
import { removeLibraryItem, renameLibraryItem, useLibrary } from "../../editor/library-store";
import { computeStaged, regionsToPath } from "../../editor/pipeline";
import { useEditor, type EditorStore } from "../../editor/store";
import { buildSector } from "../../geometry/elements/sector";
import { PART_KIND_LABEL, type LibraryItem, type PartKind } from "../../model/library";
import { DEFAULT_CONSTRAINTS, defaultRing, emptyProject, type Project } from "../../model/project";
import { loadPreset, PRESETS } from "../../presets";
import { Dialog } from "./Dialog";

export type PresetTab = "builtin" | "parts";

function projectThumb(p: Project): { path: string; bridges: string; viewBox: string; subpaths: number } {
  const r = computeStaged(p).stencil;
  return { path: r.finalPath, bridges: r.bridgePath, viewBox: `${-p.sheet.width / 2} ${-p.sheet.height / 2} ${p.sheet.width} ${p.sheet.height}`, subpaths: r.counts.subpaths };
}

/** Thumbnail data for a library part: element → one sector, ring → full ring, project → stencil. */
function partThumb(item: LibraryItem): { path: string; bridges: string; viewBox: string; subpaths: number } {
  if (item.kind === "project") return projectThumb(item.data);
  if (item.kind === "element") {
    const ring = defaultRing({ radius: 40, repeat: 1, mirrorLocal: false, elements: [item.data] });
    const res = buildSector(ring, { compounds: item.compounds, constraints: DEFAULT_CONSTRAINTS });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of res.cuts) for (const p of r.outer) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    if (!Number.isFinite(minX)) { minX = 30; maxX = 50; minY = -10; maxY = 10; }
    const size = Math.max(maxX - minX, maxY - minY, 4) * 1.2;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return { path: regionsToPath(res.cuts), bridges: "", viewBox: `${cx - size / 2} ${cy - size / 2} ${size} ${size}`, subpaths: res.cuts.length };
  }
  const ring = item.data;
  const reach = ring.elements.reduce((m, e) => Math.max(m, Math.abs(e.x) + e.length + e.width), 10);
  const half = Math.max(20, ring.radius + reach + 4);
  const p = emptyProject(item.name);
  p.center = { ...p.center, type: "none" };
  p.symmetry = ring.repeat;
  p.sheet = { width: half * 2, height: half * 2, outline: false, cornerRadius: 0 };
  p.rings = [ring];
  p.compounds = item.compounds;
  p.bridges = { ...p.bridges, auto: false };
  return projectThumb(p);
}

function ThumbSvg({ data }: { data: { path: string; bridges: string; viewBox: string; subpaths: number } }) {
  return (
    <>
      <svg viewBox={data.viewBox} className="h-40 w-full rounded bg-white">
        <path d={data.path} fillRule="evenodd" fill="#2b3a48" />
        {data.bridges && <path d={data.bridges} fill="#f6b26b" />}
      </svg>
      <div className="mt-0.5 text-right text-[9px] text-ink-3">{data.subpaths} paths</div>
    </>
  );
}

function PresetThumb({ id }: { id: string }) {
  const data = useMemo(() => projectThumb(loadPreset(id)), [id]);
  return <ThumbSvg data={data} />;
}

function PartThumb({ item }: { item: LibraryItem }) {
  const data = useMemo(() => {
    try {
      return partThumb(item);
    } catch {
      return { path: "", bridges: "", viewBox: "-10 -10 20 20", subpaths: 0 };
    }
  }, [item]);
  return <ThumbSvg data={data} />;
}

const TAB_CLS = (active: boolean): string => `rounded px-3 py-1 text-[12px] ${active ? "bg-select text-white" : "bg-panel text-ink-2 hover:text-ink"}`;
const ACTION_CLS = "rounded border border-line bg-paper px-2 py-0.5 text-[11px] hover:border-select hover:text-select";

function PartsTab({ store, onClose }: { store: EditorStore; onClose: () => void }) {
  const items = useLibrary();
  const selection = useEditor((s) => s.selection);
  const [filter, setFilter] = useState<PartKind | "all">("all");
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const selLabel = selection.kind === "element" ? "選択中の要素" : selection.kind === "ring" ? "選択中のリング" : "このプロジェクト";
  const insertLabel = (i: LibraryItem): string => (i.kind === "element" ? "挿入" : i.kind === "ring" ? "リングとして追加" : "開く");
  const insertTitle = (i: LibraryItem): string =>
    i.kind === "element" ? "選択中のリング（なければ最後のリング）に要素を追加" : i.kind === "ring" ? "新しいリングとして追加（半径・繰り返しは保存時のまま）" : "現在のプロジェクトを置き換えて開く";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ACTION_CLS} onClick={() => actionSavePart(store)} title="選択中の要素 / リング、または未選択ならプロジェクト全体を保存">
          ＋ {selLabel}を保存
        </button>
        <button type="button" className={ACTION_CLS} onClick={() => void actionImportParts(store)} title="mandalafab.parts.json を読み込む">
          読み込み (JSON)
        </button>
        <button type="button" className={ACTION_CLS} onClick={() => actionExportParts(store, shown)} disabled={shown.length === 0} title="表示中のパーツを JSON に書き出す">
          書き出し (JSON)
        </button>
        <div className="ml-auto flex gap-1">
          {(["all", "element", "ring", "project"] as const).map((k) => (
            <button key={k} type="button" className={TAB_CLS(filter === k)} onClick={() => setFilter(k)}>
              {k === "all" ? "すべて" : PART_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[12px] text-ink-3">
          まだパーツがありません。要素・リングを選択して Inspector の「パーツ保存」、または上の「保存」ボタンで登録します。
          <br />
          パーツはこのブラウザに保存されます。他の環境へは「書き出し」の JSON を「読み込み」で取り込んでください。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((item) => (
            <div key={item.id} className="rounded-lg border border-line bg-panel p-2 text-left" data-part-id={item.id}>
              <PartThumb item={item} />
              <div className="mt-1 flex items-center gap-1">
                <span className="rounded bg-paper px-1 text-[9px] text-ink-3">{PART_KIND_LABEL[item.kind]}</span>
                <span className="truncate text-[12px] font-medium" title={item.name}>
                  {item.name}
                </span>
              </div>
              <div className="text-[10px] text-ink-3">{new Date(item.createdAt).toLocaleDateString()}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  className="rounded bg-select px-2 py-0.5 text-[11px] text-white hover:opacity-90"
                  title={insertTitle(item)}
                  onClick={() => {
                    actionInsertPart(store, item);
                    onClose();
                  }}
                >
                  {insertLabel(item)}
                </button>
                <button
                  type="button"
                  className={ACTION_CLS}
                  onClick={() => {
                    const n = window.prompt("パーツ名", item.name);
                    if (n !== null) renameLibraryItem(item.id, n);
                  }}
                >
                  名前
                </button>
                <button type="button" className={ACTION_CLS} onClick={() => actionExportParts(store, [item])} title="このパーツだけ JSON に書き出す">
                  書き出し
                </button>
                <button
                  type="button"
                  className="rounded border border-line px-2 py-0.5 text-[11px] text-error hover:border-error"
                  onClick={() => {
                    if (window.confirm(`「${item.name}」を削除しますか？`)) removeLibraryItem(item.id);
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PresetDialog({ store, open, onClose, tab = "builtin" }: { store: EditorStore; open: boolean; onClose: () => void; tab?: PresetTab }) {
  const [current, setCurrent] = useState<PresetTab | null>(null);
  const active = current ?? tab;
  const count = useLibrary().length;
  return (
    <Dialog
      open={open}
      onClose={() => {
        setCurrent(null);
        onClose();
      }}
      title="プリセット / マイパーツ"
      width={760}
    >
      <div className="mb-3 flex gap-1 border-b border-line pb-2">
        <button type="button" className={TAB_CLS(active === "builtin")} onClick={() => setCurrent("builtin")}>
          組み込みプリセット
        </button>
        <button type="button" className={TAB_CLS(active === "parts")} onClick={() => setCurrent("parts")}>
          マイパーツ{count > 0 ? ` (${count})` : ""}
        </button>
      </div>
      {open && active === "parts" && (
        <PartsTab
          store={store}
          onClose={() => {
            setCurrent(null);
            onClose();
          }}
        />
      )}
      {open && active === "builtin" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rounded-lg border border-line bg-panel p-2 text-left hover:border-select hover:bg-select-bg"
              onClick={() => {
                actionLoadPreset(store, p.id);
                setCurrent(null);
                onClose();
              }}
            >
              <PresetThumb id={p.id} />
              <div className="mt-1 text-[12px] font-medium">{p.label}</div>
              <div className="text-[10px] leading-snug text-ink-3">{p.description}</div>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
