// 상점 카탈로그 — 하트/코인으로 구매하는 아이템 정의.
// 서버 액션(buyItem)이 이 카탈로그를 권위 있는 가격 소스로 사용한다.

export type Currency = "heart" | "coin";
// 장착 슬롯 — 슬롯당 하나만 장착. consumable/none 은 장착 슬롯 없음.
export type ShopSlot =
  | "frame" // 둥근 프로필 액자(테두리)
  | "card" // 프로필 카드 테마
  | "mount" // 탈것(늑대/곰/양탄자/스포츠카 등)
  | "pet" // 따라다니는 펫
  | "wings" // 날개
  | "kart" // 레이싱 카트 색상/테마
  | "dance" // Z 키 춤 스타일
  | "none";

export type ShopCategory =
  | "액자"
  | "프로필카드"
  | "탈것"
  | "펫"
  | "날개"
  | "댄스"
  | "감정표현"
  | "카트"
  | "소모품";

export interface ShopItem {
  key: string;
  name: string;
  category: ShopCategory;
  slot: ShopSlot;
  price: number;
  currency: Currency;
  icon: string; // 이모지 미리보기
  color?: string; // 렌더용 색
  seats?: number; // 탈것 최대 탑승 인원(양탄자=5)
  rideableParty?: boolean; // 파티 동승 가능
  consumable?: boolean; // 소모품(1회성)
  desc?: string;
}

const BASE_ITEMS: ShopItem[] = [
  // ---------- 액자(둥근 프로필 테두리) ----------
  { key: "frame-gold", name: "골드 액자", category: "액자", slot: "frame", price: 300, currency: "heart", icon: "🟡", color: "#e5b74a" },
  { key: "frame-rainbow", name: "레인보우 액자", category: "액자", slot: "frame", price: 800, currency: "heart", icon: "🌈", color: "rainbow" },
  { key: "frame-neon", name: "네온 액자", category: "액자", slot: "frame", price: 500, currency: "heart", icon: "💠", color: "#22d3ee" },
  { key: "frame-flower", name: "플라워 액자", category: "액자", slot: "frame", price: 450, currency: "heart", icon: "🌸", color: "#f472b6" },

  // ---------- 프로필 카드 테마 ----------
  { key: "card-aurora", name: "오로라 카드", category: "프로필카드", slot: "card", price: 600, currency: "heart", icon: "🌌", color: "#7c3aed" },
  { key: "card-sunset", name: "선셋 카드", category: "프로필카드", slot: "card", price: 600, currency: "heart", icon: "🌅", color: "#fb7185" },
  { key: "card-galaxy", name: "갤럭시 카드", category: "프로필카드", slot: "card", price: 1200, currency: "heart", icon: "✨", color: "#4338ca" },
  { key: "card-gold", name: "럭셔리 골드 카드", category: "프로필카드", slot: "card", price: 5, currency: "coin", icon: "👑", color: "#d4af37" },

  // ---------- 펫 ----------
  { key: "pet-cat-black", name: "검은 고양이", category: "펫", slot: "pet", price: 400, currency: "heart", icon: "🐈‍⬛", color: "#1f2937" },
  { key: "pet-cat-white", name: "하얀 고양이", category: "펫", slot: "pet", price: 400, currency: "heart", icon: "🐈", color: "#f8fafc" },
  { key: "pet-cat-orange", name: "치즈 고양이", category: "펫", slot: "pet", price: 400, currency: "heart", icon: "🐱", color: "#f59e0b" },
  { key: "pet-cat-gray", name: "회색 고양이", category: "펫", slot: "pet", price: 400, currency: "heart", icon: "🐾", color: "#9ca3af" },
  { key: "pet-cat-pink", name: "핑크 고양이", category: "펫", slot: "pet", price: 700, currency: "heart", icon: "🌸", color: "#f472b6" },

  // ---------- 탈것(맵 이동용 마운트) ----------
  { key: "mount-wolf", name: "늑대", category: "탈것", slot: "mount", price: 1500, currency: "heart", icon: "🐺", color: "#6b7280", seats: 1 },
  { key: "mount-bear", name: "곰", category: "탈것", slot: "mount", price: 1800, currency: "heart", icon: "🐻", color: "#92400e", seats: 1 },
  { key: "mount-sportscar", name: "스포츠카", category: "탈것", slot: "mount", price: 3000, currency: "heart", icon: "🏎️", color: "#ef4444", seats: 1 },
  { key: "mount-rabbit", name: "거대 토끼", category: "탈것", slot: "mount", price: 2200, currency: "heart", icon: "🐰", color: "#fbcfe8", seats: 1 },
  { key: "mount-rudolph", name: "루돌프", category: "탈것", slot: "mount", price: 2500, currency: "heart", icon: "🦌", color: "#b45309", seats: 1 },
  { key: "mount-tiger", name: "백호", category: "탈것", slot: "mount", price: 4000, currency: "heart", icon: "🐯", color: "#f8fafc", seats: 1 },
  { key: "mount-robot", name: "로봇", category: "탈것", slot: "mount", price: 3500, currency: "heart", icon: "🤖", color: "#94a3b8", seats: 1 },
  { key: "mount-phoenix", name: "불사조", category: "탈것", slot: "mount", price: 20, currency: "coin", icon: "🔥", color: "#f97316", seats: 1 },
  { key: "mount-carpet", name: "마법 양탄자 (5인)", category: "탈것", slot: "mount", price: 50, currency: "coin", icon: "🧞", color: "#7c3aed", seats: 5, rideableParty: true, desc: "파티원 최대 5명이 함께 탈 수 있어요." },
  { key: "mount-balloon", name: "투어 열기구", category: "탈것", slot: "mount", price: 1200, currency: "heart", icon: "🎈", color: "#f97316", seats: 1, desc: "스타홀 투어 바구니에 탑승하는 열기구입니다." },

  // ---------- 날개 ----------
  { key: "wings-angel", name: "천사 날개", category: "날개", slot: "wings", price: 900, currency: "heart", icon: "🕊️", color: "#f8fafc" },
  { key: "wings-fairy", name: "요정 날개", category: "날개", slot: "wings", price: 1100, currency: "heart", icon: "🧚", color: "#a5f3fc" },
  { key: "wings-phoenix", name: "불사조 날개", category: "날개", slot: "wings", price: 10, currency: "coin", icon: "🔥", color: "#f97316" },

  // ---------- 카트 색상/테마(레이싱) ----------
  { key: "kart-red", name: "레드 카트", category: "카트", slot: "kart", price: 200, currency: "heart", icon: "🔴", color: "#ef4444" },
  { key: "kart-blue", name: "블루 카트", category: "카트", slot: "kart", price: 200, currency: "heart", icon: "🔵", color: "#3b82f6" },
  { key: "kart-gold", name: "골드 카트", category: "카트", slot: "kart", price: 700, currency: "heart", icon: "🟡", color: "#eab308" },
  { key: "kart-neon", name: "네온 카트", category: "카트", slot: "kart", price: 900, currency: "heart", icon: "💚", color: "#22c55e" },

  // ---------- 댄스 스타일 ----------
  { key: "dance-classic", name: "클래식 스텝", category: "댄스", slot: "dance", price: 250, currency: "heart", icon: "♪", color: "#a5b4fc" },
  { key: "dance-pop", name: "팝 리듬", category: "댄스", slot: "dance", price: 450, currency: "heart", icon: "♫", color: "#f472b6" },
  { key: "dance-neon", name: "네온 웨이브", category: "댄스", slot: "dance", price: 700, currency: "heart", icon: "✦", color: "#22d3ee" },

  // ---------- 감정표현 팩(해금) ----------
  { key: "emote-pack-love", name: "하트 감정표현 팩", category: "감정표현", slot: "none", price: 300, currency: "heart", icon: "💞" },
  { key: "emote-pack-party", name: "파티 감정표현 팩", category: "감정표현", slot: "none", price: 300, currency: "heart", icon: "🎉" },

  // ---------- 소모품 ----------
  { key: "portable-piano", name: "휴대용 피아노 (1회성)", category: "소모품", slot: "none", price: 250, currency: "heart", icon: "🎹", consumable: true, desc: "어디서든 설치/회수할 수 있어요. 사용 시 소모됩니다." },
];

const PALETTES = [
  ["ruby", "루비", "#ef4444", "◆"],
  ["rose", "로즈", "#fb7185", "◇"],
  ["coral", "코랄", "#f97316", "✦"],
  ["amber", "앰버", "#f59e0b", "●"],
  ["gold", "골드", "#eab308", "✹"],
  ["lime", "라임", "#84cc16", "✧"],
  ["emerald", "에메랄드", "#10b981", "◆"],
  ["mint", "민트", "#2dd4bf", "◇"],
  ["cyan", "시안", "#06b6d4", "✦"],
  ["sky", "스카이", "#38bdf8", "●"],
  ["azure", "아주르", "#3b82f6", "✹"],
  ["indigo", "인디고", "#6366f1", "✧"],
  ["violet", "바이올렛", "#8b5cf6", "◆"],
  ["orchid", "오키드", "#c084fc", "◇"],
  ["magenta", "마젠타", "#d946ef", "✦"],
  ["fuchsia", "푸시아", "#e879f9", "●"],
  ["pearl", "펄", "#f8fafc", "✹"],
  ["smoke", "스모크", "#94a3b8", "✧"],
  ["slate", "슬레이트", "#475569", "◆"],
  ["onyx", "오닉스", "#111827", "◇"],
  ["copper", "코퍼", "#b45309", "✦"],
  ["bronze", "브론즈", "#92400e", "●"],
  ["wine", "와인", "#9f1239", "✹"],
  ["jade", "제이드", "#047857", "✧"],
  ["lagoon", "라군", "#0f766e", "◆"],
  ["ice", "아이스", "#bae6fd", "◇"],
  ["royal", "로열", "#4338ca", "✦"],
  ["plum", "플럼", "#7e22ce", "●"],
  ["lotus", "로터스", "#f0abfc", "✹"],
  ["ivory", "아이보리", "#fff7ed", "✧"],
  ["charcoal", "차콜", "#27272a", "◆"],
  ["steel", "스틸", "#64748b", "◇"],
  ["teal", "틸", "#14b8a6", "✦"],
  ["leaf", "리프", "#22c55e", "●"],
  ["sun", "선", "#fde047", "✹"],
  ["blush", "블러시", "#fecdd3", "✧"],
  ["marine", "마린", "#1d4ed8", "◆"],
  ["lavender", "라벤더", "#a78bfa", "◇"],
  ["carbon", "카본", "#020617", "✦"],
  ["opal", "오팔", "#ccfbf1", "●"],
] as const;

const PET_ICONS = ["🐈", "🐕", "🐇", "🦊", "🐼", "🐧", "🦜", "🐢", "🐿️", "🦔"];
const MOUNT_ICONS = ["🏎️", "🛵", "🛹", "🚲", "🦄", "🐉", "🛸", "🧞", "🚀", "🛶"];
const WING_ICONS = ["🪽", "🕊️", "🧚", "🔥", "❄️", "🌌", "✨", "🌙"];
const DANCE_ICONS = ["♪", "♫", "✦", "✧", "◆", "◇", "●", "✹"];
const EMOTE_ICONS = ["💫", "💎", "🎊", "🎈", "💌", "🌟", "👏", "🙌", "🫶", "✅"];
const CONSUME_ICONS = ["🎹", "🎆", "🎁", "🪄", "📸", "🎟️", "🔔", "🕯️", "💡", "📯"];

function generatedCatalog(): ShopItem[] {
  const generated: ShopItem[] = [];
  PALETTES.forEach(([key, label, color, icon], idx) => {
    generated.push(
      { key: `frame-${key}-gallery`, name: `${label} 갤러리 액자`, category: "액자", slot: "frame", price: 320 + idx * 18, currency: "heart", icon, color },
      { key: `card-${key}-suite`, name: `${label} 스위트 카드`, category: "프로필카드", slot: "card", price: 520 + idx * 22, currency: idx % 13 === 0 ? "coin" : "heart", icon, color },
      { key: `kart-${key}-edition`, name: `${label} 에디션 카트`, category: "카트", slot: "kart", price: 260 + idx * 20, currency: idx % 11 === 0 ? "coin" : "heart", icon, color },
      { key: `pet-${key}-companion`, name: `${label} 컴패니언`, category: "펫", slot: "pet", price: 420 + idx * 16, currency: "heart", icon: PET_ICONS[idx % PET_ICONS.length], color },
      { key: `mount-${key}-cruiser`, name: `${label} 크루저`, category: "탈것", slot: "mount", price: 1600 + idx * 85, currency: idx % 10 === 0 ? "coin" : "heart", icon: MOUNT_ICONS[idx % MOUNT_ICONS.length], color, seats: idx % 12 === 0 ? 2 : 1 }
    );
  });

  PALETTES.slice(0, 32).forEach(([key, label, color], idx) => {
    generated.push({
      key: `wings-${key}-aura`,
      name: `${label} 오라 윙`,
      category: "날개",
      slot: "wings",
      price: 850 + idx * 45,
      currency: idx % 9 === 0 ? "coin" : "heart",
      icon: WING_ICONS[idx % WING_ICONS.length],
      color,
    });
  });

  PALETTES.forEach(([key, label, color], idx) => {
    generated.push({
      key: `emote-${key}-pack`,
      name: `${label} 리액션 팩`,
      category: "감정표현",
      slot: "none",
      price: 240 + idx * 12,
      currency: "heart",
      icon: EMOTE_ICONS[idx % EMOTE_ICONS.length],
      color,
    });
  });

  const danceNames = ["스텝", "웨이브", "스핀", "슬라이드", "팝", "재즈", "문워크", "클랩", "프리즈", "소울", "글라이드", "셔플"];
  PALETTES.concat(PALETTES.slice(0, 8)).forEach(([key, label, color], idx) => {
    generated.push({
      key: `dance-${key}-${danceNames[idx % danceNames.length].toLowerCase()}`,
      name: `${label} ${danceNames[idx % danceNames.length]}`,
      category: "댄스",
      slot: "dance",
      price: 280 + idx * 17,
      currency: idx % 16 === 0 ? "coin" : "heart",
      icon: DANCE_ICONS[idx % DANCE_ICONS.length],
      color,
    });
  });

  PALETTES.slice(0, 20).forEach(([key, label, color], idx) => {
    generated.push({
      key: `consumable-${key}-ticket`,
      name: `${label} 쇼 티켓`,
      category: "소모품",
      slot: "none",
      price: 180 + idx * 15,
      currency: "heart",
      icon: CONSUME_ICONS[idx % CONSUME_ICONS.length],
      color,
      consumable: true,
    });
  });
  return generated;
}

export const SHOP_ITEMS: ShopItem[] = [...BASE_ITEMS, ...generatedCatalog()];

export const SHOP_MAP: Record<string, ShopItem> = Object.fromEntries(
  SHOP_ITEMS.map((i) => [i.key, i])
);

export function shopItem(key: string): ShopItem | undefined {
  return SHOP_MAP[key];
}

// 하트 → 코인 환전 비율 (수많은 하트를 코인 하나로).
export const HEARTS_PER_COIN = 1000;

export const SHOP_CATEGORIES: ShopCategory[] = [
  "액자",
  "프로필카드",
  "펫",
  "탈것",
  "날개",
  "댄스",
  "카트",
  "감정표현",
  "소모품",
];
