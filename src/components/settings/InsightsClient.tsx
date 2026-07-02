"use client";

// 인사이트 — 활동/대화/접속 지표 집계 + 차트 + CSV 내보내기.
import { useMemo } from "react";

export interface EventRow {
  user_key: string;
  user_name: string | null;
  kind: string; // join | leave | chat | conv_seconds | online
  value: number | null;
  created_at: string;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export default function InsightsClient({ events }: { events: EventRow[] }) {
  const agg = useMemo(() => {
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) {
      days.push(new Date(Date.now() - i * 24 * 3600_000).toISOString().slice(0, 10));
    }
    const dailyUsers = new Map<string, Set<string>>();
    const dailyJoins = new Map<string, number>();
    const dailyConvMin = new Map<string, number>();
    let totalChat = 0;
    let totalConvSec = 0;
    let peak = 0;
    const perUser = new Map<
      string,
      { name: string; joins: number; chat: number; convMin: number; days: Set<string> }
    >();

    for (const e of events) {
      const d = dayKey(e.created_at);
      const u =
        perUser.get(e.user_key) ??
        { name: e.user_name ?? e.user_key.slice(0, 8), joins: 0, chat: 0, convMin: 0, days: new Set<string>() };
      u.days.add(d);
      if (e.user_name) u.name = e.user_name;

      if (e.kind === "join") {
        dailyJoins.set(d, (dailyJoins.get(d) ?? 0) + 1);
        u.joins++;
        if (!dailyUsers.has(d)) dailyUsers.set(d, new Set());
        dailyUsers.get(d)!.add(e.user_key);
      } else if (e.kind === "chat") {
        totalChat += e.value ?? 1;
        u.chat += e.value ?? 1;
      } else if (e.kind === "conv_seconds") {
        totalConvSec += e.value ?? 0;
        u.convMin += (e.value ?? 0) / 60;
        dailyConvMin.set(d, (dailyConvMin.get(d) ?? 0) + (e.value ?? 0) / 60);
      } else if (e.kind === "online") {
        peak = Math.max(peak, e.value ?? 0);
      }
      perUser.set(e.user_key, u);
    }

    const activeUsers = new Set(events.map((e) => e.user_key)).size;
    return { days, dailyUsers, dailyJoins, dailyConvMin, totalChat, totalConvSec, peak, perUser, activeUsers };
  }, [events]);

  function exportCsv() {
    const rows = [["user", "joins", "chat", "conv_minutes", "active_days"]];
    agg.perUser.forEach((u) => {
      rows.push([u.name, String(u.joins), String(u.chat), u.convMin.toFixed(1), String(u.days.size)]);
    });
    const blob = new Blob(["﻿" + rows.map((r) => r.join(",")).join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pixeltown-insights.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="활성 사용자 (30일)" value={String(agg.activeUsers)} icon="👥" />
        <Stat label="최대 동시 접속" value={String(agg.peak || "-")} icon="📈" />
        <Stat label="총 대화 시간" value={`${Math.round(agg.totalConvSec / 60)}분`} icon="🎙️" />
        <Stat label="채팅 메시지" value={String(agg.totalChat)} icon="💬" />
      </div>

      {/* 일별 차트 */}
      <div className="card">
        <h2 className="mb-3 font-semibold text-white">일별 활성 사용자 (최근 14일)</h2>
        <BarChart
          days={agg.days}
          values={agg.days.map((d) => agg.dailyUsers.get(d)?.size ?? 0)}
          color="#6c8cff"
        />
      </div>
      <div className="card">
        <h2 className="mb-3 font-semibold text-white">일별 대화 시간 (분)</h2>
        <BarChart
          days={agg.days}
          values={agg.days.map((d) => Math.round(agg.dailyConvMin.get(d) ?? 0))}
          color="#34d399"
        />
      </div>

      {/* 멤버별 테이블 */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-white">멤버별 활동</h2>
          <button onClick={exportCsv} className="btn-ghost text-xs">
            📥 CSV 내보내기
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                <th className="py-2">사용자</th>
                <th>접속 수</th>
                <th>채팅</th>
                <th>대화(분)</th>
                <th>활동일</th>
              </tr>
            </thead>
            <tbody>
              {[...agg.perUser.values()]
                .sort((a, b) => b.convMin - a.convMin)
                .slice(0, 50)
                .map((u, i) => (
                  <tr key={i} className="border-b border-white/5 text-slate-200">
                    <td className="py-2">{u.name}</td>
                    <td>{u.joins}</td>
                    <td>{u.chat}</td>
                    <td>{u.convMin.toFixed(1)}</td>
                    <td>{u.days.size}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {agg.perUser.size === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              아직 데이터가 없습니다. 사용자들이 스페이스를 이용하면 자동으로 수집됩니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="card">
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function BarChart({ days, values, color }: { days: string[]; values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-36 items-end gap-1.5">
      {days.map((d, i) => (
        <div key={d} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[9px] text-slate-500">{values[i] || ""}</span>
          <div
            className="w-full rounded-t"
            style={{
              height: `${(values[i] / max) * 100}%`,
              minHeight: values[i] ? 3 : 1,
              backgroundColor: values[i] ? color : "rgba(255,255,255,0.06)",
            }}
          />
          <span className="text-[9px] text-slate-600">{d.slice(5).replace("-", "/")}</span>
        </div>
      ))}
    </div>
  );
}
