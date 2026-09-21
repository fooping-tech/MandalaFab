import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasApi, DialogName } from "../app/App";
import { useIsMobile } from "../app/use-media";
import { actionAddRing, actionExportSVG, actionNew, actionOpen, actionSaveJSON } from "../editor/actions";
import { useRenderState } from "../editor/render-context";
import { useEditor, type EditorStore } from "../editor/store";
import { updateOutput } from "../editor/commands";
import { APP_VERSION } from "../model/project";

interface Props {
  store: EditorStore;
  openDialog: (d: DialogName) => void;
  canvasApi: CanvasApi | null;
}

type Item = { kind: "btn"; key: string; icon: string; label: string; onClick: () => void; active?: boolean; disabled?: boolean; title?: string; priority: number } | { kind: "sep"; key: string };

function Btn({ icon, label, onClick, active, disabled, primary, title }: { icon: string; label: string; onClick: () => void; active?: boolean; disabled?: boolean; primary?: boolean; title?: string }) {
  return (
    <button type="button" className={`tool-btn shrink-0 ${active ? "active" : ""} ${primary ? "primary" : ""}`} onClick={onClick} disabled={disabled} title={title ?? label}>
      <span className="icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

const Sep = () => <div className="mx-1 h-9 w-px shrink-0 self-center bg-line" />;

/** Button footprint (min-width + gap) used to decide how many fit. */
const BTN_W_DESKTOP = 66;
const BTN_W_MOBILE = 46;
const SEP_W = 10;

/**
 * Toolbar whose buttons overflow into a "⋯" menu when the window is narrow, so
 * the SVG export button is always reachable. Lower priority = hidden first.
 */
export function Toolbar({ store, openDialog, canvasApi }: Props) {
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const view = useEditor((s) => s.view);
  const name = useEditor((s) => s.project.name);
  const polarity = useEditor((s) => s.project.output.polarity);
  const render = useRenderState();
  const mobile = useIsMobile();
  const headerRef = useRef<HTMLElement>(null);
  const fixedRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fixedW, setFixedW] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = (): void => {
      setWidth(el.clientWidth);
      setFixedW((fixedRef.current?.offsetWidth ?? 0) + (rightRef.current?.offsetWidth ?? 0));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mobile]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent): void => {
      const t = e.target as Element | null;
      if (t && t.closest?.("[data-more-menu]")) return;
      setMoreOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", (e) => e.key === "Escape" && setMoreOpen(false), { once: true });
    return () => window.removeEventListener("mousedown", close);
  }, [moreOpen]);

  // priority: 0 = essential (kept longest), higher = overflows first.
  const items: Item[] = [
    { kind: "btn", key: "new", icon: "✦", label: "新規", onClick: () => actionNew(store), priority: 3 },
    { kind: "btn", key: "presets", icon: "▤", label: "プリセット", onClick: () => openDialog("presets"), priority: 0 },
    { kind: "btn", key: "parts", icon: "▣", label: "マイパーツ", onClick: () => openDialog("parts"), title: "自分で保存した要素・リング・プロジェクトを挿入 / 管理", priority: 2 },
    { kind: "btn", key: "generate", icon: "⚄", label: "生成", onClick: () => openDialog("generate"), priority: 1 },
    { kind: "btn", key: "open", icon: "⌂", label: "開く", onClick: () => void actionOpen(store), title: "JSON / MandalaFab SVG を開く (⌘O)", priority: 3 },
    { kind: "btn", key: "save", icon: "⬇", label: "保存", onClick: () => actionSaveJSON(store), title: "プロジェクトJSONを保存 (⌘S)", priority: 2 },
    { kind: "btn", key: "import", icon: "🖼", label: "参照画像", onClick: () => openDialog("import"), title: "Import Reference: 画像を読み込んで曼荼羅プロジェクトへ変換", priority: 5 },
    { kind: "sep", key: "s1" },
    { kind: "btn", key: "undo", icon: "↶", label: "戻す", onClick: () => store.undo(), disabled: !canUndo, title: "元に戻す (⌘Z)", priority: 1 },
    { kind: "btn", key: "redo", icon: "↷", label: "進む", onClick: () => store.redo(), disabled: !canRedo, title: "やり直し (⌘⇧Z)", priority: 4 },
    { kind: "sep", key: "s2" },
    { kind: "btn", key: "ring", icon: "＋", label: "リング", onClick: () => actionAddRing(store), title: "リング（セクタ）を追加 (N)", priority: 1 },
    { kind: "btn", key: "polarity", icon: polarity === "positive" ? "◉" : "◎", label: polarity === "positive" ? "Positive" : "Stencil", onClick: () => store.execute(updateOutput({ polarity: polarity === "positive" ? "stencil" : "positive" })), active: polarity === "positive", title: polarity === "positive" ? "Output: Positive（曼荼羅そのものを切り残す）→ クリックで Stencil へ" : "Output: Stencil（シートに曼荼羅を抜く）→ クリックで Positive へ", priority: 2 },
    { kind: "sep", key: "s3" },
    { kind: "btn", key: "design", icon: "◌", label: "デザイン", onClick: () => store.setView({ mode: "design" }), active: view.mode === "design", title: "要素ごとの形状（S で切替）", priority: 4 },
    { kind: "btn", key: "material", icon: "▢", label: "材料", onClick: () => store.setView({ mode: "material" }), active: view.mode === "material", title: "Material View: 残る材料を白で表示", priority: 4 },
    { kind: "btn", key: "cutout", icon: "■", label: "抜き", onClick: () => store.setView({ mode: "cutout" }), active: view.mode === "cutout", title: "Cutout View: レーザーで抜ける領域を黒で表示", priority: 5 },
    { kind: "btn", key: "preview", icon: "✂", label: "プレビュー", onClick: () => store.togglePreview(), active: view.mode === "preview", title: "加工プレビュー: 書き出される SVG と同じカットライン（赤）だけを表示 (P)", priority: 3 },
    { kind: "btn", key: "grid", icon: "▦", label: "グリッド", onClick: () => store.setView({ grid: !view.grid }), active: view.grid, title: "グリッド (G)", priority: 7 },
    { kind: "btn", key: "guides", icon: "✳", label: "ガイド", onClick: () => store.setView({ guides: !view.guides }), active: view.guides, title: "中心・放射・セクタガイド", priority: 7 },
    { kind: "btn", key: "issues", icon: "⚠", label: "問題", onClick: () => store.setView({ showIssues: !view.showIssues }), active: view.showIssues, title: "検証で見つかった領域をハイライト", priority: 6 },
    { kind: "btn", key: "bridges", icon: "⊟", label: "ブリッジ", onClick: () => store.setView({ showBridges: !view.showBridges }), active: view.showBridges, title: "ブリッジを表示", priority: 6 },
    { kind: "sep", key: "s4" },
    { kind: "btn", key: "zoomin", icon: "⊕", label: "拡大", onClick: () => canvasApi?.zoomBy(1.25), priority: 8 },
    { kind: "btn", key: "zoomout", icon: "⊖", label: "縮小", onClick: () => canvasApi?.zoomBy(1 / 1.25), priority: 8 },
    { kind: "btn", key: "fit", icon: "⛶", label: "全体", onClick: () => canvasApi?.fit(), title: "全体表示 (F)", priority: 6 },
    { kind: "sep", key: "s5" },
    { kind: "btn", key: "share", icon: "⇪", label: "共有URL", onClick: () => openDialog("share"), priority: 7 },
    { kind: "btn", key: "help", icon: "?", label: "ヘルプ", onClick: () => openDialog("help"), priority: 5 },
  ];

  const btnW = mobile ? BTN_W_MOBILE : BTN_W_DESKTOP;
  const buttons = items.filter((i): i is Extract<Item, { kind: "btn" }> => i.kind === "btn");
  let visible = new Set(buttons.map((b) => b.key));
  if (width > 0) {
    const available = width - fixedW - btnW /* ⋯ button */ - 40;
    const sorted = [...buttons].sort((a, b) => a.priority - b.priority);
    let used = 0;
    visible = new Set<string>();
    for (const b of sorted) {
      if (used + btnW > available) break;
      used += btnW;
      visible.add(b.key);
    }
    // Separators only count when they end up between visible groups; leave slack for them.
    const seps = items.filter((i, idx) => i.kind === "sep" && items.slice(0, idx).some((x) => x.kind === "btn" && visible.has(x.key)) && items.slice(idx + 1).some((x) => x.kind === "btn" && visible.has(x.key))).length;
    while (used + seps * SEP_W > available && visible.size > 0) {
      const drop = [...sorted].reverse().find((b) => visible.has(b.key));
      if (!drop) break;
      visible.delete(drop.key);
      used -= btnW;
    }
  }
  const overflow = buttons.filter((b) => !visible.has(b.key));

  const rendered: React.ReactNode[] = [];
  let pendingSep = false;
  let any = false;
  for (const it of items) {
    if (it.kind === "sep") {
      if (any) pendingSep = true;
      continue;
    }
    if (!visible.has(it.key)) continue;
    if (pendingSep) rendered.push(<Sep key={`sep-${it.key}`} />);
    pendingSep = false;
    any = true;
    rendered.push(<Btn key={it.key} icon={it.icon} label={it.label} onClick={it.onClick} active={it.active} disabled={it.disabled} title={it.title} />);
  }

  return (
    <header ref={headerRef} className="toolbar relative flex h-[64px] shrink-0 items-center gap-0.5 border-b border-line bg-panel px-2">
      <div ref={fixedRef} className="mr-1 flex shrink-0 items-center gap-2 pl-1 md:mr-3">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
        <div className="hidden leading-tight md:block">
          <div className="text-[14px] font-semibold tracking-wide">MandalaFab</div>
          <div className="text-[10px] text-ink-3">曼荼羅ステンシル CAD · v{APP_VERSION}</div>
        </div>
        <Sep />
      </div>
      {rendered}
      {overflow.length > 0 && (
        <div className="relative shrink-0" data-more-menu>
          <Btn icon="⋯" label="その他" onClick={() => setMoreOpen((o) => !o)} active={moreOpen} title="表示しきれない操作" />
          {moreOpen && (
            <div className="absolute left-0 top-full z-40 mt-1 min-w-[200px] rounded-md border border-line bg-paper py-1 text-[12px] shadow-lg" role="menu" data-testid="toolbar-overflow">
              {overflow.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  role="menuitem"
                  disabled={b.disabled}
                  className={`flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-select-bg hover:text-select disabled:opacity-40 ${b.active ? "text-select" : ""}`}
                  title={b.title}
                  onClick={() => {
                    setMoreOpen(false);
                    b.onClick();
                  }}
                >
                  <span className="w-5 text-center text-[15px]">{b.icon}</span>
                  <span className="flex-1">{b.label}</span>
                  {b.active && <span className="text-[10px]">ON</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex-1" />
      <div ref={rightRef} className="flex shrink-0 items-center">
        <div className="mr-2 hidden max-w-[200px] truncate text-[12px] text-ink-2 lg:block" title={name}>
          {name}
        </div>
        <Btn icon="⬢" label="SVG出力" onClick={() => actionExportSVG(store, render.data)} primary title="レーザー加工用SVGを書き出す (⌘⇧S)" />
      </div>
    </header>
  );
}
