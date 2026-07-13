// PK 샷건존 무기 카탈로그 (feature #12).
// 인벤토리에는 "weapon-<key>" 형태로 저장. pistol 은 기본 무료 지급.

export type WeaponKind = "gun" | "shotgun" | "sniper" | "melee" | "throw" | "smoke" | "cannon" | "tank" | "arrow" | "rocket";

export interface Weapon {
  key: string;
  name: string;
  kind: WeaponKind;
  icon: string;
  damage: number; // 발당 데미지
  cooldownMs: number; // 발사 간격
  speed: number; // 투사체 속도(px/s). melee 는 사용 안 함
  rangePx: number; // 사거리(px) / melee 는 근접 반경
  pellets: number; // 한 번에 발사되는 투사체 수(샷건)
  spreadDeg: number; // 산탄 퍼짐(도)
  radiusPx?: number; // 폭발/연막 반경(throw/smoke/cannon)
  price: number;
  currency: "heart" | "coin";
  color: string;
  desc: string;
}

export const WEAPONS: Weapon[] = [
  {
    key: "pistol", name: "권총", kind: "gun", icon: "🔫",
    damage: 18, cooldownMs: 400, speed: 620, rangePx: 420, pellets: 1, spreadDeg: 2,
    price: 0, currency: "heart", color: "#fbbf24", desc: "기본 지급 무기. 균형 잡힌 성능.",
  },
  {
    key: "rifle", name: "소총", kind: "gun", icon: "🪖",
    damage: 14, cooldownMs: 140, speed: 760, rangePx: 560, pellets: 1, spreadDeg: 5,
    price: 400, currency: "heart", color: "#84cc16", desc: "빠른 연사. 근중거리 제압.",
  },
  {
    key: "shotgun", name: "샷건", kind: "shotgun", icon: "💥",
    damage: 11, cooldownMs: 700, speed: 560, rangePx: 240, pellets: 6, spreadDeg: 24,
    price: 600, currency: "heart", color: "#f97316", desc: "근접에서 강력한 산탄. 6발 동시 발사.",
  },
  {
    key: "sniper", name: "저격총", kind: "sniper", icon: "🎯",
    damage: 75, cooldownMs: 1400, speed: 1200, rangePx: 900, pellets: 1, spreadDeg: 0,
    price: 900, currency: "heart", color: "#38bdf8", desc: "한 방이 강력한 장거리 저격.",
  },
  {
    key: "knife", name: "단검(근접)", kind: "melee", icon: "🔪",
    damage: 45, cooldownMs: 500, speed: 0, rangePx: 44, pellets: 1, spreadDeg: 0,
    price: 200, currency: "heart", color: "#e5e7eb", desc: "근접 강타. 붙으면 매우 아파요.",
  },
  {
    key: "grenade", name: "수류탄", kind: "throw", icon: "🧨",
    damage: 60, cooldownMs: 1600, speed: 420, rangePx: 360, pellets: 1, spreadDeg: 0, radiusPx: 70,
    price: 500, currency: "heart", color: "#ef4444", desc: "착탄 지점 폭발. 광역 데미지.",
  },
  {
    key: "smoke", name: "연막탄", kind: "smoke", icon: "💨",
    damage: 0, cooldownMs: 2000, speed: 380, rangePx: 340, pellets: 1, spreadDeg: 0, radiusPx: 96,
    price: 250, currency: "heart", color: "#94a3b8", desc: "시야를 가리는 연막. 데미지 없음.",
  },
  {
    key: "cannon", name: "대포", kind: "cannon", icon: "🎆",
    damage: 90, cooldownMs: 2400, speed: 500, rangePx: 520, pellets: 1, spreadDeg: 0, radiusPx: 90,
    price: 1500, currency: "heart", color: "#a855f7", desc: "거대한 포탄. 광역 초강력.",
  },
  {
    key: "tank", name: "탱크", kind: "tank", icon: "🛡️",
    damage: 120, cooldownMs: 3000, speed: 620, rangePx: 640, pellets: 1, spreadDeg: 0, radiusPx: 110,
    price: 30, currency: "coin", color: "#334155", desc: "최강의 화력. 코인으로만 구매 가능.",
  },
  {
    key: "arrow", name: "차지 화살", kind: "arrow", icon: "➶",
    damage: 0, cooldownMs: 1000, speed: 920, rangePx: 760, pellets: 1, spreadDeg: 0,
    price: 0, currency: "heart", color: "#f8e7b0", desc: "레이싱 보스전 전용. 1초 장전 후 유도 미사일을 요격합니다.",
  },
  {
    key: "boss-rocket", name: "폭죽 로켓", kind: "rocket", icon: "🚀",
    damage: 1, cooldownMs: 1000, speed: 520, rangePx: 1800, pellets: 1, spreadDeg: 0, radiusPx: 96,
    price: 0, currency: "heart", color: "#fb7185", desc: "레이싱 아이템 박스에서 발사되어 보스에게만 피해를 줍니다.",
  },
];

export const WEAPON_MAP: Record<string, Weapon> = Object.fromEntries(WEAPONS.map((w) => [w.key, w]));

export function weapon(key: string): Weapon | undefined {
  return WEAPON_MAP[key];
}

export const MAX_HP = 100;
export const RESPAWN_MS = 3500;

// 칭호 기준 (누적 킬).
export const KILL_TITLES: { kills: number; title: string; label: string }[] = [
  { kills: 10, title: "rookie-killer", label: "신참 사수" },
  { kills: 50, title: "sharpshooter", label: "명사수" },
  { kills: 100, title: "killer", label: "킬러" },
  { kills: 300, title: "warlord", label: "전쟁군주" },
];

export function titleForKills(kills: number): { title: string; label: string } | null {
  let best: { title: string; label: string } | null = null;
  for (const t of KILL_TITLES) if (kills >= t.kills) best = { title: t.title, label: t.label };
  return best;
}
