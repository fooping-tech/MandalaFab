import { useEffect, useState } from "react";
import { actionShare } from "../../editor/actions";
import type { EditorStore } from "../../editor/store";
import { Dialog } from "./Dialog";

export function ShareDialog({ store, open, onClose }: { store: EditorStore; open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (open) void actionShare(store).then(setUrl);
  }, [open, store]);
  return (
    <Dialog open={open} onClose={onClose} title="共有URL">
      <p className="mb-2 text-[12px] text-ink-2">このURLにはプロジェクト全体（リング・設定）が含まれます。サーバーには何も送信されません。</p>
      <textarea readOnly className="field-input h-28 w-full resize-none font-mono text-[11px]" value={url} onFocus={(e) => e.target.select()} />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          className="rounded bg-accent px-3 py-1.5 text-[12px] text-white hover:bg-accent-2"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => store.notify("コピーしました。", "success"));
          }}
        >
          コピー
        </button>
      </div>
    </Dialog>
  );
}
