"use client";

// 회의 예약 패널 — 내부 일정 시스템 + .ics 내보내기(Google/Outlook 캘린더 가져오기용).
import { useEffect, useMemo, useState, useTransition } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { createMeeting, deleteMeeting } from "@/app/actions";
import { downloadIcs } from "@/lib/ics";
import { resolveMap } from "@/lib/game/maps";
import type { MeetingRecord, RoomRecord } from "@/lib/game/types";

export default function MeetingsPanel({
  spaceId,
  rooms,
  currentRoomId,
  loggedIn,
  myId,
  myName,
  myDeskObjectId,
  onJoin,
  onClose,
}: {
  spaceId: string;
  rooms: RoomRecord[];
  currentRoomId: string;
  loggedIn: boolean;
  myId: string;
  myName: string;
  myDeskObjectId: string | null;
  onJoin: (m: MeetingRecord) => void;
  onClose: () => void;
}) {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();

  // 폼 상태
  const [title, setTitle] = useState("");
  const [roomId, setRoomId] = useState(currentRoomId);
  const [locKind, setLocKind] = useState<"area" | "desk" | "spawn">("area");
  const [locRef, setLocRef] = useState("");
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date(Date.now() + 30 * 60000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return toLocalInput(d);
  });
  const [duration, setDuration] = useState(30);

  const roomAreas = useMemo(() => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return [];
    return resolveMap(room.template_key, room.map_data).areas;
  }, [rooms, roomId]);

  async function load() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const since = new Date(Date.now() - 2 * 3600_000).toISOString();
    const { data } = await supabase
      .from("meetings")
      .select("*")
      .eq("space_id", spaceId)
      .gte("ends_at", since)
      .order("starts_at", { ascending: true })
      .limit(30);
    setMeetings((data as MeetingRecord[]) ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  function submit() {
    if (!title.trim()) return;
    const start = new Date(startsAt);
    const end = new Date(start.getTime() + duration * 60000);
    startTransition(async () => {
      const res = await createMeeting({
        spaceId,
        roomId,
        title: title.trim(),
        locationKind: locKind,
        locationRef: locKind === "area" ? locRef || roomAreas[0]?.id || null : locKind === "desk" ? myDeskObjectId : null,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        creatorName: myName,
      });
      if (!("error" in res)) {
        setShowForm(false);
        setTitle("");
        load();
      }
    });
  }

  const now = Date.now();

  return (
    <div className="flex h-full w-80 flex-col border-l border-white/10 bg-panel/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="font-semibold text-white">📅 회의 일정</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {meetings.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">예정된 회의가 없습니다.</p>
        )}
        {meetings.map((m) => {
          const active = new Date(m.starts_at).getTime() <= now && now <= new Date(m.ends_at).getTime();
          const room = rooms.find((r) => r.id === m.room_id);
          return (
            <div
              key={m.id}
              className={`rounded-xl border p-3 ${
                active ? "border-accent2/40 bg-accent2/5" : "border-white/5 bg-panel2"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-white">
                    {active && <span className="mr-1 text-accent2">●</span>}
                    {m.title}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {fmtRange(m.starts_at, m.ends_at)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {room?.name ?? "?"} ·{" "}
                    {m.location_kind === "area"
                      ? `영역 ${m.location_ref ?? ""}`
                      : m.location_kind === "desk"
                        ? "데스크"
                        : "스폰"}
                    {m.creator_name && ` · ${m.creator_name}`}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => onJoin(m)} className="btn-primary flex-1 py-1 text-xs">
                  {active ? "지금 참여" : "위치로 이동"}
                </button>
                <button
                  onClick={() =>
                    downloadIcs(m, `${window.location.origin}/s/${spaceId}/${m.room_id}`)
                  }
                  className="btn-ghost px-2 py-1 text-xs"
                  title="캘린더(.ics)로 내보내기 — Google/Outlook 가져오기"
                >
                  📆
                </button>
                {m.created_by === myId && (
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        await deleteMeeting(m.id);
                        load();
                      })
                    }
                    className="btn-ghost px-2 py-1 text-xs text-red-300"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/5 p-3">
        {!loggedIn ? (
          <p className="text-center text-xs text-slate-500">로그인하면 회의를 예약할 수 있습니다.</p>
        ) : !showForm ? (
          <button onClick={() => setShowForm(true)} className="btn-primary w-full text-sm">
            + 회의 예약
          </button>
        ) : (
          <div className="space-y-2">
            <input
              className="input bg-panel2 text-sm"
              placeholder="회의 제목"
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
            />
            <select
              className="input bg-panel2 text-sm"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              {(
                [
                  ["area", "회의 영역"],
                  ["desk", "내 데스크"],
                  ["spawn", "스폰 위치"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setLocKind(k)}
                  disabled={k === "desk" && !myDeskObjectId}
                  className={`flex-1 rounded-lg px-2 py-1 text-xs ${
                    locKind === k ? "bg-accent text-white" : "bg-panel2 text-slate-300"
                  } disabled:opacity-40`}
                >
                  {label}
                </button>
              ))}
            </div>
            {locKind === "area" && (
              <select
                className="input bg-panel2 text-sm"
                value={locRef}
                onChange={(e) => setLocRef(e.target.value)}
              >
                {roomAreas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <input
                type="datetime-local"
                className="input bg-panel2 text-sm"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
              <select
                className="input w-24 shrink-0 bg-panel2 text-sm"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {[15, 30, 45, 60, 90, 120].map((d) => (
                  <option key={d} value={d}>{d}분</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={submit} disabled={pending} className="btn-primary flex-1 text-sm">
                예약
              </button>
              <button onClick={() => setShowForm(false)} className="btn-ghost text-sm">
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtRange(a: string, b: string): string {
  const s = new Date(a);
  const e = new Date(b);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
  return `${s.toLocaleString("ko-KR", opts)} ~ ${e.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}
