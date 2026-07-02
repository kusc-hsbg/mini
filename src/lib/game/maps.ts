// 맵 데이터 구조 + 타일 정의 + 충돌/영역 헬퍼.
//
// 게더타운 구조를 따라 Space → Room(Map) → Tile(32px) + Object 레이어로 구성.
// 타일 문자(바닥 레이어):
//   ,  잔디          ;  진한 잔디      d  흙길         s  모래
//   -  보도블럭      =  도로           ~  물(통과불가)
//   .  실내 타일     w  원목 마루      k  어두운 마루
//   c  카펫(파랑)    m  카펫(레드)     g  카펫(그린)
//   #  벽(통과불가)  x  공백(통과불가) B  오토바이 거치대
import { TILE } from "./constants";
import { OBJECT_DEFS, type ObjectKind } from "./objects";
import type { Direction } from "./types";

export interface TileInfo {
  color: string;
  solid: boolean;
  bike?: boolean;
  accent?: string;
  outdoor?: boolean;
}

export const TILE_INFO: Record<string, TileInfo> = {
  ",": { color: "#3e7d3a", solid: false, accent: "#468a41", outdoor: true },
  ";": { color: "#376f33", solid: false, accent: "#3e7d3a", outdoor: true },
  d: { color: "#8a6f4d", solid: false, accent: "#96794f", outdoor: true },
  s: { color: "#d9c07f", solid: false, accent: "#e2cb8f", outdoor: true },
  "-": { color: "#9aa0ab", solid: false, accent: "#8a909b", outdoor: true },
  "=": { color: "#4a5058", solid: false, accent: "#5a616b", outdoor: true },
  "~": { color: "#2f6db3", solid: true, accent: "#4a86c9", outdoor: true },
  ".": { color: "#c9c3b4", solid: false, accent: "#bfb9a9" },
  w: { color: "#b08a5a", solid: false, accent: "#a37f51" },
  k: { color: "#7e5f3c", solid: false, accent: "#74572f" },
  c: { color: "#5b74a8", solid: false, accent: "#546c9d" },
  m: { color: "#a85b5b", solid: false, accent: "#9d5454" },
  g: { color: "#5b9a6e", solid: false, accent: "#549064" },
  "#": { color: "#5b6273", solid: true, accent: "#787f92" },
  x: { color: "#12161f", solid: true },
  B: { color: "#4a5058", solid: false, bike: true, accent: "#fbbf24" },
};

// ---------- 맵 데이터 구조 ----------

export interface TilePoint {
  x: number;
  y: number;
}

export type InteractionKind =
  | "website"
  | "image"
  | "video"
  | "external"
  | "note"
  | "whiteboard"
  | "bulletin"
  | "game"
  | "sound"
  | "spotify"
  | "tetris"
  | "none";

export interface ObjectProps {
  url?: string; // website/image/video/external/sound/spotify/game/커스텀 이미지
  text?: string; // note 내용
  color?: string; // 색 변형(러그/소파 등)
  interaction?: InteractionKind; // 기본 상호작용 덮어쓰기
}

export interface MapObject {
  id: string;
  type: ObjectKind;
  x: number;
  y: number; // 타일 좌표(좌상단)
  dir?: Direction;
  name?: string;
  props?: ObjectProps;
}

export interface Portal {
  id: string;
  x: number;
  y: number;
  kind: "same" | "room" | "space";
  tx?: number; // same: 목적지 타일
  ty?: number;
  roomId?: string; // room: 방 id
  roomTemplate?: string; // room: 템플릿 키로 방 찾기(프리셋용)
  spaceSlug?: string; // space: 다른 스페이스 slug
  password?: string; // 비밀번호 문
  membersOnly?: boolean; // 멤버 전용 문
  label?: string;
}

export interface PrivateArea {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  maxOccupancy?: number;
  lockable?: boolean;
}

export interface MapLabel {
  x: number;
  y: number;
  text: string;
}

export interface MapData {
  key: string;
  name: string;
  description: string;
  tiles: string[];
  objects: MapObject[];
  areas: PrivateArea[];
  portals: Portal[];
  spawns: TilePoint[];
  spotlights: TilePoint[];
  labels: MapLabel[];
}

// ---------- 조회 헬퍼 ----------

export function mapSize(map: MapData) {
  const cols = Math.max(...map.tiles.map((r) => r.length));
  return { cols, rows: map.tiles.length };
}

export function mapPixelSize(map: MapData) {
  const { cols, rows } = mapSize(map);
  return { w: cols * TILE, h: rows * TILE };
}

export function tileAt(map: MapData, col: number, row: number): string {
  return map.tiles[row]?.[col] ?? "x";
}

// 오브젝트가 차지하는 타일 충돌 그리드를 만든다.
export function buildSolidGrid(map: MapData): boolean[][] {
  const { cols, rows } = mapSize(map);
  const grid: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      line.push(TILE_INFO[tileAt(map, c, r)]?.solid ?? true);
    }
    grid.push(line);
  }
  for (const o of map.objects) {
    const def = OBJECT_DEFS[o.type];
    if (!def || !def.solid) continue;
    for (let r = o.y; r < o.y + def.h; r++) {
      for (let c = o.x; c < o.x + def.w; c++) {
        if (grid[r]) grid[r][c] = true;
      }
    }
  }
  return grid;
}

export function isSolidPx(grid: boolean[][], px: number, py: number): boolean {
  const col = Math.floor(px / TILE);
  const row = Math.floor(py / TILE);
  if (row < 0 || row >= grid.length) return true;
  if (col < 0 || col >= grid[row].length) return true;
  return grid[row][col];
}

export function bikeZoneAt(map: MapData, px: number, py: number): boolean {
  const ch = tileAt(map, Math.floor(px / TILE), Math.floor(py / TILE));
  return !!TILE_INFO[ch]?.bike;
}

export function areaAtPx(map: MapData, px: number, py: number): PrivateArea | null {
  const c = px / TILE;
  const r = py / TILE;
  for (const a of map.areas) {
    if (c >= a.x && c < a.x + a.w && r >= a.y && r < a.y + a.h) return a;
  }
  return null;
}

export function spotlightAtPx(map: MapData, px: number, py: number): boolean {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  return map.spotlights.some((s) => s.x === c && s.y === r);
}

export function portalAtPx(map: MapData, px: number, py: number): Portal | null {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  return map.portals.find((p) => p.x === c && p.y === r) ?? null;
}

// 상호작용 가능한 가장 가까운 오브젝트 (중심 기준 거리, 픽셀).
export function nearestInteractive(
  map: MapData,
  px: number,
  py: number,
  maxDist = TILE * 1.8
): MapObject | null {
  let best: MapObject | null = null;
  let bestD = maxDist;
  for (const o of map.objects) {
    const def = OBJECT_DEFS[o.type];
    if (!def) continue;
    const kind = o.props?.interaction ?? def.interaction;
    if (!kind || kind === "none") {
      // 데스크는 상호작용(자리 지정/쪽지) 대상
      if (o.type !== "desk") continue;
    }
    const cx = (o.x + def.w / 2) * TILE;
    const cy = (o.y + def.h / 2) * TILE;
    const d = Math.hypot(cx - px, cy - py) - (Math.max(def.w, def.h) - 1) * TILE * 0.4;
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

export function objectInteraction(o: MapObject): InteractionKind {
  const def = OBJECT_DEFS[o.type];
  return o.props?.interaction ?? def?.interaction ?? "none";
}

export function spawnPoint(map: MapData, index = 0): TilePoint {
  const s = map.spawns[index % Math.max(1, map.spawns.length)] ?? map.spawns[0];
  return s ?? { x: 2, y: 2 };
}

// ---------- 맵 해석 ----------

import { PRESET_MAPS } from "./presets";

export const MAP_LIST = Object.values(PRESET_MAPS);

export function getPreset(key: string | null | undefined): MapData {
  return (key && PRESET_MAPS[key]) || PRESET_MAPS.plaza;
}

// 방 레코드의 map_data(에디터 수정본)가 있으면 그것을, 없으면 템플릿을 사용.
export function resolveMap(templateKey: string, mapData: unknown | null): MapData {
  if (mapData && typeof mapData === "object" && (mapData as MapData).tiles) {
    const m = mapData as MapData;
    // 누락 필드 보정
    return {
      key: m.key ?? templateKey,
      name: m.name ?? "커스텀 맵",
      description: m.description ?? "",
      tiles: m.tiles,
      objects: m.objects ?? [],
      areas: m.areas ?? [],
      portals: m.portals ?? [],
      spawns: m.spawns?.length ? m.spawns : [{ x: 2, y: 2 }],
      spotlights: m.spotlights ?? [],
      labels: m.labels ?? [],
    };
  }
  return getPreset(templateKey);
}
