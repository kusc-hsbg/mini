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
    <div className="flex h-full w-80 flex-col border-l border-white/10 bg-panel/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="font-semibold text-white">💬 채팅</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>

      {/* 탭 */}
      <div className="flex flex-wrap gap-1 border-b border-white/5 p-2">
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
            {unreadDms.has(p.id) && <span className="mr-0.5 text-accent2">●</span>}
            ✉️ {p.name.slice(0, 6)}
          </TabBtn>
        ))}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-auto p-3">
        {visible.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-500">
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
              className={`max-w-[85%] rounded-xl px-3 py-1.5 text-sm ${
                m.from === selfId ? "bg-accent/25 text-slate-100" : "bg-panel2 text-slate-200"
              }`}
            >
              {m.from !== selfId && (
                <div className="text-[10px] font-medium text-accent2">{m.fromName}</div>
              )}
              <div className="whitespace-pre-wrap break-words">{m.text}</div>
              <div className="mt-0.5 text-right text-[9px] text-slate-500">
                {new Date(m.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-white/5 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder={
            tab.kind === "room" ? "모두에게 메시지" : tab.kind === "area" ? "영역 채팅" : "DM 보내기"
          }
          className="input bg-panel2 text-sm"
        />
        <button type="submit" className="btn-primary shrink-0 px-3 text-sm">전송</button>
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
      className={`rounded-lg px-2 py-1 text-xs transition disabled:opacity-40 ${
        active ? "bg-accent text-white" : "bg-panel2 text-slate-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
