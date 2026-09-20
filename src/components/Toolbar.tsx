import type { CanvasApi, DialogName } from "../app/App";
import { actionAddRing, actionExportSVG, actionNew, actionOpen, actionSaveJSON } from "../editor/actions";
import { useRenderState } from "../editor/render-context";
import { useEditor, type EditorStore } from "../editor/store";
import { APP_VERSION } from "../model/project";

interface Props {
  store: EditorStore;
  openDialog: (d: DialogName) => void;
  canvasApi: CanvasApi | null;
}

function Btn({ icon, label, onClick, active, disabled, primary, title }: { icon: string; label: string; onClick: () => void; active?: boolean; disabled?: boolean; primary?: boolean; title?: string }) {
  return (
    <button type="button" className={`tool-btn ${active ? "active" : ""} ${primary ? "primary" : ""}`} onClick={onClick} disabled={disabled} title={title ?? label}>
      <span className="icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

const Sep = () => <div className="mx-1 h-9 w-px self-center bg-line" />;

export function Toolbar({ store, openDialog, canvasApi }: Props) {
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const view = useEditor((s) => s.view);
  const name = useEditor((s) => s.project.name);
  const render = useRenderState();
  return (
    <header className="flex h-[64px] shrink-0 items-center gap-0.5 border-b border-line bg-panel px-2">
      <div className="mr-3 flex items-center gap-2 pl-1">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-wide">MandalaFab</div>
          <div className="text-[10px] text-ink-3">曼荼羅ステンシル CAD · v{APP_VERSION}</div>
        </div>
      </div>
      <Sep />
      <Btn icon="✦" label="新規" onClick={() => actionNew(store)} />
      <Btn icon="▤" label="プリセット" onClick={() => openDialog("presets")} />
      <Btn icon="▣" label="マイパーツ" onClick={() => openDialog("parts")} title="自分で保存した要素・リング・プロジェクトを挿入 / 管理" />
      <Btn icon="⚄" label="生成" onClick={() => openDialog("generate")} />
      <Btn icon="⌂" label="開く" onClick={() => void actionOpen(store)} title="JSON / MandalaFab SVG を開く (⌘O)" />
      <Btn icon="⬇" label="保存" onClick={() => actionSaveJSON(store)} title="プロジェクトJSONを保存 (⌘S)" />
      <Btn icon="🖼" label="参照画像" onClick={() => openDialog("import")} title="Import Reference: 画像を読み込んで曼荼羅プロジェクトへ変換" />
      <Sep />
      <Btn icon="↶" label="戻す" onClick={() => store.undo()} disabled={!canUndo} title="元に戻す (⌘Z)" />
      <Btn icon="↷" label="進む" onClick={() => store.redo()} disabled={!canRedo} title="やり直し (⌘⇧Z)" />
      <Sep />
      <Btn icon="＋" label="リング" onClick={() => actionAddRing(store)} title="リング（セクタ）を追加 (N)" />
      <Sep />
      <Btn icon="◌" label="デザイン" onClick={() => store.setView({ mode: "design" })} active={view.mode === "design"} title="要素ごとの形状（S で切替）" />
      <Btn icon="▢" label="材料" onClick={() => store.setView({ mode: "material" })} active={view.mode === "material"} title="Material View: 残る材料を白で表示" />
      <Btn icon="■" label="抜き" onClick={() => store.setView({ mode: "cutout" })} active={view.mode === "cutout"} title="Cutout View: レーザーで抜ける領域を黒で表示" />
      <Btn icon="✂" label="加工プレビュー" onClick={() => store.togglePreview()} active={view.mode === "preview"} title="加工プレビュー: 書き出される SVG と同じカットライン（赤）だけを表示 (P)" />
      <Btn icon="▦" label="グリッド" onClick={() => store.setView({ grid: !view.grid })} active={view.grid} title="グリッド (G)" />
      <Btn icon="✳" label="ガイド" onClick={() => store.setView({ guides: !view.guides })} active={view.guides} title="中心・放射・セクタガイド" />
      <Btn icon="⚠" label="問題" onClick={() => store.setView({ showIssues: !view.showIssues })} active={view.showIssues} title="検証で見つかった領域をハイライト" />
      <Btn icon="⊟" label="ブリッジ" onClick={() => store.setView({ showBridges: !view.showBridges })} active={view.showBridges} title="ブリッジを表示" />
      <Sep />
      <Btn icon="⊕" label="拡大" onClick={() => canvasApi?.zoomBy(1.25)} />
      <Btn icon="⊖" label="縮小" onClick={() => canvasApi?.zoomBy(1 / 1.25)} />
      <Btn icon="⛶" label="全体" onClick={() => canvasApi?.fit()} title="全体表示 (F)" />
      <div className="flex-1" />
      <div className="mr-2 max-w-[200px] truncate text-[12px] text-ink-2" title={name}>
        {name}
      </div>
      <Btn icon="⇪" label="共有URL" onClick={() => openDialog("share")} />
      <Btn icon="?" label="ヘルプ" onClick={() => openDialog("help")} />
      <Btn icon="⬢" label="SVG出力" onClick={() => actionExportSVG(store, render.data)} primary title="レーザー加工用SVGを書き出す (⌘⇧S)" />
    </header>
  );
}
