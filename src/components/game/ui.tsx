"use client";

import { useEffect } from "react";

// 공용 모달 셸 — ESC 로 닫힘.
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-panel shadow-2xl ${
          wide ? "max-w-4xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h3 className="font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function ToastStack({
  toasts,
  onAction,
  onDismiss,
}: {
  toasts: ToastItem[];
  onAction: (t: ToastItem) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-panel/95 px-4 py-3 text-sm text-slate-100 shadow-xl backdrop-blur"
        >
          <span className="flex-1">{t.text}</span>
          {t.actionLabel && (
            <button
              onClick={() => onAction(t)}
              className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:brightness-110"
            >
              {t.actionLabel}
            </button>
          )}
          <button
            onClick={() => onDismiss(t.id)}
            className="shrink-0 text-slate-500 hover:text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export interface ToastItem {
  id: string;
  text: string;
  actionLabel?: string;
  action?: () => void;
}

// 레이싱 전용 알림 — 우측 하단에서 하나씩 위로 올라온다(레이스 방해 최소화).
export function RaceToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="pointer-events-none absolute bottom-24 right-3 z-40 flex w-auto max-w-[260px] flex-col-reverse items-end gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="race-toast rounded-lg border border-white/10 bg-panel/90 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-lg backdrop-blur"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
