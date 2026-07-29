"use client";

// 채팅 패널 — 방 전체 / 현재 영역(그룹) / DM 탭.
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, PlayerState } from "@/lib/game/types";
import { PanelShell } from "./ui";

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
    <PanelShell
      emoji="💬"
      title="채팅"
      tone="sky"
      onClose={onClose}
      footer={
        <form onSubmit={submit} className="flex gap-2">
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
      }
    >
      {/* 탭 */}
      <div className="mb-2 flex flex-wrap gap-1.5">
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

      <div ref={listRef} className="max-h-full space-y-2">
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
              className={`max-w-[85%] rounded-3xl px-3.5 py-2 text-sm shadow-sm ${
                m.from === selfId
                  ? "rounded-br-md bg-gradient-to-br from-pink-200 to-amber-100 text-stone-700"
                  : "rounded-bl-md bg-white text-stone-600"
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
    </PanelShell>
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
      className={`rounded-full border-2 border-white px-3 py-1.5 text-xs font-bold transition hover:scale-105 disabled:opacity-40 ${
        active ? "bg-accent text-white shadow-md" : "bg-white text-stone-500 shadow-sm hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}
