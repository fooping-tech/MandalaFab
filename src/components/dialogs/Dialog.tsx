import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({ open, onClose, title, children, width = 560 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} style={{ width: `min(${width}px, calc(100vw - 16px))` }}>
      <div className="fadein" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <button type="button" className="text-ink-3 hover:text-ink" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="max-h-[calc(100dvh-90px)] overflow-auto px-4 py-3 sm:px-5 sm:py-4">{children}</div>
      </div>
    </dialog>
  );
}
