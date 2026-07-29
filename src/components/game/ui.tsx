"use client";

import { useEffect } from "react";

// ─────────────────────────────────────────────────────────────
// 공용 디자인 시스템 — 동글동글 유아틱 테마.
// 모든 패널/모달이 이 프리미티브를 통해 같은 외형을 공유한다.
// ─────────────────────────────────────────────────────────────

// 헤더 배너 색조 (파스텔 그라데이션)
export type ShellTone = "sky" | "pink" | "grape" | "peach" | "mint" | "rainbow";
const TONE: Record<ShellTone, string> = {
  sky: "from-sky-300 via-cyan-200 to-teal-200",
  pink: "from-pink-300 via-rose-200 to-orange-200",
  grape: "from-violet-300 via-purple-200 to-fuchsia-200",
  peach: "from-amber-200 via-orange-200 to-rose-200",
  mint: "from-emerald-300 via-teal-200 to-cyan-200",
  rainbow: "from-amber-200 via-pink-200 to-sky-200",
};

// 떠 있는 둥근 패널 셸 — 헤더(이모지+제목) + 스크롤 본문.
export function PanelShell({
  emoji,
  title,
  tone = "rainbow",
  width = "w-80",
  onClose,
  footer,
  children,
}: {
  emoji: string;
  title: string;
  tone?: ShellTone;
  width?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex h-full ${width} max-w-[92vw] flex-col overflow-hidden rounded-[34px] border-[5px] border-white bg-panel/95 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.35)] backdrop-blur`}
    >
      <div className={`relative overflow-hidden bg-gradient-to-r ${TONE[tone]} px-4 py-3.5`}>
        <div className="pointer-events-none absolute -right-3 -top-7 h-16 w-16 rounded-full bg-white/30 blur-lg" />
        <div className="pointer-events-none absolute -left-5 bottom-0 h-12 w-12 rounded-full bg-white/20 blur-md" />
        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/70 text-lg shadow-sm">
            {emoji}
          </span>
          <h3 className="flex-1 truncate text-lg font-black text-white drop-shadow-sm">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-[3px] border-white/70 bg-white/25 text-lg font-black text-white transition hover:scale-110 hover:bg-white/45"
            title="닫기"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
      {footer && <div className="border-t-2 border-dashed border-stone-200/70 p-3">{footer}</div>}
    </div>
  );
}

// 둥근 알약 버튼
export function Pill({
  children,
  onClick,
  tone = "plain",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "plain" | "active" | "danger" | "accent";
  disabled?: boolean;
  className?: string;
}) {
  const styles = {
    plain: "bg-white text-stone-500 shadow-sm hover:bg-stone-50",
    active: "bg-accent text-white shadow-md",
    danger: "bg-red-100 text-red-500 hover:bg-red-200",
    accent: "bg-gradient-to-r from-pink-300 to-amber-300 text-white shadow-md hover:brightness-105",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border-2 border-white px-3 py-1.5 text-xs font-bold transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

// 본문 카드 (목록 행)
export function Bubble({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl border-2 border-white bg-white/80 p-3 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

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
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[34px] border-[5px] border-white bg-panel shadow-2xl ${
          wide ? "max-w-4xl" : "max-w-lg"
        }`}
      >
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-200 via-pink-200 to-sky-200 px-4 py-3.5">
          <div className="pointer-events-none absolute -right-4 -top-6 h-16 w-16 rounded-full bg-white/30 blur-lg" />
          <div className="relative flex items-center justify-between">
            <h3 className="text-lg font-black text-white drop-shadow-sm">{title}</h3>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full border-[3px] border-white/70 bg-white/25 text-lg font-black text-white transition hover:scale-110 hover:bg-white/45"
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
