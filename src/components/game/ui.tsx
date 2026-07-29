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
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[28px] border-4 border-white bg-panel shadow-2xl ${
          wide ? "max-w-4xl" : "max-w-lg"
        }`}
      >
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-200 via-pink-200 to-sky-200 px-4 py-3">
          <div className="pointer-events-none absolute -right-4 -top-6 h-16 w-16 rounded-full bg-white/25 blur-lg" />
          <div className="relative flex items-center justify-between">
            <h3 className="font-extrabold text-white drop-shadow-sm">{title}</h3>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full border-2 border-white/70 bg-white/20 font-bold text-white hover:bg-white/40"
            >
              ✕
            </button>
          </div>
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
          className="pointer-events-auto flex items-center gap-3 rounded-full border-2 border-white bg-panel/95 px-4 py-3 text-sm text-stone-600 shadow-xl backdrop-blur"
        >
          <span className="flex-1">{t.text}</span>
          {t.actionLabel && (
            <button
              onClick={() => onAction(t)}
              className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-white hover:brightness-110"
            >
              {t.actionLabel}
            </button>
          )}
          <button
            onClick={() => onDismiss(t.id)}
            className="shrink-0 text-stone-400 hover:text-stone-700"
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
          className="race-toast rounded-lg border border-stone-200 bg-panel/90 px-3 py-1.5 text-xs font-medium text-stone-600 shadow-lg backdrop-blur"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
