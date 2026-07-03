// 게임 전반에서 공유하는 타입들.

export type HatType = "none" | "cap" | "crown" | "band" | "cat" | "beanie" | "flower";
export type FaceType = "smile" | "cool" | "wink" | "star" | "sleepy" | "surprised";
export type HairType = "none" | "short" | "long" | "ponytail" | "spiky" | "bob" | "curly";
export type FacialHairType = "none" | "mustache" | "beard" | "goatee";
export type GlassesType = "none" | "round" | "square" | "sunglasses";
export type TopStyleType = "tshirt" | "hoodie" | "suit" | "stripe";
export type SpecialType = "none" | "cape" | "robot";
export type Direction = "down" | "up" | "left" | "right";
export type UserStatus = "available" | "busy" | "dnd";

// 캐릭터 외형 (프로필에 저장되는 값과 동일).
// 게더타운 구조: Base(피부/헤어/수염) · Clothing(상의/하의/신발) · Accessories(모자/안경) · Special
export interface CharacterAppearance {
  skin: string;
  color: string; // 상의 색
  topStyle: TopStyleType;
  pants: string; // 하의 색
  shoes: string; // 신발 색
  hair: HairType;
  hairColor: string;
  facialHair: FacialHairType;
  hat: HatType;
  glasses: GlassesType;
  face: FaceType;
  special: SpecialType;
}

// DB(profiles 테이블) 행 형태 — snake_case.
export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  skin: string;
  color: string;
  top_style: string | null;
  pants: string;
  shoes: string | null;
  hair: string;
  hair_color: string;
  facial_hair: string | null;
  hat: string;
  glasses: string | null;
  face: string;
  special: string | null;
  status: UserStatus;
  status_message: string | null;
}

// 네트워크로 주고받는 플레이어 상태(presence payload).
export interface PlayerState {
  id: string; // 유저 id 또는 게스트 임시 id
  name: string;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  onBike: boolean; // 탈것(오토바이/카트) 탑승 여부
  dancing: boolean; // Z 키 춤
  sitting: boolean; // 의자/소파/벤치에 앉음
  appearance: CharacterAppearance;
  status: UserStatus;
  statusMsg?: string;
  areaId: string | null; // 현재 프라이빗 영역
  spotlight: boolean; // 스포트라이트 타일 위
  hand: boolean; // 손들기
  camOn: boolean;
  guest: boolean;
}

// 이모지 / 채팅 브로드캐스트 메시지 (머리 위 말풍선).
export interface EmoteMessage {
  id: string;
  kind: "emoji" | "chat";
  value: string;
  at: number;
}

// 채팅 패널 메시지.
export type ChatScope = "room" | "area" | "dm";
export interface ChatMessage {
  id: string;
  scope: ChatScope;
  areaId?: string; // scope=area
  to?: string; // scope=dm (상대 id)
  from: string;
  fromName: string;
  text: string;
  at: number;
}

export interface SpaceRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_public: boolean;
  has_password: boolean;
  require_login: boolean;
  allowed_domains: string[] | null;
  guest_checkin: boolean;
  created_at: string;
}

export type SpaceRole = "admin" | "moderator" | "mapmaker" | "member";

export interface SpaceMember {
  space_id: string;
  user_id: string;
  role: SpaceRole;
  created_at: string;
  profile?: Pick<Profile, "display_name" | "skin" | "color"> | null;
}

export interface RoomRecord {
  id: string;
  space_id: string;
  name: string;
  template_key: string;
  map_data: unknown | null; // MapData JSON (에디터로 수정된 경우)
  sort_order: number;
  created_at: string;
}

export interface MeetingRecord {
  id: string;
  space_id: string;
  room_id: string;
  title: string;
  location_kind: "area" | "desk" | "spawn";
  location_ref: string | null; // areaId 또는 desk object id
  starts_at: string;
  ends_at: string;
  created_by: string;
  creator_name: string | null;
}

export interface DeskRecord {
  id: string;
  space_id: string;
  room_id: string;
  object_id: string;
  owner_id: string;
  owner_name: string;
  decor: { rug?: string; plant?: boolean; monitor?: string } | null;
}

export interface DeskNote {
  id: string;
  desk_object_id: string;
  to_user: string;
  from_name: string;
  message: string;
  gift: string | null;
  read: boolean;
  created_at: string;
}

export interface BulletinPost {
  id: string;
  object_id: string;
  author_name: string;
  content: string;
  url: string | null;
  created_at: string;
}
