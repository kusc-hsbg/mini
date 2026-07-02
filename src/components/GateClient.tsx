"use client";

// 스페이스 게이트 — 비밀번호 / 로그인 요구 / 도메인 제한 / 게스트 체크인 / 밴.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { verifySpacePassword } from "@/app/actions";
import { useControlChannel } from "@/hooks/useControlChannel";
import { logGuestEntry } from "@/lib/analytics";
import type { SpaceRecord } from "@/lib/game/types";

const GUEST_ID_KEY = "pixeltown:guest-id";
const GUEST_KEY = "pixeltown:guest-appearance";

export default function GateClient({
  space,
  reason,
  loggedIn,
  userKey,
  displayName,
  firstRoomId,
}: {
  space: SpaceRecord;
  reason: "banned" | "login" | "domain" | "password" | "checkin" | null;
  loggedIn: boolean;
  userKey: string | null;
  displayName: string | null;
  firstRoomId: string | null;
}) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [myKey, setMyKey] = useState("");
  const [myName, setMyName] = useState(displayName ?? "게스트");

  useEffect(() => {
    if (loggedIn) return;
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = "guest_" + Math.random().toString(36).slice(2);
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    setMyKey(id);
    try {
      const raw = localStorage.getItem(GUEST_KEY);
      if (raw) {
        const g = JSON.parse(raw);
        if (g.name) setMyName(g.name);
      }
    } catch {}
  }, [loggedIn]);

  // 체크인 채널: 결과 대기
  const checkinKey = userKey ?? myKey;
  const control = useControlChannel(space.id, reason === "checkin", {
    onCheckinResult: (r) => {
      if (r.key !== checkinKey) return;
      if (r.allow) {
        document.cookie = `sp_ci_${space.id}=1; path=/; max-age=${60 * 60 * 6}`;
        logGuestEntry(space.id, checkinKey, myName, r.byName);
        router.refresh();
        if (firstRoomId) router.push(`/s/${space.id}/${firstRoomId}`);
      } else {
        setWaiting(false);
        setError("입장이 거절되었습니다.");
      }
    },
  });

  async function submitPassword() {
    setPending(true);
    setError(null);
    const res = await verifySpacePassword(space.id, pw);
    setPending(false);
    if ("error" in res) setError(res.error);
    else {
      router.refresh();
      router.push(`/s/${space.id}`);
    }
  }

  function requestCheckin() {
    setWaiting(true);
    setError(null);
    control.send("checkin-request", { key: checkinKey, name: myName });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card w-full max-w-md">
        <Link href="/spaces" className="text-sm text-slate-400 hover:text-white">
          ← 로비
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-white">{space.name}</h1>
        <p className="mb-6 mt-1 text-sm text-slate-400">{space.description}</p>

        {reason === "banned" && (
          <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
            ⛔ 이 스페이스에서 차단되었습니다.
          </p>
        )}

        {reason === "login" && (
          <div className="space-y-3">
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
              🔑 이 스페이스는 로그인한 사용자만 입장할 수 있습니다.
            </p>
            <Link href="/login" className="btn-primary w-full">
              로그인하기 →
            </Link>
          </div>
        )}

        {reason === "domain" && (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
            📧 허용된 이메일 도메인({space.allowed_domains?.join(", ")})의 계정만 입장할 수
            있습니다.{!loggedIn && " 먼저 로그인해주세요."}
          </p>
        )}

        {reason === "password" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">🔑 이 스페이스는 비밀번호로 보호되어 있습니다.</p>
            <input
              type="password"
              className="input"
              placeholder="스페이스 비밀번호"
              value={pw}
              autoFocus
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
            />
            <button onClick={submitPassword} disabled={pending} className="btn-primary w-full">
              {pending ? "확인 중..." : "입장하기 →"}
            </button>
          </div>
        )}

        {reason === "checkin" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              🚪 게스트 체크인이 켜져 있습니다. 접속 중인 멤버가 승인하면 입장할 수 있어요.
            </p>
            {!loggedIn && (
              <input
                className="input"
                placeholder="이름"
                value={myName}
                maxLength={24}
                onChange={(e) => setMyName(e.target.value)}
              />
            )}
            <button
              onClick={requestCheckin}
              disabled={waiting || !control.ready}
              className="btn-primary w-full"
            >
              {waiting ? "승인 대기 중... (멤버에게 알림이 갔어요)" : "입장 요청 보내기"}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}
