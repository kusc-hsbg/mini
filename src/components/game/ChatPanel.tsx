"use client";

// 채팅 패널 — 방 전체 / 현재 영역(그룹) / DM 탭.
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, PlayerState } from "@/lib/game/types";

export type ChatTab = { kind: "room" } | { kind: "area" } | { kind: "dm"; to: string };

export default function ChatPanel({
  messages,
  players,
  selfId,
  myAreaId,
  areaName,
  tab,
  onTab,
  onSend,
  unreadDms,
  onClose,
}: {
  messages: ChatMessage[];
  players: PlayerState[];
  selfId: string;
  myAreaId: string | null;
  areaName: string | null;
  tab: ChatTab;
  onTab: (t: ChatTab) => void;
  onSend: (tab: ChatTab, text: string) => void;
  unreadDms: Set<string>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const dmPartners = players.filter((p) => p.id !== selfId);

  const visible = messages.filter((m) => {
    if (tab.kind === "room") return m.scope === "room";
    if (tab.kind === "area") return m.scope === "area" && m.areaId === myAreaId;
    return (
      m.scope === "dm" &&
      ((m.from === tab.to && m.to === selfId) || (m.from === selfId && m.to === tab.to))
    );
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [visible.length, tab]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(tab, t);
    setText("");
  }

  return (
    <div className="flex h-full w-80 max-w-[92vw] flex-col overflow-hidden rounded-[28px] border-4 border-white bg-panel/95 shadow-2xl backdrop-blur">
      <div className="relative overflow-hidden bg-gradient-to-r from-sky-300 via-cyan-200 to-emerald-200 px-4 py-3">
        <div className="pointer-events-none absolute -right-4 -top-6 h-16 w-16 rounded-full bg-white/25 blur-lg" />
        <div className="relative flex items-center justify-between">
          <h3 className="font-extrabold text-white drop-shadow-sm">💬 채팅</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full border-2 border-white/70 bg-white/20 font-bold text-white hover:bg-white/40"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex flex-wrap gap-1.5 border-b-2 border-stone-100 p-2.5">
        <TabBtn active={tab.kind === "room"} onClick={() => onTab({ kind: "room" })}>
          🌐 전체
        </TabBtn>
        <TabBtn
          active={tab.kind === "area"}
          onClick={() => onTab({ kind: "area" })}
          disabled={!myAreaId}
        >
          📍 {areaName ?? "영역"}
        </TabBtn>
        {dmPartners.slice(0, 8).map((p) => (
          <TabBtn
            key={p.id}
            active={tab.kind === "dm" && tab.to === p.id}
            onClick={() => onTab({ kind: "dm", to: p.id })}
          >
            {unreadDms.has(p.id) && <span className="mr-0.5 text-pink-400">●</span>}
            ✉️ {p.name.slice(0, 6)}
          </TabBtn>
        ))}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {visible.length === 0 && (
          <p className="py-6 text-center text-xs text-stone-400">
            {tab.kind === "dm"
              ? "1:1 대화를 시작해보세요."
              : tab.kind === "area"
                ? "이 영역 안의 사람들에게만 보이는 채팅입니다."
                : "아직 메시지가 없습니다."}
          </p>
        )}
        {visible.map((m) => (
          <div key={m.id} className={`flex ${m.from === selfId ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                m.from === selfId
                  ? "rounded-tr-sm bg-gradient-to-br from-pink-200 to-amber-100 text-stone-700"
                  : "rounded-tl-sm bg-white/90 text-stone-600"
              }`}
            >
              {m.from !== selfId && (
                <div className="text-[10px] font-bold text-sky-500">{m.fromName}</div>
              )}
              <div className="whitespace-pre-wrap break-words">{m.text}</div>
              <div className="mt-0.5 text-right text-[9px] text-stone-400">
                {new Date(m.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t-2 border-stone-100 p-2.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder={
            tab.kind === "room" ? "모두에게 메시지" : tab.kind === "area" ? "영역 채팅" : "DM 보내기"
          }
          className="input rounded-full bg-panel2 text-sm"
        />
        <button type="submit" className="btn-primary shrink-0 px-4 text-sm">전송</button>
      </form>
    </div>
  );
}

function TabBtn({
  children,
  active,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${
        active ? "bg-accent text-white shadow-sm" : "bg-panel2 text-stone-500 hover:bg-stone-100"
      }`}
    >
      {children}
    </button>
  );
}
