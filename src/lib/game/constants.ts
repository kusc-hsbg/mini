export const TILE = 32; // 한 타일 픽셀 크기

export const WALK_SPEED = 150; // px/sec (도보)
export const BIKE_SPEED = 300; // px/sec (오토바이/카트)
export const BOOST_MULT = 1.75; // 부스트 패드 배속
export const BOOST_MS = 1300; // 부스트 지속 시간
export const OFFROAD_MULT = 0.45; // 서킷에서 잔디/모래 주행 시 감속

export const PLAYER_RADIUS = 10; // 충돌/렌더 반경

// presence 위치 전송 주기 (ms).
export const NET_TICK = 80;

// 근접 대화(음성/영상/말풍선)가 연결되는 최대 거리 (타일).
export const PROXIMITY_TILES = 4.5;

export const EMOJIS = ["😀", "😂", "❤️", "👍", "🎉", "😮", "😢", "🔥", "👋", "🤔"];

// 캐릭터 커스터마이즈 옵션
export const SKIN_TONES = ["#ffe0bd", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"];
export const BODY_COLORS = [
  "#6c8cff", "#34d399", "#f472b6", "#fbbf24",
  "#f87171", "#a78bfa", "#38bdf8", "#94a3b8",
  "#e2e8f0", "#1f2937", "#0d9488", "#b45309",
];
export const PANTS_COLORS = [
  "#1f2937", "#374151", "#1d4ed8", "#7c2d12",
  "#4c1d95", "#065f46", "#9f1239", "#78716c",
];
export const HAIR_COLORS = [
  "#111827", "#4b3621", "#8b5a2b", "#d4a017",
  "#e5e7eb", "#dc2626", "#7c3aed", "#0ea5e9",
];
export const HAIRS: { key: string; label: string }[] = [
  { key: "short", label: "짧은머리" },
  { key: "long", label: "긴머리" },
  { key: "ponytail", label: "포니테일" },
  { key: "spiky", label: "삐죽머리" },
  { key: "bob", label: "단발" },
  { key: "curly", label: "곱슬" },
  { key: "none", label: "민머리" },
];
export const HATS: { key: string; label: string }[] = [
  { key: "none", label: "없음" },
  { key: "cap", label: "모자" },
  { key: "crown", label: "왕관" },
  { key: "band", label: "머리띠" },
  { key: "cat", label: "고양이귀" },
  { key: "beanie", label: "비니" },
  { key: "flower", label: "꽃" },
];
export const FACES: { key: string; label: string }[] = [
  { key: "smile", label: "스마일" },
  { key: "cool", label: "무표정" },
  { key: "wink", label: "윙크" },
  { key: "star", label: "반짝" },
  { key: "sleepy", label: "졸림" },
  { key: "surprised", label: "놀람" },
];
export const FACIAL_HAIRS: { key: string; label: string }[] = [
  { key: "none", label: "없음" },
  { key: "mustache", label: "콧수염" },
  { key: "beard", label: "턱수염" },
  { key: "goatee", label: "염소수염" },
];
export const GLASSES: { key: string; label: string }[] = [
  { key: "none", label: "없음" },
  { key: "round", label: "동그란 안경" },
  { key: "square", label: "사각 안경" },
  { key: "sunglasses", label: "선글라스" },
];
export const TOP_STYLES: { key: string; label: string }[] = [
  { key: "tshirt", label: "티셔츠" },
  { key: "hoodie", label: "후디" },
  { key: "suit", label: "정장" },
  { key: "stripe", label: "줄무늬" },
];
export const SPECIALS: { key: string; label: string }[] = [
  { key: "none", label: "없음" },
  { key: "cape", label: "히어로 망토" },
  { key: "robot", label: "로봇" },
];

// 과거에 저장된 "ghost" 등 더 이상 없는 코스튬 값 정규화.
export function normalizeSpecial(v: string | null | undefined): "none" | "cape" | "robot" {
  if (v === "cape" || v === "robot") return v;
  if (v === "ghost") return "robot";
  return "none";
}
export const SHOES_COLORS = [
  "#292524", "#7c2d12", "#f8fafc", "#dc2626",
  "#1d4ed8", "#15803d", "#facc15", "#a855f7",
];

export const STATUS_META: Record<
  string,
  { label: string; color: string; emoji: string }
> = {
  available: { label: "대화 가능", color: "#34d399", emoji: "🟢" },
  busy: { label: "바쁨", color: "#fbbf24", emoji: "🟡" },
  dnd: { label: "방해 금지", color: "#f87171", emoji: "🔴" },
};

export const GIFT_EMOJIS = ["🎁", "☕", "🍩", "🌸", "🍀", "⭐", "🧁", "🍫"];
