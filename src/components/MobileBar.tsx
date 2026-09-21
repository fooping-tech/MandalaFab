import type { CanvasApi } from "../app/App";
import { findElementDeep } from "../editor/commands";
import { useEditor, type EditorStore } from "../editor/store";

export type MobilePanel = "tree" | "inspector" | null;

function Tab({ icon, label, active, badge, onClick }: { icon: string; label: string; active?: boolean; badge?: string; onClick: () => void }) {
  return (
    <button type="button" className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] ${active ? "text-select" : "text-ink-2"}`} onClick={onClick}>
      <span className="text-[18px] leading-none" aria-hidden="true">
        {icon}
      </span>
      <span className="max-w-full truncate px-1">{badge ?? label}</span>
    </button>
  );
}

/**
 * Bottom bar of the phone layout: opens the tree / inspector as a sheet over the
 * canvas and exposes the view toggles that live in the toolbar on desktop.
 */
export function MobileBar({ store, panel, setPanel, canvasApi }: { store: EditorStore; panel: MobilePanel; setPanel: (p: MobilePanel) => void; canvasApi: CanvasApi | null }) {
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project);
  const view = useEditor((s) => s.view);
  let selLabel: string | undefined;
  if (selection.kind === "element") {
    const ring = project.rings.find((r) => r.id === selection.ringId);
    const el = ring ? findElementDeep(ring.elements, selection.elementId) : undefined;
    selLabel = el ? `${el.name ?? el.type}` : undefined;
  } else if (selection.kind === "ring") selLabel = project.rings.find((r) => r.id === selection.ringId)?.name;
  else if (selection.kind === "multi") selLabel = `${selection.items.length} 要素`;
  else if (selection.kind === "center") selLabel = "Center";
  const toggle = (p: Exclude<MobilePanel, null>): void => setPanel(panel === p ? null : p);
  const modeLabel = view.mode === "design" ? "デザイン" : view.mode === "material" ? "材料" : view.mode === "cutout" ? "抜き" : "プレビュー";
  return (
    <nav className="mobile-bar flex shrink-0 items-stretch border-t border-line bg-panel" aria-label="モバイル操作">
      <Tab icon="☰" label="ツリー" active={panel === "tree"} onClick={() => toggle("tree")} />
      <Tab icon="⚙" label="編集" active={panel === "inspector"} badge={selLabel} onClick={() => toggle("inspector")} />
      <Tab
        icon={view.mode === "preview" ? "✂" : view.mode === "design" ? "◌" : view.mode === "material" ? "▢" : "■"}
        label={modeLabel}
        onClick={() => {
          const order = ["design", "material", "cutout"] as const;
          const i = order.indexOf(view.mode as (typeof order)[number]);
          store.setView({ mode: order[(i < 0 ? 0 : i + 1) % order.length]! });
        }}
      />
      <Tab icon="✂" label="プレビュー" active={view.mode === "preview"} onClick={() => store.togglePreview()} />
      <Tab icon="⛶" label="全体" onClick={() => canvasApi?.fit()} />
    </nav>
  );
}
