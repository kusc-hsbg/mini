// 오브젝트 카탈로그 — 종류별 크기/충돌/기본 상호작용/에디터 표시 정보.
import type { InteractionKind } from "./maps";

export type ObjectKind =
  | "desk"
  | "chair"
  | "sofa"
  | "table"
  | "roundtable"
  | "plant"
  | "tree"
  | "whiteboard"
  | "tv"
  | "bookshelf"
  | "coffee"
  | "vending"
  | "arcade"
  | "piano"
  | "fountain"
  | "rug"
  | "bench"
  | "flowerbed"
  | "lamp"
  | "bulletin"
  | "sign"
  | "speaker"
  | "door"
  | "counter"
  | "campfire"
  | "cone"
  | "tires"
  | "podium"
  | "flag"
  | "grandstand"
  | "itembox"
  | "oil"
  | "custom";

export interface ObjectDef {
  label: string;
  w: number;
  h: number;
  solid: boolean;
  tall?: boolean; // 캐릭터 뒤로 지나갈 수 있는 상단부(전경 레이어)
  interaction?: InteractionKind;
  category: "가구" | "자연" | "미디어" | "놀이" | "장식" | "레이싱" | "기타";
}

export const OBJECT_DEFS: Record<ObjectKind, ObjectDef> = {
  desk: { label: "책상(데스크)", w: 2, h: 1, solid: true, category: "가구" },
  chair: { label: "의자", w: 1, h: 1, solid: false, category: "가구" },
  sofa: { label: "소파", w: 2, h: 1, solid: true, category: "가구" },
  table: { label: "테이블", w: 2, h: 1, solid: true, category: "가구" },
  roundtable: { label: "원형 테이블", w: 2, h: 2, solid: true, category: "가구" },
  counter: { label: "카운터", w: 1, h: 1, solid: true, category: "가구" },
  bookshelf: { label: "책장", w: 2, h: 1, solid: true, category: "가구" },
  plant: { label: "화분", w: 1, h: 1, solid: true, category: "자연" },
  tree: { label: "나무", w: 2, h: 2, solid: true, tall: true, category: "자연" },
  flowerbed: { label: "꽃밭", w: 1, h: 1, solid: false, category: "자연" },
  fountain: { label: "분수", w: 3, h: 3, solid: true, category: "자연" },
  campfire: { label: "모닥불", w: 1, h: 1, solid: true, category: "자연" },
  whiteboard: { label: "화이트보드", w: 2, h: 1, solid: true, interaction: "whiteboard", category: "미디어" },
  tv: { label: "TV/스크린", w: 2, h: 1, solid: true, interaction: "video", category: "미디어" },
  bulletin: { label: "게시판", w: 2, h: 1, solid: true, interaction: "bulletin", category: "미디어" },
  sign: { label: "안내판", w: 1, h: 1, solid: true, interaction: "note", category: "미디어" },
  speaker: { label: "스피커", w: 1, h: 1, solid: true, interaction: "sound", category: "미디어" },
  arcade: { label: "아케이드(테트리스)", w: 1, h: 1, solid: true, tall: true, interaction: "tetris", category: "놀이" },
  piano: { label: "피아노", w: 2, h: 1, solid: true, interaction: "piano", category: "놀이" },
  coffee: { label: "커피머신", w: 1, h: 1, solid: true, category: "가구" },
  vending: { label: "자판기", w: 1, h: 1, solid: true, tall: true, category: "가구" },
  rug: { label: "러그", w: 3, h: 2, solid: false, category: "장식" },
  bench: { label: "벤치", w: 2, h: 1, solid: true, category: "장식" },
  lamp: { label: "가로등/램프", w: 1, h: 1, solid: true, tall: true, category: "장식" },
  door: { label: "문(포털 표시)", w: 1, h: 1, solid: false, category: "기타" },
  cone: { label: "라바콘(장애물)", w: 1, h: 1, solid: true, category: "레이싱" },
  tires: { label: "타이어 방벽", w: 1, h: 1, solid: true, category: "레이싱" },
  podium: { label: "포디움(시상대)", w: 3, h: 2, solid: true, category: "레이싱" },
  flag: { label: "체커 깃발", w: 1, h: 1, solid: true, tall: true, category: "레이싱" },
  grandstand: { label: "관중석", w: 3, h: 2, solid: true, category: "레이싱" },
  itembox: { label: "아이템 박스(랜덤 효과)", w: 1, h: 1, solid: false, category: "레이싱" },
  oil: { label: "기름 웅덩이(미끄러짐)", w: 1, h: 1, solid: false, category: "레이싱" },
  custom: { label: "커스텀(이미지 URL)", w: 1, h: 1, solid: false, interaction: "none", category: "기타" },
};

export const OBJECT_KINDS = Object.keys(OBJECT_DEFS) as ObjectKind[];

export const INTERACTION_LABELS: Record<InteractionKind, string> = {
  website: "웹사이트 임베드",
  image: "이미지 표시",
  video: "영상(YouTube 등)",
  external: "외부 회의(Zoom/Meet)",
  note: "노트/안내문",
  whiteboard: "화이트보드",
  bulletin: "게시판",
  game: "외부 게임 임베드",
  sound: "사운드 재생",
  spotify: "Spotify 임베드",
  tetris: "테트리스",
  piano: "피아노 연주",
  none: "상호작용 없음",
};
