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

  return (
    <div className="pointer-events-none absolute right-3 top-48 z-10 flex w-52 flex-col gap-2">
      {/* 레이스 타이머 */}
      <div className="rounded-xl border border-white/10 bg-panel/85 p-3 backdrop-blur">
        {state.active ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-amber-300">
                🏁 LAP {state.lap}/{state.laps}
              </span>
              <span className="text-[10px] text-slate-400">
                CP {state.cpIndex}/{state.cpTotal}
              </span>
            </div>
            <div className="mt-1 font-mono text-xl font-bold tabular-nums text-white">
              {fmtMs(state.lapElapsedMs)}
            </div>
            <div className="mt-0.5 flex justify-between text-[10px] text-slate-400">
              <span>총 {fmtMs(state.elapsedMs)}</span>
              {state.bestLapMs != null && <span>베스트 {fmtMs(state.bestLapMs)}</span>}
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-300">
            🏁 <b className="text-white">카트를 타고 체커 라인</b>을 지나면
            <br />
            {state.laps}랩 레이스가 시작됩니다!
            {state.bestLapMs != null && (
              <div className="mt-1 text-[10px] text-slate-400">
                내 베스트 랩 {fmtMs(state.bestLapMs)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 리더보드 */}
      {sorted.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-panel/85 p-3 backdrop-blur">
          <div className="mb-1.5 text-xs font-medium text-slate-300">🏆 리더보드 (완주 기록)</div>
          <ol className="space-y-0.5">
            {sorted.map((e, i) => (
              <li
                key={e.id}
                className={`flex items-center justify-between text-xs ${
                  e.id === selfId ? "text-accent2" : "text-slate-200"
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
