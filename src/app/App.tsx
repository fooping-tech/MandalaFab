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
import { ImportReferenceDialog } from "../components/dialogs/ImportReferenceDialog";
import { actionAddRing, actionDeleteSelected, actionExportSVG, actionOpen, actionSaveJSON } from "../editor/actions";
import { findElementDeep, updateElement, updateRing } from "../editor/commands";
import { saveLocal } from "../editor/persist";
import { RenderContext } from "../editor/render-context";
import { useRender } from "../editor/use-render";
import { useEditor, type EditorStore, type ViewMode } from "../editor/store";

export type DialogName = "generate" | "presets" | "parts" | "help" | "share" | "import" | null;

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
      // Nudge the selection: arrows move (0.5 mm, Shift 2 mm), [ ] rotate (5°, Shift 15°), < > scale (5 %).
      const sel = store.getState().selection;
      if (sel.kind === "element" || sel.kind === "ring") {
        const ring = store.getState().project.rings.find((r) => r.id === sel.ringId);
        const el = sel.kind === "element" && ring ? findElementDeep(ring.elements, sel.elementId) : undefined;
        const stepMm = e.shiftKey ? 2 : 0.5;
        const stepDeg = e.shiftKey ? 15 : 5;
        const r1 = (v: number): number => Math.round(v * 10) / 10;
        if (el && sel.kind === "element") {
          const move = (dx: number, dy: number): void => store.execute(updateElement(sel.ringId, sel.elementId, { x: r1(el.x + dx), y: r1(el.y + dy) }, "要素を移動"));
          if (e.key === "ArrowRight") return void (e.preventDefault(), move(stepMm, 0));
          if (e.key === "ArrowLeft") return void (e.preventDefault(), move(-stepMm, 0));
          if (e.key === "ArrowDown") return void (e.preventDefault(), move(0, stepMm));
          if (e.key === "ArrowUp") return void (e.preventDefault(), move(0, -stepMm));
          if (e.key === "[" || e.key === "{") return void store.execute(updateElement(sel.ringId, sel.elementId, { rotation: r1(((el.rotation - stepDeg + 540) % 360) - 180) }, "要素を回転"));
          if (e.key === "]" || e.key === "}") return void store.execute(updateElement(sel.ringId, sel.elementId, { rotation: r1(((el.rotation + stepDeg + 540) % 360) - 180) }, "要素を回転"));
          if (e.key === "<" || e.key === ",") return void store.execute(updateElement(sel.ringId, sel.elementId, { length: r1(Math.max(0.2, el.length * 0.95)), width: r1(Math.max(0.2, el.width * 0.95)) }, "縮小"));
          if (e.key === ">" || e.key === ".") return void store.execute(updateElement(sel.ringId, sel.elementId, { length: r1(el.length * 1.05), width: r1(el.width * 1.05) }, "拡大"));
        } else if (ring && sel.kind === "ring") {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") return void (e.preventDefault(), store.execute(updateRing(ring.id, { radius: r1(ring.radius + stepMm) }, "半径を変更")));
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") return void (e.preventDefault(), store.execute(updateRing(ring.id, { radius: r1(Math.max(0, ring.radius - stepMm)) }, "半径を変更")));
          if (e.key === "[" || e.key === "{") return void store.execute(updateRing(ring.id, { phase: r1(ring.phase - stepDeg) }, "位相を変更"));
          if (e.key === "]" || e.key === "}") return void store.execute(updateRing(ring.id, { phase: r1(ring.phase + stepDeg) }, "位相を変更"));
        }
      }
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
        const i = VIEW_CYCLE.indexOf(v.mode);
        store.setView({ mode: VIEW_CYCLE[(i < 0 ? 0 : i + 1) % VIEW_CYCLE.length]! });
      } else if (e.key === "p") store.togglePreview();
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
      <PresetDialog store={store} open={dialog === "presets" || dialog === "parts"} tab={dialog === "parts" ? "parts" : "builtin"} onClose={() => setDialog(null)} />
      <HelpDialog open={dialog === "help"} onClose={() => setDialog(null)} />
      <ShareDialog store={store} open={dialog === "share"} onClose={() => setDialog(null)} />
      {dialog === "import" && <ImportReferenceDialog store={store} onClose={() => setDialog(null)} />}
    </RenderContext.Provider>
  );
}
