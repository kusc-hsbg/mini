// Supabase Realtime 브로드캐스트 이벤트 정의.
import type { ChatMessage, EmoteMessage, PlayerState } from "@/lib/game/types";

export interface SignalData {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  bye?: boolean;
  meta?: { screenId?: string | null };
}

export interface RtEvents {
  move: PlayerState;
  emote: { id: string; emote: EmoteMessage };
  chat: ChatMessage;
  reaction: { from: string; fromName: string; emoji: string };
  wave: { from: string; fromName: string; to: string };
  knock: { from: string; fromName: string; areaId: string };
  "knock-result": { to: string; areaId: string; allow: boolean; byName: string };
  lock: { areaId: string; locked: boolean; byName: string };
  mod: { kind: "kick" | "ban" | "mute"; target: string; byName: string };
  signal: { from: string; to: string; data: SignalData };
  wb: { board: string; op: WbOp };
  "map-update": { by: string };
  "desk-update": { by: string };
  race: {
    from: string;
    name: string;
    kind: "start" | "lap" | "finish";
    lap: number;
    laps: number;
    lapMs?: number;
    totalMs?: number;
    bestLapMs?: number;
  };
}

export type RtEventName = keyof RtEvents;

// 화이트보드 오퍼레이션
export interface WbStroke {
  color: string;
  size: number;
  points: number[]; // [x0,y0,x1,y1,...] 0..1 정규화 좌표
  erase?: boolean;
}
export type WbOp =
  | { kind: "stroke"; stroke: WbStroke }
  | { kind: "text"; x: number; y: number; text: string; color: string }
  | { kind: "clear" };

// 스페이스 컨트롤 채널 (게스트 체크인)
export interface ControlEvents {
  "checkin-request": { key: string; name: string };
  "checkin-result": { key: string; allow: boolean; byName: string };
}
