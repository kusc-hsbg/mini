"use client";

// 친구 패널 (feature #6) — 요청 수락/거절, 친구 목록, DM, 위치 따라가기, 삭제.
import { useCallback, useEffect, useState } from "react";
import {
  getFriends,
  respondFriendRequest,
  removeFriend,
  type FriendEntry,
} from "@/app/actions";
import type { PlayerState } from "@/lib/game/types";

export default function FriendsPanel({
  players,
  onDm,
  onWalkTo,
  onClose,
}: {
  players: PlayerState[];
  onDm: (id: string) => void;
  onWalkTo: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await getFriends();
    if (!("error" in res)) setFriends(res.friends);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const online = new Set(players.map((p) => p.id));
  const incoming = friends.filter((f) => f.status === "incoming");
  const accepted = friends.filter((f) => f.status === "accepted");
  const outgoing = friends.filter((f) => f.status === "outgoing");

  async function respond(rowId: string, accept: boolean) {
    await respondFriendRequest(rowId, accept);
    load();
  }
  async function remove(rowId: string) {
    await removeFriend(rowId);
    load();
  }

  return (
    <div className="flex h-full w-72 flex-col border-l border-white/10 bg-panel/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="font-semibold text-white">🤝 친구 ({accepted.length})</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 text-sm">
        {loading && <p className="p-3 text-slate-500">불러오는 중...</p>}

        {!loading && incoming.length > 0 && (
          <Section title={`받은 요청 (${incoming.length})`}>
            {incoming.map((f) => (
              <div key={f.rowId} className="mb-1 flex items-center gap-2 rounded-xl bg-panel2/60 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-slate-100">{f.name}</span>
                <Btn onClick={() => respond(f.rowId, true)} accent>수락</Btn>
                <Btn onClick={() => respond(f.rowId, false)} danger>거절</Btn>
              </div>
            ))}
          </Section>
        )}

        {!loading && (
          <Section title={`친구 (${accepted.length})`}>
            {accepted.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">
                아직 친구가 없어요. 참가자 목록에서 <b>➕ 친구</b>로 요청을 보내보세요.
              </p>
            )}
            {accepted.map((f) => {
              const here = online.has(f.id);
              return (
                <div key={f.rowId} className="mb-1 rounded-xl bg-panel2/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${here ? "bg-emerald-400" : "bg-slate-600"}`} />
                    <span className="min-w-0 flex-1 truncate text-slate-100">{f.name}</span>
                    <span className="text-[10px] text-slate-500">{here ? "이 방에 있음" : "오프라인/다른 방"}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Btn onClick={() => onDm(f.id)}>✉️ 메시지</Btn>
                    <Btn onClick={() => onWalkTo(f.id, f.name)} disabled={!here}>📍 따라가기</Btn>
                    <Btn onClick={() => remove(f.rowId)} danger>삭제</Btn>
                  </div>
                </div>
              );
            })}
          </Section>
        )}

        {!loading && outgoing.length > 0 && (
          <Section title={`보낸 요청 (${outgoing.length})`}>
            {outgoing.map((f) => (
              <div key={f.rowId} className="mb-1 flex items-center gap-2 rounded-xl bg-panel2/40 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-slate-400">{f.name}</span>
                <span className="text-[10px] text-slate-500">대기중</span>
                <Btn onClick={() => remove(f.rowId)} danger>취소</Btn>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="px-2 pb-1 text-xs font-medium text-slate-400">{title}</div>
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  danger,
  accent,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-2 py-1 text-xs transition disabled:opacity-40 ${
        accent
          ? "bg-accent text-white hover:brightness-110"
          : danger
            ? "bg-red-500/10 text-red-300 hover:bg-red-500/20"
            : "bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
