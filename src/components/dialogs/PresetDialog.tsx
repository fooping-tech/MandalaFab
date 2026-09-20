import { useMemo } from "react";
import { actionLoadPreset } from "../../editor/actions";
import { computeStaged } from "../../editor/pipeline";
import type { EditorStore } from "../../editor/store";
import { loadPreset, PRESETS } from "../../presets";
import { Dialog } from "./Dialog";

function Thumb({ id }: { id: string }) {
  const data = useMemo(() => {
    const p = loadPreset(id);
    const r = computeStaged(p).stencil;
    return { path: r.finalPath, bridges: r.bridgePath, w: p.sheet.width, h: p.sheet.height, subpaths: r.counts.subpaths };
  }, [id]);
  return (
    <>
      <svg viewBox={`${-data.w / 2} ${-data.h / 2} ${data.w} ${data.h}`} className="h-40 w-full rounded bg-white">
        <path d={data.path} fillRule="evenodd" fill="#2b3a48" />
        {data.bridges && <path d={data.bridges} fill="#f6b26b" />}
      </svg>
      <div className="mt-0.5 text-right text-[9px] text-ink-3">{data.subpaths} paths</div>
    </>
  );
}

export function PresetDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="プリセット" width={760}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {open &&
          PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rounded-lg border border-line bg-panel p-2 text-left hover:border-select hover:bg-select-bg"
              onClick={() => {
                actionLoadPreset(store, p.id);
                onClose();
              }}
            >
              <Thumb id={p.id} />
              <div className="mt-1 text-[12px] font-medium">{p.label}</div>
              <div className="text-[10px] leading-snug text-ink-3">{p.description}</div>
            </button>
          ))}
      </div>
    </Dialog>
  );
}
