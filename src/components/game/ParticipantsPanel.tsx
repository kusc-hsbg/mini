"use client";

// 참가자 패널 — 상태 확인, 손 흔들기, 이동/따라가기, DM, 차단, 모더레이션.
import { useState } from "react";
import { STATUS_META } from "@/lib/game/constants";
import type { PlayerState } from "@/lib/game/types";
import type { RoomJob } from "@/lib/realtime/protocol";

export default function ParticipantsPanel({
  players,
  selfId,
  isMod,
  blocked,
  followId,
  onWave,
  onWalkTo,
  onFollow,
  onDm,
  onBlockToggle,
  onAddFriend,
  canFriend,
  onKick,
  onBan,
  roomJobs,
  instructorOf,
  instructorParty,
  canManageJobs,
  isInstructor,
  onSetJob,
  onToggleInstructorParty,
  onClose,
}: {
  players: PlayerState[];
  selfId: string;
  isMod: boolean;
  blocked: Set<string>;
  followId: string | null;
  onWave: (id: string) => void;
  onWalkTo: (id: string) => void;
  onFollow: (id: string | null) => void;
  onDm: (id: string) => void;
  onBlockToggle: (id: string, name: string) => void;
  onAddFriend: (id: string, name: string) => void;
  canFriend: boolean;
  onKick: (id: string) => void;
  onBan: (id: string, name: string) => void;
  roomJobs: Record<string, RoomJob>;
  instructorOf: Record<string, string | null>;
  instructorParty: string[];
  canManageJobs: boolean;
  isInstructor: boolean;
  onSetJob: (id: string, job: RoomJob) => void;
  onToggleInstructorParty: (id: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...players].sort((a, b) =>
    a.id === selfId ? -1 : b.id === selfId ? 1 : a.name.localeCompare(b.name)
  );

  return (
    <div className="flex h-full w-72 flex-col border-l border-white/10 bg-panel/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="font-semibold text-white">👥 참가자 ({players.length})</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {sorted.map((p) => {
          const isSelf = p.id === selfId;
          const meta = STATUS_META[p.status] ?? STATUS_META.available;
          const expanded = open === p.id;
          const job = roomJobs[p.id] ?? "user";
          const instructorName = instructorOf[p.id]
            ? players.find((x) => x.id === instructorOf[p.id])?.name
            : null;
          const inMyParty = instructorParty.includes(p.id);
          return (
            <div key={p.id} className="mb-1 rounded-xl bg-panel2/60">
              <button
                onClick={() => setOpen(expanded ? null : p.id)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/5"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                  title={meta.label}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">
                    {p.name}
                    {isSelf && <span className="text-slate-500"> (나)</span>}
                    {p.guest && <span className="ml-1 text-xs text-amber-300/70">게스트</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {p.statusMsg || meta.label}
                    {p.areaId && ` · 📍영역`}
                    {p.spotlight && " · 🎤"}
                    {job === "room-admin" && " · 방관리자"}
                    {job === "instructor" && " · 강사"}
                    {instructorName && ` · 담당 ${instructorName}`}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1 text-xs">
                  {p.hand && "✋"}
                  {p.sitting && "🪑"}
                  {p.onBike && "🏎️"}
                </span>
              </button>

              {expanded && !isSelf && (
                <div className="flex flex-wrap gap-1 px-3 pb-2">
                  <Btn onClick={() => onWave(p.id)}>👋 흔들기</Btn>
                  <Btn onClick={() => onWalkTo(p.id)}>🚶 이동</Btn>
                  <Btn
                    onClick={() => onFollow(followId === p.id ? null : p.id)}
                    active={followId === p.id}
                  >
                    {followId === p.id ? "팔로우 중지" : "🔗 따라가기"}
                  </Btn>
                  <Btn onClick={() => onDm(p.id)}>✉️ DM</Btn>
                  {canFriend && !p.guest && (
                    <Btn onClick={() => onAddFriend(p.id, p.name)}>➕ 친구</Btn>
                  )}
                  {isInstructor && (
                    <Btn
                      onClick={() => onToggleInstructorParty(p.id)}
                      active={inMyParty}
                    >
                      {inMyParty ? "파티 해제" : "강사 파티"}
                    </Btn>
                  )}
                  <Btn onClick={() => onBlockToggle(p.id, p.name)} danger={!blocked.has(p.id)}>
                    {blocked.has(p.id) ? "차단 해제" : "🚫 차단"}
                  </Btn>
                  {canManageJobs && (
                    <>
                      <Btn onClick={() => onSetJob(p.id, "room-admin")} active={job === "room-admin"}>
                        방관리자
                      </Btn>
                      <Btn onClick={() => onSetJob(p.id, "instructor")} active={job === "instructor"}>
                        강사
                      </Btn>
                      <Btn onClick={() => onSetJob(p.id, "user")} active={job === "user"}>
                        일반
                      </Btn>
                    </>
                  )}
                  {isMod && (
                    <>
                      <Btn onClick={() => onKick(p.id)} danger>👢 킥</Btn>
                      <Btn onClick={() => onBan(p.id, p.name)} danger>⛔ 밴</Btn>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  danger,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2 py-1 text-xs transition ${
        active
          ? "bg-accent text-white"
          : danger
            ? "bg-red-500/10 text-red-300 hover:bg-red-500/20"
            : "bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
