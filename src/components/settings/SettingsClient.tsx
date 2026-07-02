"use client";

// 스페이스 설정 — 일반/보안/멤버·역할/방 관리/밴/게스트 로그/삭제.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRoomInSpace,
  deleteRoomAction,
  deleteSpace,
  removeMember,
  renameRoom,
  setMemberRole,
  setSpacePassword,
  unbanTarget,
  updateSpaceSettings,
} from "@/app/actions";
import { MAP_LIST } from "@/lib/game/maps";
import type { RoomRecord, SpaceRecord, SpaceRole } from "@/lib/game/types";

export interface MemberRow {
  user_id: string;
  role: SpaceRole;
  display_name: string;
  is_owner: boolean;
}
export interface BanRow {
  id: string;
  target_key: string;
  target_name: string | null;
  reason: string | null;
  created_at: string;
}
export interface GuestLogRow {
  id: string;
  guest_name: string;
  approved_by: string | null;
  entered_at: string;
}

const ROLES: { key: SpaceRole; label: string; desc: string }[] = [
  { key: "admin", label: "Admin", desc: "전체 설정/멤버/권한 관리" },
  { key: "moderator", label: "Moderator", desc: "뮤트/킥/밴 + 맵 편집" },
  { key: "mapmaker", label: "Mapmaker", desc: "맵 편집" },
  { key: "member", label: "Member", desc: "일반 팀원" },
];

export default function SettingsClient({
  space,
  rooms,
  members,
  bans,
  guestLogs,
  myId,
}: {
  space: SpaceRecord;
  rooms: RoomRecord[];
  members: MemberRow[];
  bans: BanRow[];
  guestLogs: GuestLogRow[];
  myId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // 일반
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description ?? "");
  const [isPublic, setIsPublic] = useState(space.is_public);
  // 보안
  const [requireLogin, setRequireLogin] = useState(space.require_login);
  const [guestCheckin, setGuestCheckin] = useState(space.guest_checkin);
  const [domains, setDomains] = useState((space.allowed_domains ?? []).join(", "));
  const [password, setPassword] = useState("");
  // 방
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomTemplate, setNewRoomTemplate] = useState(MAP_LIST[0].key);

  function run(fn: () => Promise<unknown>, success: string) {
    setMsg(null);
    startTransition(async () => {
      const res = (await fn()) as { error?: string };
      if (res?.error) setMsg(`❌ ${res.error}`);
      else {
        setMsg(`✅ ${success}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-lg bg-panel2 px-4 py-2 text-sm text-slate-200">{msg}</div>}

      {/* ---------- 일반 ---------- */}
      <section className="card">
        <h2 className="mb-3 font-semibold text-white">🏷️ 일반</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">이름</label>
            <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">설명</label>
            <input className="input" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-4 w-4 accent-[#6c8cff]" />
            공개 스페이스 (로비 목록 표시 + 누구나 멤버 가입 가능)
          </label>
          <p className="text-xs text-slate-500">
            초대 링크: <code className="rounded bg-panel2 px-1.5 py-0.5">{typeof window !== "undefined" ? window.location.origin : ""}/s/{space.slug}</code>
          </p>
          <button
            disabled={pending}
            onClick={() =>
              run(
                () => updateSpaceSettings(space.id, { name, description, is_public: isPublic }),
                "저장했습니다"
              )
            }
            className="btn-primary"
          >
            저장
          </button>
        </div>
      </section>

      {/* ---------- 보안/접근 ---------- */}
      <section className="card">
        <h2 className="mb-3 font-semibold text-white">🔐 보안 · 접근 제한</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={requireLogin} onChange={(e) => setRequireLogin(e.target.checked)} className="h-4 w-4 accent-[#6c8cff]" />
            로그인한 사용자만 입장 허용
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={guestCheckin} onChange={(e) => setGuestCheckin(e.target.checked)} className="h-4 w-4 accent-[#6c8cff]" />
            게스트 체크인 (비멤버는 접속 중인 멤버의 승인 필요)
          </label>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              이메일 도메인 제한 (쉼표 구분, 비우면 제한 없음 — 예: company.com, school.ac.kr)
            </label>
            <input className="input" value={domains} onChange={(e) => setDomains(e.target.value)} />
          </div>
          <button
            disabled={pending}
            onClick={() => {
              const list = domains
                .split(",")
                .map((d) => d.trim())
                .filter(Boolean);
              run(
                () =>
                  updateSpaceSettings(space.id, {
                    require_login: requireLogin,
                    guest_checkin: guestCheckin,
                    allowed_domains: list.length ? list : null,
                  }),
                "보안 설정을 저장했습니다"
              );
            }}
            className="btn-primary"
          >
            저장
          </button>

          <div className="border-t border-white/5 pt-3">
            <label className="mb-1 block text-xs text-slate-400">
              스페이스 비밀번호 {space.has_password ? "(현재 설정됨)" : "(현재 없음)"}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                className="input"
                placeholder="새 비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                disabled={pending || !password}
                onClick={() => run(() => setSpacePassword(space.id, password), "비밀번호를 설정했습니다")}
                className="btn-primary shrink-0"
              >
                설정
              </button>
              {space.has_password && (
                <button
                  disabled={pending}
                  onClick={() => run(() => setSpacePassword(space.id, ""), "비밀번호를 해제했습니다")}
                  className="btn-ghost shrink-0"
                >
                  해제
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 멤버/역할 ---------- */}
      <section className="card">
        <h2 className="mb-1 font-semibold text-white">👥 멤버 · 역할 ({members.length})</h2>
        <p className="mb-3 text-xs text-slate-500">
          공개 스페이스는 로비에서 누구나 &quot;+멤버&quot;로 가입할 수 있습니다. 역할별 권한: Admin=전체 관리 ·
          Moderator=모더레이션+맵 · Mapmaker=맵 편집 · Member=일반
        </p>
        <ul className="space-y-1.5">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2 rounded-xl bg-panel2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                {m.display_name}
                {m.is_owner && <span className="ml-1.5 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">오너</span>}
                {m.user_id === myId && <span className="ml-1 text-xs text-slate-500">(나)</span>}
              </span>
              {m.is_owner ? (
                <span className="text-xs text-slate-400">Admin</span>
              ) : (
                <>
                  <select
                    value={m.role}
                    disabled={pending}
                    onChange={(e) =>
                      run(
                        () => setMemberRole(space.id, m.user_id, e.target.value as SpaceRole),
                        "역할을 변경했습니다"
                      )
                    }
                    className="rounded-lg bg-panel px-2 py-1 text-xs text-slate-200"
                  >
                    {ROLES.map((r) => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`${m.display_name}님을 멤버에서 제거할까요?`))
                        run(() => removeMember(space.id, m.user_id), "제거했습니다");
                    }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    제거
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- 방 관리 ---------- */}
      <section className="card">
        <h2 className="mb-3 font-semibold text-white">🗺️ 방(맵) 관리</h2>
        <ul className="mb-4 space-y-1.5">
          {rooms.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl bg-panel2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                {r.name}
                <span className="ml-2 text-xs text-slate-500">
                  템플릿: {r.template_key}
                  {r.map_data ? " · 커스텀 수정됨" : ""}
                </span>
              </span>
              <button
                disabled={pending}
                onClick={() => {
                  const n = prompt("새 이름:", r.name);
                  if (n) run(() => renameRoom(space.id, r.id, n), "이름을 변경했습니다");
                }}
                className="text-xs text-slate-300 hover:text-white"
              >
                이름변경
              </button>
              {rooms.length > 1 && (
                <button
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`"${r.name}" 방을 삭제할까요?`))
                      run(() => deleteRoomAction(space.id, r.id), "삭제했습니다");
                  }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-[200px]"
            placeholder="새 방 이름"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
          />
          <select
            className="input max-w-[160px]"
            value={newRoomTemplate}
            onChange={(e) => setNewRoomTemplate(e.target.value)}
          >
            {MAP_LIST.map((m) => (
              <option key={m.key} value={m.key}>{m.name}</option>
            ))}
          </select>
          <button
            disabled={pending}
            onClick={() =>
              run(
                () => createRoomInSpace(space.id, newRoomName || "새 방", newRoomTemplate),
                "방을 추가했습니다"
              )
            }
            className="btn-primary"
          >
            + 방 추가
          </button>
        </div>
      </section>

      {/* ---------- 밴 ---------- */}
      <section className="card">
        <h2 className="mb-3 font-semibold text-white">⛔ 밴 목록 ({bans.length})</h2>
        {bans.length === 0 ? (
          <p className="text-sm text-slate-500">밴된 사용자가 없습니다. (방 안 참가자 패널에서 밴할 수 있어요)</p>
        ) : (
          <ul className="space-y-1.5">
            {bans.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-xl bg-panel2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-100">
                  {b.target_name || b.target_key.slice(0, 12)}
                  {b.reason && <span className="ml-2 text-xs text-slate-500">{b.reason}</span>}
                </span>
                <button
                  disabled={pending}
                  onClick={() => run(() => unbanTarget(space.id, b.id), "밴을 해제했습니다")}
                  className="text-xs text-accent2 hover:underline"
                >
                  해제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- 게스트 로그 ---------- */}
      <section className="card">
        <h2 className="mb-3 font-semibold text-white">🚪 게스트 체크인 로그</h2>
        {guestLogs.length === 0 ? (
          <p className="text-sm text-slate-500">기록이 없습니다.</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-auto text-sm">
            {guestLogs.map((g) => (
              <li key={g.id} className="flex justify-between rounded-lg bg-panel2 px-3 py-1.5">
                <span className="text-slate-200">
                  {g.guest_name}
                  {g.approved_by && <span className="ml-2 text-xs text-slate-500">승인: {g.approved_by}</span>}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(g.entered_at).toLocaleString("ko-KR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- 삭제 ---------- */}
      <section className="card border-red-500/20">
        <h2 className="mb-2 font-semibold text-red-300">🗑️ 스페이스 삭제</h2>
        <p className="mb-3 text-sm text-slate-400">모든 방, 멤버, 데이터가 영구 삭제됩니다.</p>
        <button
          disabled={pending}
          onClick={() => {
            if (confirm(`정말 "${space.name}" 스페이스를 삭제할까요?`) && confirm("복구할 수 없습니다. 진행할까요?")) {
              startTransition(async () => {
                await deleteSpace(space.id);
                router.push("/spaces");
              });
            }
          }}
          className="btn bg-red-500/20 text-red-300 hover:bg-red-500/30"
        >
          스페이스 영구 삭제
        </button>
      </section>
    </div>
  );
}
