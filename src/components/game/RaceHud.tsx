"use client";

// 그랑프리 레이스 HUD — 랩/타이머/베스트랩 + 세션 리더보드.
import type { RaceState } from "@/lib/game/engine";

export interface LeaderEntry {
  id: string;
  name: string;
  bestTotalMs: number;
  finishes: number;
}

export function fmtMs(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export default function RaceHud({
  state,
  leaderboard,
  selfId,
}: {
  state: RaceState | null;
  leaderboard: LeaderEntry[];
  selfId: string;
}) {
  if (!state) return null;
  const sorted = [...leaderboard].sort((a, b) => a.bestTotalMs - b.bestTotalMs).slice(0, 5);
  const countdownSec = Math.ceil((state.countdownMs ?? 0) / 1000);

  return (
    <div className="pointer-events-none absolute right-3 top-48 z-10 flex w-52 flex-col gap-2">
      {/* 레이스 타이머 (유아 스타일 파스텔 카드) */}
      <div className="rounded-[22px] border-4 border-white/80 bg-gradient-to-b from-amber-100/95 to-orange-100/95 p-3 shadow-lg backdrop-blur">
        {countdownSec > 0 ? (
          <div className="text-center">
            <div className="text-xs font-black text-orange-500">🚦 출발 준비!</div>
            <div className="mt-1 font-mono text-4xl font-black tabular-nums text-slate-800">{countdownSec}</div>
            <div className="mt-1 text-[10px] font-semibold text-slate-500">출발선 유지 · 시계방향 주행</div>
          </div>
        ) : state.active ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-black text-orange-500">
                🏁 LAP {state.lap}/{state.laps}
              </span>
              <span className="text-[10px] font-semibold text-slate-500">
                CP {state.cpIndex}/{state.cpTotal}
              </span>
            </div>
            <div className="mt-1 font-mono text-xl font-black tabular-nums text-slate-800">
              {fmtMs(state.lapElapsedMs)}
            </div>
            <div className="mt-0.5 flex justify-between text-[10px] font-semibold text-slate-500">
              <span>총 {fmtMs(state.elapsedMs)}</span>
              {state.bestLapMs != null && <span>베스트 {fmtMs(state.bestLapMs)}</span>}
            </div>
          </>
        ) : (
          <div className="text-xs font-semibold text-slate-700">
            🏎️ <b className="text-orange-500">카트를 타고 체커 라인</b>을 지나면
            <br />
            시계방향 {state.laps}바퀴 레이스가 시작돼요!
            {state.bestLapMs != null && (
              <div className="mt-1 text-[10px] text-slate-500">
                내 베스트 랩 {fmtMs(state.bestLapMs)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 리더보드 (파스텔) — 승부가 나면(레이스 종료·완주 기록이 있을 때)만 노출 */}
      {!state.active && countdownSec <= 0 && sorted.length > 0 && (
        <div className="rounded-[22px] border-4 border-white/80 bg-gradient-to-b from-sky-100/95 to-indigo-100/95 p-3 shadow-lg backdrop-blur">
          <div className="mb-1.5 text-xs font-black text-indigo-500">🏆 리더보드 (완주 기록)</div>
          <ol className="space-y-0.5">
            {sorted.map((e, i) => (
              <li
                key={e.id}
                className={`flex items-center justify-between text-xs font-semibold ${
                  e.id === selfId ? "text-pink-600" : "text-slate-700"
                }`}
              >
                <span className="truncate">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}{" "}
                  {e.name.slice(0, 8)}
                </span>
                <span className="font-mono tabular-nums">{fmtMs(e.bestTotalMs)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
