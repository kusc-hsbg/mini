// 상점 카탈로그 — 하트/코인으로 구매하는 아이템 정의.
// 서버 액션(buyItem)이 이 카탈로그를 권위 있는 가격 소스로 사용한다.

export type Currency = "heart" | "coin";
// 장착 슬롯 — 슬롯당 하나만 장착. consumable/none 은 장착 슬롯 없음.
export type ShopSlot =
  | "frame" // 둥근 프로필 액자(테두리)
  | "card" // 프로필 카드 테마
  | "mount" // 탈것(늑대/곰/양탄자/스포츠카 등)
  | "pet" // 따라다니는 펫(고양이 색상)
  | "wings" // 날개
  | "kart" // 레이싱 카트 색상/테마
  | "none";

export type ShopCategory =
  | "액자"
  | "프로필카드"
  | "탈것"
  | "펫"
  | "날개"
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

export const SHOP_ITEMS: ShopItem[] = [
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

  // ---------- 펫(고양이 색상별) ----------
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

  // ---------- 날개 ----------
  { key: "wings-angel", name: "천사 날개", category: "날개", slot: "wings", price: 900, currency: "heart", icon: "🕊️", color: "#f8fafc" },
  { key: "wings-devil", name: "데빌 윙", category: "날개", slot: "wings", price: 900, currency: "heart", icon: "😈", color: "#7f1d1d" },
  { key: "wings-fairy", name: "요정 날개", category: "날개", slot: "wings", price: 1100, currency: "heart", icon: "🧚", color: "#a5f3fc" },
  { key: "wings-phoenix", name: "불사조 날개", category: "날개", slot: "wings", price: 10, currency: "coin", icon: "🔥", color: "#f97316" },

  // ---------- 카트 색상/테마(레이싱) ----------
  { key: "kart-red", name: "레드 카트", category: "카트", slot: "kart", price: 200, currency: "heart", icon: "🔴", color: "#ef4444" },
  { key: "kart-blue", name: "블루 카트", category: "카트", slot: "kart", price: 200, currency: "heart", icon: "🔵", color: "#3b82f6" },
  { key: "kart-gold", name: "골드 카트", category: "카트", slot: "kart", price: 700, currency: "heart", icon: "🟡", color: "#eab308" },
  { key: "kart-neon", name: "네온 카트", category: "카트", slot: "kart", price: 900, currency: "heart", icon: "💚", color: "#22c55e" },

  // ---------- 감정표현 팩(해금) ----------
  { key: "emote-pack-love", name: "하트 감정표현 팩", category: "감정표현", slot: "none", price: 300, currency: "heart", icon: "💞" },
  { key: "emote-pack-party", name: "파티 감정표현 팩", category: "감정표현", slot: "none", price: 300, currency: "heart", icon: "🎉" },

  // ---------- 소모품 ----------
  { key: "portable-piano", name: "휴대용 피아노 (1회성)", category: "소모품", slot: "none", price: 250, currency: "heart", icon: "🎹", consumable: true, desc: "어디서든 설치/회수할 수 있어요. 사용 시 소모됩니다." },
];

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
  "카트",
  "감정표현",
  "소모품",
];
