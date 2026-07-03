"use client";

// 하단 툴바 — 카메라 / 상태 / 이모지 / 손들기 / 줌 / 패널 토글.
import { useState } from "react";
import { EMOJIS, STATUS_META } from "@/lib/game/constants";
import type { UserStatus } from "@/lib/game/types";

export default function Toolbar(props: {
  multiplayer: boolean;
  camOn: boolean;
  hand: boolean;
  status: UserStatus;
  statusMsg: string;
  soundOn: boolean;
  canEdit: boolean;
  editorOpen: boolean;
  onCam: () => void;
  onHand: () => void;
  onStatus: (s: UserStatus, msg: string) => void;
  onEmoji: (emoji: string) => void;
  onSound: () => void;
  onZoom: (delta: number) => void;
  onMinimap: () => void;
  onEditor: () => void;
  onPanel: (p: "participants" | "chat" | "meetings") => void;
  unread: number;
  noteCount: number;
  onNotes: () => void;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [msg, setMsg] = useState(props.statusMsg);

  const meta = STATUS_META[props.status];

  return (
    <div className="pointer-events-auto relative flex items-center gap-1.5 rounded-2xl bg-panel/85 p-2 backdrop-blur">
      {/* 미디어 */}
      {props.multiplayer && (
        <>
          <IconBtn on={props.camOn} onClick={props.onCam} title="카메라 (근접 영상 대화)">
            {props.camOn ? "📷" : "📵"}
          </IconBtn>
          <IconBtn on={props.hand} onClick={props.onHand} title="손들기">
            ✋
          </IconBtn>
          <Divider />
        </>
      )}

      {/* 상태 */}
      <div className="relative">
        <button
          onClick={() => setStatusOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-panel2 px-2.5 py-2 text-sm text-slate-200 hover:bg-white/10"
          title="상태 변경"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
          <span className="hidden sm:inline">{meta.label}</span>
        </button>
        {statusOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-white/10 bg-panel p-2 shadow-xl">
            {(Object.keys(STATUS_META) as UserStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  props.onStatus(s, msg);
                  setStatusOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/10 ${
                  props.status === s ? "text-white" : "text-slate-300"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_META[s].color }}
                />
                {STATUS_META[s].label}
                {s === "dnd" && <span className="text-[10px] text-slate-500">(대화 연결 안 됨)</span>}
              </button>
            ))}
            <input
              className="input mt-1 bg-panel2 text-xs"
              placeholder="상태 메시지 (선택)"
              value={msg}
              maxLength={60}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  props.onStatus(props.status, msg);
                  setStatusOpen(false);
                }
              }}
            />
          </div>
        )}
      </div>

      {/* 이모지 */}
      <div className="relative">
        <IconBtn onClick={() => setEmojiOpen((v) => !v)} title="이모지 반응 (1~0 단축키)">
          😀
        </IconBtn>
        {emojiOpen && (
          <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 gap-1 rounded-xl border border-white/10 bg-panel p-1.5 shadow-xl">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  props.onEmoji(e);
                  setEmojiOpen(false);
                }}
                className="rounded-lg p-1 text-xl transition hover:scale-125 hover:bg-white/10"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* 보기 */}
      <IconBtn on={props.soundOn} onClick={props.onSound} title="주변 사운드 (스피커 오브젝트)">
        {props.soundOn ? "🔊" : "🔈"}
      </IconBtn>
      <IconBtn onClick={() => props.onZoom(-0.25)} title="줌 아웃">➖</IconBtn>
      <IconBtn onClick={() => props.onZoom(0.25)} title="줌 인">➕</IconBtn>
      <IconBtn onClick={props.onMinimap} title="미니맵 토글 (M)">🗺️</IconBtn>

      <Divider />

      {/* 패널 */}
      <IconBtn onClick={() => props.onPanel("participants")} title="참가자">👥</IconBtn>
      <div className="relative">
        <IconBtn onClick={() => props.onPanel("chat")} title="채팅">💬</IconBtn>
        {props.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {props.unread > 9 ? "9+" : props.unread}
          </span>
        )}
      </div>
      <IconBtn onClick={() => props.onPanel("meetings")} title="회의 일정">📅</IconBtn>
      {props.noteCount > 0 && (
        <div className="relative">
          <IconBtn onClick={props.onNotes} title="데스크 쪽지함">💌</IconBtn>
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent2 px-1 text-[9px] font-bold text-ink">
            {props.noteCount}
          </span>
        </div>
      )}
      {props.canEdit && (
        <IconBtn on={props.editorOpen} onClick={props.onEditor} title="맵 에디터 (빌드 도구)">
          🛠️
        </IconBtn>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  on,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  on?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-9 w-9 place-items-center rounded-xl text-lg transition ${
        on ? "bg-accent/30 ring-1 ring-accent" : "bg-panel2 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-6 w-px bg-white/10" />;
}
