// 레이스 보스전용 투사체 카탈로그.
// 대결형 장비 카탈로그는 제거했고, 협동 레이드 동작에 필요한 도구만 유지한다.

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
  pellets: number; // 한 번에 생성되는 투사체 수
  spreadDeg: number; // 산탄 퍼짐(도)
  radiusPx?: number; // 폭발/연막 반경(throw/smoke/cannon)
  price: number;
  currency: "heart" | "coin";
  color: string;
  desc: string;
}

export const WEAPONS: Weapon[] = [
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

// 레거시 칭호 기준. UI에서는 중립적인 도감 칭호로 표시한다.
export const KILL_TITLES: { kills: number; title: string; label: string }[] = [
  { kills: 10, title: "rookie-killer", label: "챌린지 참가자" },
  { kills: 50, title: "sharpshooter", label: "집중력 장인" },
  { kills: 100, title: "killer", label: "도전왕" },
  { kills: 300, title: "warlord", label: "레전드 모험가" },
];

export function titleForKills(kills: number): { title: string; label: string } | null {
  let best: { title: string; label: string } | null = null;
  for (const t of KILL_TITLES) if (kills >= t.kills) best = { title: t.title, label: t.label };
  return best;
}
