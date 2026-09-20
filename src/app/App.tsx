import { useEffect, useState } from "react";
import { Toolbar } from "../components/Toolbar";
import { RingTree } from "../components/RingTree";
import { Canvas } from "../components/Canvas";
import { Inspector } from "../components/Inspector";
import { StatusBar } from "../components/StatusBar";
import { GenerateDialog } from "../components/dialogs/GenerateDialog";
import { PresetDialog } from "../components/dialogs/PresetDialog";
import { HelpDialog } from "../components/dialogs/HelpDialog";
import { ShareDialog } from "../components/dialogs/ShareDialog";
import { actionAddRing, actionDeleteSelected, actionExportSVG, actionOpen, actionSaveJSON } from "../editor/actions";
import { saveLocal } from "../editor/persist";
import { RenderContext } from "../editor/render-context";
import { useRender } from "../editor/use-render";
import { useEditor, type EditorStore, type ViewMode } from "../editor/store";

export type DialogName = "generate" | "presets" | "help" | "share" | null;

export interface CanvasApi {
  fit(): void;
  zoomBy(f: number): void;
}

const VIEW_CYCLE: ViewMode[] = ["design", "material", "cutout"];

export function App({ store }: { store: EditorStore }) {
  const project = useEditor((s) => s.project);
  const render = useRender(project);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [canvasApi, setCanvasApi] = useState<CanvasApi | null>(null);

  useEffect(() => saveLocal(project), [project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) actionExportSVG(store, render.data);
        else actionSaveJSON(store);
        return;
      }
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void actionOpen(store);
        return;
      }
      if (typing) return;
      if (e.key === "Escape") {
        store.select({ kind: "project" });
        setDialog(null);
      } else if (e.key === "Delete" || e.key === "Backspace") actionDeleteSelected(store);
      else if (e.key === "n" && !mod) actionAddRing(store);
      else if (e.key === "f") canvasApi?.fit();
      else if (e.key === "+" || e.key === "=") canvasApi?.zoomBy(1.25);
      else if (e.key === "-") canvasApi?.zoomBy(1 / 1.25);
      else if (e.key === "g") store.setView({ grid: !store.getState().view.grid });
      else if (e.key === "s") {
        const v = store.getState().view;
        store.setView({ mode: VIEW_CYCLE[(VIEW_CYCLE.indexOf(v.mode) + 1) % VIEW_CYCLE.length]! });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, render.data, canvasApi]);

  return (
    <RenderContext.Provider value={render}>
      <div className="flex h-full flex-col overflow-hidden">
        <Toolbar store={store} openDialog={setDialog} canvasApi={canvasApi} />
        <main className="grid min-h-0 flex-1 grid-cols-[260px_minmax(400px,1fr)_330px]">
          <RingTree store={store} />
          <Canvas store={store} onApi={setCanvasApi} />
          <Inspector store={store} />
        </main>
        <StatusBar store={store} />
      </div>
      <GenerateDialog store={store} open={dialog === "generate"} onClose={() => setDialog(null)} />
      <PresetDialog store={store} open={dialog === "presets"} onClose={() => setDialog(null)} />
      <HelpDialog open={dialog === "help"} onClose={() => setDialog(null)} />
      <ShareDialog store={store} open={dialog === "share"} onClose={() => setDialog(null)} />
    </RenderContext.Provider>
  );
}
