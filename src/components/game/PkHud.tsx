"use client";

// PK 아레나 HUD (feature #12) — HP바 · 무기 선택/상점 · 스코어보드 · 사망 오버레이.
import { useState } from "react";
import { WEAPONS, WEAPON_MAP, MAX_HP, type Weapon } from "@/lib/game/weapons";
import type { PlayerState } from "@/lib/game/types";

export default function PkHud({
  hp,
  dead,
  weapon,
  selfKills,
  inventory,
  hearts,
  coins,
  players,
  selfId,
  onSetWeapon,
  onBuyWeapon,
}: {
  hp: number;
  dead: boolean;
  weapon: string;
  selfKills: number;
  inventory: string[];
  hearts: number;
  coins: number;
  players: PlayerState[];
  selfId: string;
  onSetWeapon: (key: string) => void;
  onBuyWeapon: (key: string) => void;
}) {
  const [shopOpen, setShopOpen] = useState(false);
  const owned = new Set<string>(["pistol"]);
  for (const k of inventory) if (k.startsWith("weapon-")) owned.add(k.slice("weapon-".length));

  const ownedWeapons = WEAPONS.filter((w) => owned.has(w.key));
  const board = [...players]
    .map((p) => ({ id: p.id, name: p.name, kills: p.kills ?? 0 }))
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 6);

  const ratio = Math.max(0, hp / MAX_HP);
  const cur = WEAPON_MAP[weapon];

  return (
    <>
      {/* 사망 오버레이 */}
      {dead && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-red-950/40">
          <div className="rounded-2xl bg-black/70 px-8 py-6 text-center">
            <div className="text-5xl">💀</div>
            <div className="mt-2 text-lg font-bold text-white">사망</div>
            <div className="text-sm text-slate-300">잠시 후 부활합니다...</div>
          </div>
        </div>
      )}

      {/* 스코어보드 (우상단 아래) */}
      <div className="pointer-events-none absolute right-3 top-40 z-20 w-40 rounded-xl bg-panel/85 p-2 text-xs backdrop-blur">
        <div className="mb-1 font-semibold text-white">🏆 킬 순위</div>
        {board.map((b, i) => (
          <div
            key={b.id}
            className={`flex justify-between ${b.id === selfId ? "text-accent2" : "text-slate-300"}`}
          >
            <span className="truncate">{i + 1}. {b.name}</span>
            <span className="ml-2 shrink-0">{b.kills}</span>
          </div>
        ))}
      </div>

      {/* 좌하단: HP + 무기 */}
      <div className="pointer-events-auto absolute bottom-24 left-3 z-20 w-64 space-y-2">
        <div className="rounded-xl bg-panel/85 p-2 backdrop-blur">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
            <span>❤️ HP</span>
            <span>{Math.round(hp)}/{MAX_HP} · 내 킬 {selfKills}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-black/50">
            <div
              className="h-full transition-all"
              style={{
                width: `${ratio * 100}%`,
                background: ratio > 0.5 ? "#34d399" : ratio > 0.25 ? "#fbbf24" : "#ef4444",
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {ownedWeapons.map((w) => (
              <button
                key={w.key}
                onClick={() => onSetWeapon(w.key)}
                title={w.name}
                className={`rounded-lg px-2 py-1 text-sm transition ${
                  weapon === w.key ? "bg-accent text-white ring-2 ring-accent" : "bg-panel2 text-slate-200 hover:bg-panel2/70"
                }`}
              >
                {w.icon}
              </button>
            ))}
            <button
              onClick={() => setShopOpen((v) => !v)}
              className="rounded-lg bg-panel2 px-2 py-1 text-sm text-slate-300 hover:text-white"
              title="무기 상점"
            >
              🛒
            </button>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            현재: {cur?.icon} {cur?.name} · 클릭/스페이스로 발사
          </div>
        </div>

        {/* 무기 상점 */}
        {shopOpen && (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl bg-panel/90 p-2 backdrop-blur">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-white">🔫 무기 상점</span>
              <span className="text-slate-400">💗{hearts.toLocaleString()} 🪙{coins}</span>
            </div>
            {WEAPONS.map((w: Weapon) => {
              const has = owned.has(w.key);
              const bal = w.currency === "heart" ? hearts : coins;
              const free = w.price === 0;
              return (
                <div key={w.key} className="flex items-center gap-2 rounded-lg bg-panel2/60 px-2 py-1 text-xs">
                  <span className="text-base">{w.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-slate-100">{w.name}</div>
                    <div className="text-[10px] text-slate-400">DMG {w.damage} · {w.desc}</div>
                  </div>
                  {has || free ? (
                    <span className="shrink-0 text-[10px] text-emerald-400">보유</span>
                  ) : (
                    <button
                      onClick={() => onBuyWeapon(w.key)}
                      disabled={bal < w.price}
                      className="shrink-0 rounded bg-accent px-2 py-0.5 text-[10px] text-white disabled:bg-slate-700 disabled:text-slate-500"
                    >
                      {w.currency === "heart" ? "💗" : "🪙"}{w.price}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
