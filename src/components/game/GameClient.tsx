"use client";

// 방(Room) 화면 오케스트레이터 — 엔진 + 실시간 + HUD/패널/모달.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { GameEngine, type RaceItemKind, type RaceState } from "@/lib/game/engine";
import {
  MapData,
  MapObject,
  Portal,
  PrivateArea,
  objectInteraction,
  resolveMap,
} from "@/lib/game/maps";
import { EMOJIS, PROXIMITY_TILES, TILE, normalizeSpecial } from "@/lib/game/constants";
import { OBJECT_DEFS } from "@/lib/game/objects";
import { playPianoNote } from "@/lib/game/audio";
import { useRoomChannel } from "@/hooks/useRoomChannel";
import { useControlChannel, type ControlChannel } from "@/hooks/useControlChannel";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { logEvent } from "@/lib/analytics";
import { banTarget, blockTarget, sendDm, setStatus as setStatusAction, unblockTarget } from "@/app/actions";
import type { RtEventName, RtEvents, WbOp } from "@/lib/realtime/protocol";
import type {
  CharacterAppearance,
  ChatMessage,
  DeskNote,
  DeskRecord,
  EmoteMessage,
  FaceType,
  HairType,
  HatType,
  PlayerState,
  Profile,
  RoomRecord,
  SpaceRecord,
  SpaceRole,
  UserStatus,
  MeetingRecord,
} from "@/lib/game/types";

import Toolbar from "./Toolbar";
import ParticipantsPanel from "./ParticipantsPanel";
import ChatPanel, { type ChatTab } from "./ChatPanel";
import MeetingsPanel from "./MeetingsPanel";
import ObjectModal from "./ObjectModal";
import WhiteboardModal from "./WhiteboardModal";
import BulletinModal from "./BulletinModal";
import TetrisModal from "./TetrisModal";
import PianoModal from "./PianoModal";
import DeskModal from "./DeskModal";
import RaceHud, { fmtMs, type LeaderEntry } from "./RaceHud";
import { Modal, ToastStack, type ToastItem } from "./ui";

const GUEST_KEY = "pixeltown:guest-appearance";
const GUEST_ID_KEY = "pixeltown:guest-id";
const BLOCK_KEY = "pixeltown:blocked";

interface Identity {
  id: string;
  name: string;
  appearance: CharacterAppearance;
  guest: boolean;
}

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "g_" + Math.random().toString(36).slice(2);
}

function resolveGuestIdentity(): Identity {
  let id = localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = "guest_" + randomId();
    localStorage.setItem(GUEST_ID_KEY, id);
  }
  let appearance: CharacterAppearance = {
    skin: "#f1c27d",
    color: "#6c8cff",
    topStyle: "tshirt",
    pants: "#1f2937",
    shoes: "#292524",
    hair: "short",
    hairColor: "#4b3621",
    facialHair: "none",
    hat: "none",
    glasses: "none",
    face: "smile",
    special: "none",
  };
  let name = "게스트-" + id.slice(-4);
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (raw) {
      const g = JSON.parse(raw);
      appearance = {
        ...appearance,
        skin: g.skin ?? appearance.skin,
        color: g.color ?? appearance.color,
        topStyle: g.topStyle ?? "tshirt",
        pants: g.pants ?? appearance.pants,
        shoes: g.shoes ?? appearance.shoes,
        hair: (g.hair as HairType) ?? "short",
        hairColor: g.hairColor ?? g.hair_color ?? appearance.hairColor,
        facialHair: g.facialHair ?? "none",
        hat: (g.hat as HatType) ?? "none",
        glasses: g.glasses ?? "none",
        face: (g.face as FaceType) ?? "smile",
        special: normalizeSpecial(g.special),
        headImg: typeof g.headImg === "string" ? g.headImg : "none",
      };
      if (g.name) name = g.name;
    }
  } catch {}
  return { id, name, appearance, guest: true };
}

type ModalState =
  | { kind: "object"; obj: MapObject }
  | { kind: "whiteboard"; obj: MapObject }
  | { kind: "bulletin"; obj: MapObject }
  | { kind: "tetris" }
  | { kind: "piano"; obj: MapObject }
  | { kind: "desk"; obj: MapObject }
  | { kind: "portal-pw"; portal: Portal }
  | { kind: "notes" }
  | null;

type PanelState = "participants" | "chat" | "meetings" | null;

export default function GameClient({
  space,
  room,
  rooms,
  profile,
  isMember,
  role,
  configured,
  initialBlocks,
  initialSpawn,
}: {
  space: SpaceRecord;
  room: RoomRecord;
  rooms: RoomRecord[];
  profile: Profile | null;
  isMember: boolean;
  role: SpaceRole | null;
  configured: boolean;
  initialBlocks: string[];
  initialSpawn: { x: number; y: number } | null;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [engineReady, setEngineReady] = useState(false);

  const multiplayer = configured;
  const isOwner = profile?.id === space.owner_id;
  const isMod = isOwner || role === "admin" || role === "moderator";
  const canEdit = isOwner || role === "admin" || role === "moderator" || role === "mapmaker";

  // ----- 신원 -----
  const [identity, setIdentity] = useState<Identity | null>(null);
  useEffect(() => {
    if (profile) {
      setIdentity({
        id: profile.id,
        name: profile.display_name || "Player",
        guest: false,
        appearance: {
          skin: profile.skin,
          color: profile.color,
          topStyle: (profile.top_style as CharacterAppearance["topStyle"]) ?? "tshirt",
          pants: profile.pants ?? "#1f2937",
          shoes: profile.shoes ?? "#292524",
          hair: (profile.hair as HairType) ?? "short",
          hairColor: profile.hair_color ?? "#4b3621",
          facialHair: (profile.facial_hair as CharacterAppearance["facialHair"]) ?? "none",
          hat: profile.hat as HatType,
          glasses: (profile.glasses as CharacterAppearance["glasses"]) ?? "none",
          face: profile.face as FaceType,
          special: normalizeSpecial(profile.special),
          headImg: profile.head_img ?? "none",
        },
      });
    } else {
      setIdentity(resolveGuestIdentity());
    }
  }, [profile]);

  // ----- 주요 상태 -----
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatTab, setChatTab] = useState<ChatTab>({ kind: "room" });
  const [unread, setUnread] = useState(0);
  const [unreadDms, setUnreadDms] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [currentArea, setCurrentArea] = useState<PrivateArea | null>(null);
  const [lockedAreas, setLockedAreas] = useState<Set<string>>(new Set());
  const [status, setStatusState] = useState<UserStatus>(profile?.status ?? "available");
  const [statusMsg, setStatusMsg] = useState(profile?.status_message ?? "");
  const [hand, setHand] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [desks, setDesks] = useState<DeskRecord[]>([]);
  const [notes, setNotes] = useState<DeskNote[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set(initialBlocks));
  const [followId, setFollowId] = useState<string | null>(null);
  const [hintObj, setHintObj] = useState<MapObject | null>(null);
  const [liveMap, setLiveMap] = useState<MapData>(() => resolveMap(room.template_key, room.map_data));
  const [mapEditorKey, setMapEditorKey] = useState(0);
  const [raceState, setRaceState] = useState<RaceState | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);

  const autoBusyRef = useRef(false);
  const myLocksRef = useRef<Set<string>>(new Set());
  // 노크 승인을 받은 영역: 만료 시각까지 lock 재브로드캐스트를 무시 (승인 직후 재잠김 방지)
  const knockGraceRef = useRef<Map<string, number>>(new Map());
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const statusRef = useRef(status);
  statusRef.current = status;
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const chatTabRef = useRef(chatTab);
  chatTabRef.current = chatTab;
  const lockedRef = useRef(lockedAreas);
  lockedRef.current = lockedAreas;
  const soundAudiosRef = useRef(new Map<string, HTMLAudioElement>());
  const chatCountRef = useRef(0);
  const convSecondsRef = useRef(0);
  const dmLoadedRef = useRef(new Set<string>());
  const wbSubsRef = useRef(new Set<(board: string, op: WbOp) => void>());

  // ----- 토스트 -----
  const addToast = useCallback((text: string, actionLabel?: string, action?: () => void) => {
    const id = randomId();
    setToasts((ts) => [...ts.slice(-3), { id, text, actionLabel, action }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 7000);
  }, []);

  // ----- 실시간 채널 -----
  const channelKey = `${space.id}:${room.id}`;
  const channel = useRoomChannel(channelKey, identity?.id ?? "pending", multiplayer && !!identity, {
    onRosterSync: (list) => {
      engineRef.current?.reconcileRoster(list);
      const self = engineRef.current?.getSelf();
      setPlayers(self ? [self, ...list.filter((p) => p.id !== self.id)] : list);
    },
    onEvent: (event, payload) => handleEvent(event, payload),
  });
  const channelRef = useRef(channel);
  channelRef.current = channel;

  // ----- 게스트 체크인 승인 (멤버) -----
  const controlRef = useRef<ControlChannel | null>(null);
  const control = useControlChannel(
    space.id,
    multiplayer && isMember && space.guest_checkin,
    {
      onCheckinRequest: (r) => {
        addToast(`🚪 ${r.name}님이 스페이스 입장을 요청했어요`, "승인", () => {
          controlRef.current?.send("checkin-result", {
            key: r.key,
            allow: true,
            byName: identity?.name ?? "멤버",
          });
        });
      },
    }
  );
  controlRef.current = control;

  const pushPresence = useCallback(() => {
    const self = engineRef.current?.getSelf();
    if (self && multiplayer) channelRef.current.track(self);
  }, [multiplayer]);

  // ----- 이벤트 핸들러 -----
  function handleEvent<K extends RtEventName>(event: K, payload: RtEvents[K]) {
    const engine = engineRef.current;
    const myId = identity?.id;
    switch (event) {
      case "move": {
        const p = payload as PlayerState;
        if (!blockedRef.current.has(p.id)) engine?.upsertOther(p);
        break;
      }
      case "emote": {
        const { id, emote } = payload as RtEvents["emote"];
        if (!blockedRef.current.has(id)) engine?.addEmote(id, emote as EmoteMessage);
        break;
      }
      case "chat": {
        const m = payload as ChatMessage;
        if (blockedRef.current.has(m.from)) break;
        const self = engine?.getSelf();
        const relevant =
          m.scope === "room" ||
          (m.scope === "area" && m.areaId === self?.areaId) ||
          (m.scope === "dm" && m.to === myId);
        if (!relevant) break;
        setMessages((prev) => [...prev.slice(-300), m]);
        if (m.scope !== "dm") {
          engine?.addEmote(m.from, { id: m.id, kind: "chat", value: m.text, at: m.at });
        }
        const tab = chatTabRef.current;
        const viewing =
          panelRef.current === "chat" &&
          ((m.scope === "room" && tab.kind === "room") ||
            (m.scope === "area" && tab.kind === "area") ||
            (m.scope === "dm" && tab.kind === "dm" && tab.to === m.from));
        if (!viewing) {
          setUnread((u) => u + 1);
          if (m.scope === "dm") setUnreadDms((s) => new Set(s).add(m.from));
        }
        break;
      }
      case "wave": {
        const w = payload as RtEvents["wave"];
        if (w.to !== myId || blockedRef.current.has(w.from)) break;
        if (statusRef.current === "dnd") break;
        addToast(`👋 ${w.fromName}님이 손을 흔들었어요!`, "이동", () => {
          engineRef.current?.walkToPlayer(w.from);
        });
        break;
      }
      case "knock": {
        const k = payload as RtEvents["knock"];
        const self = engine?.getSelf();
        if (self?.areaId !== k.areaId) break;
        addToast(`🚪 ${k.fromName}님이 입장을 요청했어요`, "승인", () => {
          channelRef.current.send("knock-result", {
            to: k.from,
            areaId: k.areaId,
            allow: true,
            byName: self?.name ?? "",
          });
        });
        break;
      }
      case "knock-result": {
        const r = payload as RtEvents["knock-result"];
        if (r.to !== myId) break;
        if (r.allow) {
          // 30초 동안은 잠금 재브로드캐스트가 와도 다시 잠그지 않는다.
          knockGraceRef.current.set(r.areaId, Date.now() + 30_000);
          setLockedAreas((prev) => {
            const next = new Set(prev);
            next.delete(r.areaId);
            return next;
          });
          addToast(`✅ ${r.byName}님이 입장을 승인했어요 (30초 동안 입장 가능)`);
        } else {
          addToast("❌ 입장이 거절되었습니다");
        }
        break;
      }
      case "lock": {
        const l = payload as RtEvents["lock"];
        if (l.locked) {
          const grace = knockGraceRef.current.get(l.areaId);
          if (grace && Date.now() < grace) break; // 승인 유예 중 — 재잠김 무시
          if (grace) knockGraceRef.current.delete(l.areaId);
        }
        setLockedAreas((prev) => {
          const next = new Set(prev);
          if (l.locked) next.add(l.areaId);
          else next.delete(l.areaId);
          return next;
        });
        break;
      }
      case "mod": {
        const m = payload as RtEvents["mod"];
        if (m.target !== myId) break;
        alert(m.kind === "kick" ? "방에서 내보내졌습니다." : "이 스페이스에서 차단되었습니다.");
        router.replace("/spaces");
        break;
      }
      case "piano": {
        const p = payload as RtEvents["piano"];
        if (p.from === myId || blockedRef.current.has(p.from)) break;
        const self = engine?.getSelf();
        if (!self) break;
        // 거리 감쇠 — 가까울수록 크게 (12타일 밖은 안 들림)
        const d = Math.hypot(p.x - self.x, p.y - self.y);
        const vol = Math.max(0, 1 - d / (TILE * 12));
        if (vol > 0.02) {
          playPianoNote(p.note, vol);
          engine?.addEmote(p.from, { id: `pn-${p.note}-${Date.now()}`, kind: "emoji", value: "🎵", at: Date.now() });
        }
        break;
      }
      case "wb": {
        const w = payload as RtEvents["wb"];
        wbSubsRef.current.forEach((fn) => fn(w.board, w.op));
        break;
      }
      case "map-update": {
        refetchMap();
        addToast("🛠️ 맵이 업데이트되었습니다");
        break;
      }
      case "desk-update": {
        refetchDesks();
        break;
      }
      case "race": {
        const r = payload as RtEvents["race"];
        if (blockedRef.current.has(r.from)) break;
        if (r.kind === "finish" && r.totalMs != null) {
          applyRaceRecord(r.from, r.name, r.totalMs);
          addToast(`🏁 ${r.name}님이 ${r.laps}랩 완주! ${fmtMs(r.totalMs)}`);
        } else if (r.kind === "start") {
          addToast(`🚦 ${r.name}님이 레이스를 시작했어요!`);
        }
        break;
      }
    }
  }

  const applyRaceRecord = useCallback((id: string, name: string, totalMs: number) => {
    setLeaderboard((prev) => {
      const next = [...prev];
      const existing = next.find((e) => e.id === id);
      if (existing) {
        existing.finishes++;
        existing.name = name;
        if (totalMs < existing.bestTotalMs) existing.bestTotalMs = totalMs;
      } else {
        next.push({ id, name, bestTotalMs: totalMs, finishes: 1 });
      }
      return next;
    });
  }, []);

  const refetchMap = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const { data } = await supabase
      .from("rooms")
      .select("template_key, map_data")
      .eq("id", room.id)
      .maybeSingle();
    if (data) {
      const m = resolveMap(data.template_key, data.map_data);
      setLiveMap(m);
      engineRef.current?.setMap(m);
      setMapEditorKey((k) => k + 1);
    }
  }, [room.id]);

  const refetchDesks = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const { data } = await supabase.from("desks").select("*").eq("room_id", room.id);
    const list = (data as DeskRecord[]) ?? [];
    setDesks(list);
    engineRef.current?.setDeskOwners(new Map(list.map((d) => [d.object_id, d.owner_name])));
  }, [room.id]);

  // ----- 엔진 부팅 -----
  useEffect(() => {
    if (!identity || !canvasRef.current) return;
    const canvas = canvasRef.current;

    const engine = new GameEngine(
      canvas,
      liveMap,
      identity.id,
      identity.name,
      identity.appearance,
      {
        onState: (s) => {
          if (multiplayer) channelRef.current.send("move", s);
        },
        onAreaChange: (area) => {
          setCurrentArea(area);
          // 내가 잠근 영역에서 나가면 자동 해제
          if (!area || !myLocksRef.current.has(area.id)) {
            myLocksRef.current.forEach((id) => {
              if (id !== area?.id) {
                myLocksRef.current.delete(id);
                setLockedAreas((prev) => {
                  const next = new Set(prev);
                  next.delete(id);
                  return next;
                });
                channelRef.current.send("lock", { areaId: id, locked: false, byName: identity.name });
              }
            });
          }
          pushPresence();
        },
        onPortal: (portal) => handlePortal(portal),
        onInteractHint: (obj) => setHintObj(obj),
        onPlayerClick: () => setPanel("participants"),
        onRace: (ev) => {
          if (ev.kind === "start") {
            addToast(`🚦 레이스 시작! ${ev.laps}랩 완주하세요`);
            if (multiplayer)
              channelRef.current.send("race", {
                from: identity.id,
                name: identity.name,
                kind: "start",
                lap: ev.lap,
                laps: ev.laps,
              });
          } else if (ev.kind === "lap" && ev.lapMs != null) {
            addToast(`⏱️ LAP ${ev.lap - 1} 완료 — ${fmtMs(ev.lapMs)}`);
          } else if (ev.kind === "finish" && ev.totalMs != null) {
            addToast(`🏆 완주! 총 기록 ${fmtMs(ev.totalMs)} — 포디움에 올라가보세요!`);
            applyRaceRecord(identity.id, identity.name, ev.totalMs);
            if (multiplayer)
              channelRef.current.send("race", {
                from: identity.id,
                name: identity.name,
                kind: "finish",
                lap: ev.lap,
                laps: ev.laps,
                lapMs: ev.lapMs,
                totalMs: ev.totalMs,
                bestLapMs: ev.bestLapMs,
              });
          }
        },
        onItem: (kind: RaceItemKind) => {
          const meta: Record<RaceItemKind, [string, string]> = {
            turbo: ["🚀 터보! 2초간 초가속", "🚀"],
            boost: ["⚡ 부스트!", "⚡"],
            slow: ["🐢 꽝... 슬로우에 걸렸어요", "🐢"],
            oil: ["🛢️ 기름에 미끄러졌다!", "💫"],
          };
          const [text, emoji] = meta[kind];
          addToast(text);
          sendEmote("emoji", emoji);
        },
        onAreaBlocked: (area, reason) => {
          if (reason === "locked") {
            addToast(`🔒 "${area.name}" 영역이 잠겨 있어요`, "노크", () => {
              channelRef.current.send("knock", {
                from: identity.id,
                fromName: identity.name,
                areaId: area.id,
              });
              addToast("🚪 노크했습니다. 승인을 기다려주세요...");
            });
          } else {
            addToast(`👥 "${area.name}" 영역 정원이 가득 찼어요 (최대 ${area.maxOccupancy}명)`);
          }
        },
      },
      { spawn: initialSpawn ?? undefined, guest: identity.guest, status: statusRef.current }
    );
    engineRef.current = engine;

    const resize = () => {
      const el = wrapRef.current;
      if (!el) return;
      canvas.width = el.clientWidth;
      canvas.height = el.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    engine.start();
    setEngineReady(true);

    return () => {
      window.removeEventListener("resize", resize);
      engine.stop();
      engineRef.current = null;
      setEngineReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, room.id]);

  // 잠금 상태를 엔진에 반영
  useEffect(() => {
    engineRef.current?.setLockedAreas(lockedAreas);
  }, [lockedAreas, engineReady]);

  // 모달 열림 → 게임 입력 잠금
  useEffect(() => {
    if (engineRef.current) engineRef.current.inputLocked = modal !== null;
  }, [modal]);

  // ----- 포털 -----
  function handlePortal(portal: Portal) {
    const engine = engineRef.current;
    if (!engine) return;
    if (portal.membersOnly && !isMember && !isOwner) {
      addToast("🔐 멤버 전용 문입니다. 스페이스 멤버만 통과할 수 있어요.");
      return;
    }
    if (portal.password) {
      setModal({ kind: "portal-pw", portal });
      return;
    }
    executePortal(portal);
  }

  function executePortal(portal: Portal) {
    const engine = engineRef.current;
    if (!engine) return;
    if (portal.kind === "same" && portal.tx != null && portal.ty != null) {
      engine.teleport(portal.tx, portal.ty);
    } else if (portal.kind === "room") {
      const target =
        (portal.roomId && rooms.find((r) => r.id === portal.roomId)) ||
        (portal.roomTemplate && rooms.find((r) => r.template_key === portal.roomTemplate));
      if (target && target.id !== room.id) {
        router.push(`/s/${space.id}/${target.id}`);
      } else if (!target) {
        addToast("🌀 연결된 방을 찾을 수 없어요");
      }
    } else if (portal.kind === "space" && portal.spaceSlug) {
      router.push(`/s/${portal.spaceSlug}`);
    }
  }

  // ----- presence 주기 갱신 -----
  useEffect(() => {
    if (!multiplayer || !channel.ready) return;
    pushPresence();
    const t = setInterval(pushPresence, 3000);
    return () => clearInterval(t);
  }, [multiplayer, channel.ready, pushPresence]);

  // ----- 참가자 목록 주기 갱신 -----
  useEffect(() => {
    const t = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      setPlayers([e.getSelf(), ...e.getOthers()]);
    }, 2000);
    return () => clearInterval(t);
  }, []);

  // ----- 레이스 HUD 폴링 (서킷 맵에서만) -----
  useEffect(() => {
    if (!liveMap.race) {
      setRaceState(null);
      return;
    }
    const t = setInterval(() => {
      setRaceState(engineRef.current?.getRaceState() ?? null);
    }, 100);
    return () => clearInterval(t);
  }, [liveMap, engineReady]);

  // ----- 근접 대화 시간 측정 (인사이트 conv_seconds) -----
  useEffect(() => {
    if (!multiplayer) return;
    const t = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      const self = e.getSelf();
      let near = 0;
      for (const p of e.getOthers()) {
        if (blockedRef.current.has(p.id)) continue;
        if (self.areaId && p.areaId === self.areaId) near++;
        else if (!self.areaId && !p.areaId && Math.hypot(p.x - self.x, p.y - self.y) <= PROXIMITY_TILES * TILE) near++;
      }
      if (near > 0) convSecondsRef.current += 0.8;
    }, 800);
    return () => clearInterval(t);
  }, [multiplayer]);

  // ----- 탭 복귀 시 presence 즉시 갱신 -----
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") pushPresence();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pushPresence]);

  // ----- 데스크/쪽지 로드 -----
  useEffect(() => {
    if (!multiplayer) return;
    refetchDesks();
  }, [multiplayer, refetchDesks, engineReady]);

  useEffect(() => {
    if (!multiplayer || !profile) return;
    (async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const { data } = await supabase
        .from("desk_notes")
        .select("*")
        .eq("to_user", profile.id)
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(20);
      setNotes((data as DeskNote[]) ?? []);
    })();
  }, [multiplayer, profile]);

  // ----- 게스트 밴 확인 -----
  useEffect(() => {
    if (!multiplayer || !identity?.guest) return;
    (async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const { data } = await supabase
        .from("space_bans")
        .select("id")
        .eq("space_id", space.id)
        .eq("target_key", identity.id)
        .maybeSingle();
      if (data) {
        alert("이 스페이스에서 차단되었습니다.");
        router.replace("/spaces");
      }
    })();
  }, [multiplayer, identity, space.id, router]);

  // ----- 분석 로깅 -----
  useEffect(() => {
    if (!multiplayer || !identity) return;
    logEvent(space.id, room.id, identity.id, identity.name, "join");
    const flush = setInterval(() => {
      if (chatCountRef.current > 0) {
        logEvent(space.id, room.id, identity.id, identity.name, "chat", chatCountRef.current);
        chatCountRef.current = 0;
      }
      if (convSecondsRef.current > 5) {
        logEvent(space.id, room.id, identity.id, identity.name, "conv_seconds", Math.round(convSecondsRef.current));
        convSecondsRef.current = 0;
      }
    }, 60_000);
    const peak = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      const all = [e.getSelf(), ...e.getOthers()];
      const minId = all.map((p) => p.id).sort()[0];
      if (minId === identity.id) {
        logEvent(space.id, room.id, identity.id, identity.name, "online", all.length);
      }
    }, 300_000);
    return () => {
      clearInterval(flush);
      clearInterval(peak);
      logEvent(space.id, room.id, identity.id, identity.name, "leave");
    };
  }, [multiplayer, identity, space.id, room.id]);

  // ----- 회의 자동 상태(Busy) -----
  useEffect(() => {
    if (!multiplayer) return;
    const check = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("meetings")
        .select("*")
        .eq("space_id", space.id)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso)
        .limit(10);
      const active = (data as MeetingRecord[]) ?? [];
      const self = engineRef.current?.getSelf();
      const inMeeting = active.some(
        (m) =>
          m.room_id === room.id &&
          m.location_kind === "area" &&
          !!self?.areaId &&
          m.location_ref === self.areaId
      );
      if (inMeeting && statusRef.current === "available") {
        autoBusyRef.current = true;
        applyStatus("busy", statusMsg, true);
      } else if (!inMeeting && autoBusyRef.current && statusRef.current === "busy") {
        autoBusyRef.current = false;
        applyStatus("available", statusMsg, true);
      }
    };
    const t = setInterval(check, 45_000);
    check();
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiplayer, space.id, room.id]);

  // ----- 사운드 오브젝트 -----
  useEffect(() => {
    const audios = soundAudiosRef.current;
    if (!soundOn) {
      audios.forEach((a) => a.pause());
      return;
    }
    const soundObjs = liveMap.objects.filter(
      (o) => objectInteraction(o) === "sound" && o.props?.url
    );
    const t = setInterval(() => {
      const self = engineRef.current?.getSelf();
      if (!self) return;
      for (const o of soundObjs) {
        let audio = audios.get(o.id);
        if (!audio) {
          audio = new Audio(o.props!.url!);
          audio.loop = true;
          audio.crossOrigin = "anonymous";
          audios.set(o.id, audio);
        }
        const d = Math.hypot((o.x + 0.5) * TILE - self.x, (o.y + 0.5) * TILE - self.y);
        const vol = Math.max(0, 1 - d / (TILE * 9));
        if (vol > 0.02) {
          audio.volume = Math.min(1, vol);
          if (audio.paused) audio.play().catch(() => {});
        } else if (!audio.paused) {
          audio.pause();
        }
      }
    }, 700);
    return () => {
      clearInterval(t);
      audios.forEach((a) => a.pause());
    };
  }, [soundOn, liveMap]);

  useEffect(() => {
    const audios = soundAudiosRef.current;
    return () => {
      audios.forEach((a) => {
        a.pause();
        a.src = "";
      });
      audios.clear();
    };
  }, []);

  // ----- 키 입력 (이모지/상호작용/미니맵) -----
  const sendEmote = useCallback(
    (kind: "emoji" | "chat", value: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      const self = engine.getSelf();
      const e: EmoteMessage = { id: randomId(), kind, value, at: Date.now() };
      engine.addEmote(self.id, e);
      if (multiplayer) channelRef.current.send("emote", { id: self.id, emote: e });
    },
    [multiplayer]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || modal) return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        if (EMOJIS[idx]) sendEmote("emoji", EMOJIS[idx]);
      } else if (e.key === "0" && EMOJIS[9]) {
        sendEmote("emoji", EMOJIS[9]);
      } else if (e.key.toLowerCase() === "x") {
        const obj = engineRef.current?.getHintObject();
        if (obj) openObject(obj);
      } else if (e.key.toLowerCase() === "m") {
        const eng = engineRef.current;
        if (eng) eng.showMinimap = !eng.showMinimap;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendEmote, modal]);

  function openObject(obj: MapObject) {
    if (obj.type === "desk") {
      setModal({ kind: "desk", obj });
      return;
    }
    // 좌석: 앉기/일어나기 토글
    if (obj.type === "chair" || obj.type === "sofa" || obj.type === "bench") {
      const e = engineRef.current;
      if (!e) return;
      if (e.isSitting()) {
        e.standUp();
      } else if (e.sitOn(obj)) {
        addToast("🪑 앉았어요 — 이동 키나 X 키로 일어나요");
      }
      return;
    }
    // 커피/자판기: 아이템 이모트
    if (obj.type === "coffee") {
      sendEmote("emoji", "☕");
      addToast("☕ 커피를 내렸어요");
      return;
    }
    if (obj.type === "vending") {
      const snacks = ["🥤", "🍫", "🍩", "🍬", "🧃"];
      sendEmote("emoji", snacks[Math.floor(Math.random() * snacks.length)]);
      addToast("🎰 자판기에서 간식이 나왔어요!");
      return;
    }
    const kind = objectInteraction(obj);
    switch (kind) {
      case "whiteboard":
        setModal({ kind: "whiteboard", obj });
        break;
      case "bulletin":
        setModal({ kind: "bulletin", obj });
        break;
      case "tetris":
        setModal({ kind: "tetris" });
        break;
      case "piano":
        setModal({ kind: "piano", obj });
        break;
      case "sound":
        if (!soundOn) {
          setSoundOn(true);
          addToast("🔊 주변 사운드를 켰어요 (가까울수록 크게 들려요)");
        } else {
          setSoundOn(false);
          addToast("🔈 주변 사운드를 껐어요");
        }
        break;
      case "none":
        break;
      default:
        setModal({ kind: "object", obj });
    }
  }

  // ----- 채팅 전송 -----
  function sendChat(tab: ChatTab, text: string) {
    const engine = engineRef.current;
    if (!engine || !identity) return;
    const self = engine.getSelf();
    const msg: ChatMessage = {
      id: randomId(),
      scope: tab.kind === "dm" ? "dm" : tab.kind,
      areaId: tab.kind === "area" ? self.areaId ?? undefined : undefined,
      to: tab.kind === "dm" ? tab.to : undefined,
      from: identity.id,
      fromName: identity.name,
      text,
      at: Date.now(),
    };
    setMessages((prev) => [...prev.slice(-300), msg]);
    if (multiplayer) channelRef.current.send("chat", msg);
    if (msg.scope !== "dm") engine.addEmote(identity.id, { id: msg.id, kind: "chat", value: text, at: msg.at });
    if (msg.scope === "dm" && !identity.guest && msg.to && !msg.to.startsWith("guest_")) {
      sendDm({ spaceId: space.id, toId: msg.to, fromName: identity.name, body: text });
    }
    chatCountRef.current++;
  }

  // DM 히스토리 로드
  useEffect(() => {
    if (chatTab.kind !== "dm" || !profile || identity?.guest) return;
    const partner = chatTab.to;
    if (partner.startsWith("guest_") || dmLoadedRef.current.has(partner)) return;
    dmLoadedRef.current.add(partner);
    (async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const { data } = await supabase
        .from("dm_messages")
        .select("*")
        .or(
          `and(from_id.eq.${profile.id},to_id.eq.${partner}),and(from_id.eq.${partner},to_id.eq.${profile.id})`
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (!data) return;
      const hist: ChatMessage[] = (data as {
        id: string; from_id: string; from_name: string; to_id: string; body: string; created_at: string;
      }[])
        .map((d) => ({
          id: `db-${d.id}`,
          scope: "dm" as const,
          to: d.to_id,
          from: d.from_id,
          fromName: d.from_name,
          text: d.body,
          at: new Date(d.created_at).getTime(),
        }))
        .reverse();
      setMessages((prev) => {
        const merged = [...hist, ...prev].sort((a, b) => a.at - b.at);
        return merged.slice(-400);
      });
    })();
  }, [chatTab, profile, identity]);

  // ----- 상태 변경 -----
  function applyStatus(s: UserStatus, msg: string, auto = false) {
    if (!auto) autoBusyRef.current = false;
    setStatusState(s);
    setStatusMsg(msg);
    engineRef.current?.patchSelf({ status: s, statusMsg: msg || undefined });
    pushPresence();
    if (profile) setStatusAction(s, msg);
  }

  // ----- 영역 잠금 토글 -----
  function toggleAreaLock() {
    if (!currentArea || !identity) return;
    const id = currentArea.id;
    const locked = lockedAreas.has(id);
    setLockedAreas((prev) => {
      const next = new Set(prev);
      if (locked) next.delete(id);
      else next.add(id);
      return next;
    });
    if (locked) myLocksRef.current.delete(id);
    else myLocksRef.current.add(id);
    channelRef.current.send("lock", { areaId: id, locked: !locked, byName: identity.name });
  }

  // 내가 잠근 영역 상태를 주기적으로 재브로드캐스트 (늦게 들어온 사람 동기화)
  useEffect(() => {
    if (!multiplayer || !identity) return;
    const t = setInterval(() => {
      myLocksRef.current.forEach((id) => {
        channelRef.current.send("lock", { areaId: id, locked: true, byName: identity.name });
      });
    }, 8000);
    return () => clearInterval(t);
  }, [multiplayer, identity]);

  // ----- 모더레이션/소셜 -----
  function doWave(id: string) {
    if (!identity) return;
    channelRef.current.send("wave", { from: identity.id, fromName: identity.name, to: id });
    sendEmote("emoji", "👋");
    addToast("👋 손을 흔들었어요");
  }

  function doBlockToggle(id: string, name: string) {
    const isBlocked = blocked.has(id);
    setBlocked((prev) => {
      const next = new Set(prev);
      if (isBlocked) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(BLOCK_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
    if (profile) {
      if (isBlocked) unblockTarget(id);
      else blockTarget(id);
    }
    addToast(isBlocked ? `${name}님 차단을 해제했어요` : `🚫 ${name}님을 차단했어요 (대화/연결 차단)`);
  }

  function doKick(id: string) {
    if (!identity) return;
    if (!confirm("이 참가자를 내보낼까요? (재입장 가능)")) return;
    channelRef.current.send("mod", { kind: "kick", target: id, byName: identity.name });
  }
  function doBan(id: string, name: string) {
    if (!identity) return;
    const reason = prompt(`"${name}" 님을 밴합니다. 사유 (선택):`);
    if (reason === null) return;
    banTarget(space.id, id, name, reason).then(() => {
      channelRef.current.send("mod", { kind: "ban", target: id, byName: identity.name });
      addToast(`⛔ ${name}님을 밴했습니다 (설정에서 해제 가능)`);
    });
  }

  // ----- 회의 참여 -----
  function joinMeeting(m: MeetingRecord) {
    if (m.room_id !== room.id) {
      router.push(`/s/${space.id}/${m.room_id}?meeting=${m.id}`);
      return;
    }
    gotoMeetingLocation(m, liveMap);
  }

  const gotoMeetingLocation = useCallback((m: MeetingRecord, map: MapData) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (m.location_kind === "area" && m.location_ref) {
      const area = map.areas.find((a) => a.id === m.location_ref);
      if (area) {
        engine.teleport(area.x + Math.floor(area.w / 2), area.y + Math.floor(area.h / 2));
        return;
      }
    }
    if (m.location_kind === "desk" && m.location_ref) {
      const desk = map.objects.find((o) => o.id === m.location_ref);
      if (desk) {
        engine.teleport(desk.x, desk.y + 1);
        return;
      }
    }
    const sp = map.spawns[0];
    if (sp) engine.teleport(sp.x, sp.y);
  }, []);

  // URL ?meeting= 처리
  useEffect(() => {
    if (!engineReady || !multiplayer) return;
    const params = new URLSearchParams(window.location.search);
    const meetingId = params.get("meeting");
    const areaId = params.get("area");
    if (areaId) {
      const area = liveMap.areas.find((a) => a.id === areaId);
      if (area)
        engineRef.current?.teleport(area.x + Math.floor(area.w / 2), area.y + Math.floor(area.h / 2));
    }
    if (meetingId) {
      (async () => {
        const supabase = getSupabaseBrowser();
        if (!supabase) return;
        const { data } = await supabase.from("meetings").select("*").eq("id", meetingId).maybeSingle();
        if (data) gotoMeetingLocation(data as MeetingRecord, liveMap);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineReady]);

  // ----- 화이트보드 브로드캐스트 버스 -----
  const sendWbOp = useCallback(
    (board: string, op: WbOp) => {
      if (multiplayer) channelRef.current.send("wb", { board, op });
    },
    [multiplayer]
  );
  const subscribeWb = useCallback((fn: (board: string, op: WbOp) => void) => {
    wbSubsRef.current.add(fn);
    return () => {
      wbSubsRef.current.delete(fn);
    };
  }, []);

  // ----- 파생 값 -----
  const nameOf = useCallback(
    (id: string) => players.find((p) => p.id === id)?.name ?? "익명",
    [players]
  );
  const myDesk = desks.find((d) => d.owner_id === identity?.id) ?? null;
  const selfInSpotlight = players.find((p) => p.id === identity?.id)?.spotlight ?? false;

  const areaOccupancy = currentArea
    ? players.filter((p) => p.areaId === currentArea.id).length
    : 0;

  // ============ 렌더 ============

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b1020]">
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      {/* ---------- 상단 HUD ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link href="/spaces" className="btn-ghost bg-panel/80 px-3 py-2 text-sm backdrop-blur">
            ← 나가기
          </Link>
          <div className="flex items-center gap-1 rounded-xl bg-panel/80 px-3 py-2 text-sm backdrop-blur">
            <span className="font-semibold text-white">{space.name}</span>
            <span className="mx-1 text-slate-600">/</span>
            <select
              value={room.id}
              onChange={(e) => router.push(`/s/${space.id}/${e.target.value}`)}
              className="cursor-pointer rounded-lg bg-transparent text-slate-300 outline-none hover:text-white"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id} className="bg-panel">
                  🗺️ {r.name}
                </option>
              ))}
            </select>
          </div>
          {(isOwner || role === "admin") && (
            <Link
              href={`/s/${space.id}/settings`}
              className="btn-ghost bg-panel/80 px-3 py-2 text-sm backdrop-blur"
              title="스페이스 설정"
            >
              ⚙️
            </Link>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/s/${space.slug}`);
              addToast("🔗 스페이스 초대 링크를 복사했어요");
            }}
            className="rounded-xl bg-panel/80 px-3 py-2 text-sm text-slate-300 backdrop-blur hover:text-white"
          >
            🔗 초대
          </button>
          <div className="rounded-xl bg-panel/80 px-3 py-2 text-sm backdrop-blur">
            {multiplayer ? (
              <span className="text-accent2">
                ● {channel.ready ? `${Math.max(channel.online, players.length)}명 접속` : "연결 중..."}
              </span>
            ) : (
              <span className="text-amber-300">싱글플레이 (Supabase 미설정)</span>
            )}
          </div>
        </div>
      </div>

      {/* ---------- 프라이빗 영역 배너 ---------- */}
      {currentArea && (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-20 hidden -translate-x-1/2 items-center gap-2 rounded-xl border border-accent/30 bg-panel/90 px-3 py-1.5 text-sm backdrop-blur sm:flex">
          <span className="text-accent">📍 {currentArea.name}</span>
          <span className="text-xs text-slate-400">
            {areaOccupancy}명{currentArea.maxOccupancy ? ` / 최대 ${currentArea.maxOccupancy}명` : ""}
          </span>
          {currentArea.lockable && (
            <button
              onClick={toggleAreaLock}
              className="rounded-lg bg-panel2 px-2 py-0.5 text-xs text-slate-300 hover:text-white"
            >
              {lockedAreas.has(currentArea.id) ? "🔒 잠김 (해제)" : "🔓 잠그기"}
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}/s/${space.id}/${room.id}?area=${currentArea.id}`
              );
              addToast("🔗 이 영역으로 바로 오는 링크를 복사했어요");
            }}
            className="rounded-lg bg-panel2 px-2 py-0.5 text-xs text-slate-300 hover:text-white"
          >
            🔗
          </button>
        </div>
      )}

      {/* 스포트라이트 알림 */}
      {selfInSpotlight && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-20 -translate-x-1/2 rounded-xl bg-orange-500/90 px-4 py-1.5 text-sm font-medium text-white shadow-lg">
          🎤 스포트라이트 — 방 전체에 방송 중입니다
        </div>
      )}

      {/* ---------- 조작 안내 ---------- */}
      <div className="pointer-events-none absolute bottom-20 left-3 z-10 rounded-lg bg-panel/70 px-3 py-2 text-[11px] leading-relaxed text-slate-400 backdrop-blur">
        <div>
          WASD/방향키 이동 · 더블클릭 자동 이동 · X 상호작용
          {hintObj ? ` (${hintObj.name ?? OBJECT_DEFS[hintObj.type]?.label ?? "오브젝트"})` : ""}
        </div>
        <div>1~0 이모지 · Z 춤 · X 의자 앉기 · F {liveMap.vehicle === "kart" ? "카트" : "오토바이"} · M 미니맵</div>
      </div>

      {/* ---------- 레이스 HUD (그랑프리) ---------- */}
      {identity && <RaceHud state={raceState} leaderboard={leaderboard} selfId={identity.id} />}

      {/* ---------- 하단 툴바 ---------- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3">
        <Toolbar
          multiplayer={multiplayer}
          hand={hand}
          status={status}
          statusMsg={statusMsg}
          soundOn={soundOn}
          canEdit={canEdit && multiplayer}
          editorOpen={editorOpen}
          onHand={() => {
            const next = !hand;
            setHand(next);
            engineRef.current?.patchSelf({ hand: next });
            pushPresence();
          }}
          onStatus={(s, m) => applyStatus(s, m)}
          onEmoji={(e) => sendEmote("emoji", e)}
          onSound={() => setSoundOn((v) => !v)}
          onZoom={(d) => {
            const e = engineRef.current;
            if (e) e.zoom = Math.min(1.6, Math.max(0.6, e.zoom + d));
          }}
          onMinimap={() => {
            const e = engineRef.current;
            if (e) e.showMinimap = !e.showMinimap;
          }}
          onEditor={() => setEditorOpen((v) => !v)}
          onPanel={(p) => {
            setPanel((cur) => (cur === p ? null : p));
            if (p === "chat") {
              setUnread(0);
            }
          }}
          unread={unread}
          noteCount={notes.filter((n) => !n.read).length}
          onNotes={() => setModal({ kind: "notes" })}
        />
      </div>

      {/* ---------- 우측 패널 ---------- */}
      {panel && identity && (
        <div className="absolute bottom-0 right-0 top-0 z-30">
          {panel === "participants" && (
            <ParticipantsPanel
              players={players}
              selfId={identity.id}
              isMod={isMod}
              blocked={blocked}
              followId={followId}
              onWave={doWave}
              onWalkTo={(id) => {
                engineRef.current?.walkToPlayer(id);
                addToast("🚶 상대에게 이동 중...");
              }}
              onFollow={(id) => {
                setFollowId(id);
                engineRef.current?.setFollow(id);
                if (id) addToast(`🔗 ${nameOf(id)}님을 따라갑니다 (이동 키로 해제)`);
              }}
              onDm={(id) => {
                setPanel("chat");
                setChatTab({ kind: "dm", to: id });
                setUnreadDms((s) => {
                  const next = new Set(s);
                  next.delete(id);
                  return next;
                });
              }}
              onBlockToggle={doBlockToggle}
              onKick={doKick}
              onBan={doBan}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "chat" && (
            <ChatPanel
              messages={messages}
              players={players}
              selfId={identity.id}
              myAreaId={currentArea?.id ?? null}
              areaName={currentArea?.name ?? null}
              tab={chatTab}
              onTab={(t) => {
                setChatTab(t);
                setUnread(0);
                if (t.kind === "dm")
                  setUnreadDms((s) => {
                    const next = new Set(s);
                    next.delete(t.to);
                    return next;
                  });
              }}
              onSend={sendChat}
              unreadDms={unreadDms}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "meetings" && (
            <MeetingsPanel
              spaceId={space.id}
              rooms={rooms}
              currentRoomId={room.id}
              loggedIn={!!profile}
              myId={identity.id}
              myName={identity.name}
              myDeskObjectId={myDesk?.object_id ?? null}
              onJoin={joinMeeting}
              onClose={() => setPanel(null)}
            />
          )}
        </div>
      )}

      {/* ---------- 좌측 맵 에디터 ---------- */}
      {editorOpen && engineReady && engineRef.current && canvasRef.current && (
        <div className="absolute bottom-0 left-0 top-0 z-30" key={mapEditorKey}>
          <MapEditorLazy
            engine={engineRef.current}
            canvas={canvasRef.current}
            room={{ id: room.id, name: room.name }}
            rooms={rooms}
            templateKey={room.template_key}
            onSaved={() => {
              channelRef.current.send("map-update", { by: identity?.id ?? "" });
              refetchMap();
              addToast("💾 맵을 저장했어요");
            }}
            onClose={() => {
              setEditorOpen(false);
              refetchMap();
            }}
          />
        </div>
      )}

      {/* ---------- 토스트 ---------- */}
      <ToastStack
        toasts={toasts}
        onAction={(t) => {
          t.action?.();
          setToasts((ts) => ts.filter((x) => x.id !== t.id));
        }}
        onDismiss={(id) => setToasts((ts) => ts.filter((x) => x.id !== id))}
      />

      {/* ---------- 모달 ---------- */}
      {modal?.kind === "object" && <ObjectModal obj={modal.obj} onClose={() => setModal(null)} />}
      {modal?.kind === "tetris" && <TetrisModal onClose={() => setModal(null)} />}
      {modal?.kind === "piano" && identity && (
        <PianoModal
          title={modal.obj.name ?? "피아노"}
          onNote={(note) => {
            const self = engineRef.current?.getSelf();
            if (multiplayer && self) {
              channelRef.current.send("piano", {
                from: identity.id,
                x: self.x,
                y: self.y,
                note,
              });
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "whiteboard" && (
        <WhiteboardModal
          boardKey={`${space.id}:${modal.obj.id}`}
          spaceId={space.id}
          title={modal.obj.name ?? "화이트보드"}
          canPersist={!!profile}
          onClose={() => setModal(null)}
          sendOp={sendWbOp}
          subscribeRemote={subscribeWb}
        />
      )}
      {modal?.kind === "bulletin" && identity && (
        <BulletinModal
          spaceId={space.id}
          roomId={room.id}
          objectId={modal.obj.id}
          title={modal.obj.name ?? "게시판"}
          myName={identity.name}
          loggedIn={!!profile}
          isMod={isMod}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "desk" && identity && (
        <DeskModal
          obj={modal.obj}
          desk={desks.find((d) => d.object_id === modal.obj.id) ?? null}
          spaceId={space.id}
          roomId={room.id}
          myId={identity.id}
          myName={identity.name}
          loggedIn={!!profile}
          onChanged={() => {
            refetchDesks();
            channelRef.current.send("desk-update", { by: identity.id });
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "portal-pw" && (
        <PortalPasswordModal
          portal={modal.portal}
          onSuccess={() => {
            const p = modal.portal;
            setModal(null);
            executePortal(p);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "notes" && (
        <NotesModal
          notes={notes}
          onRead={(id) => setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)))}
          onClose={() => setModal(null)}
        />
      )}

      {!identity && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-ink/80 text-slate-300">
          캐릭터 불러오는 중...
        </div>
      )}
    </div>
  );
}

// ---------- 포털 비밀번호 모달 ----------
function PortalPasswordModal({
  portal,
  onSuccess,
  onClose,
}: {
  portal: Portal;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  return (
    <Modal title="🔑 비밀번호 문" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-300">{portal.label ?? "이 문은 비밀번호가 필요합니다."}</p>
        <input
          className="input bg-panel2"
          type="password"
          placeholder="비밀번호"
          value={pw}
          autoFocus
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (pw === portal.password) onSuccess();
              else setError(true);
            }
          }}
        />
        {error && <p className="text-sm text-red-400">비밀번호가 올바르지 않습니다.</p>}
        <button
          onClick={() => (pw === portal.password ? onSuccess() : setError(true))}
          className="btn-primary w-full"
        >
          통과하기
        </button>
      </div>
    </Modal>
  );
}

// ---------- 데스크 쪽지함 ----------
function NotesModal({
  notes,
  onRead,
  onClose,
}: {
  notes: DeskNote[];
  onRead: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    // 열람 시 모두 읽음 처리
    import("@/app/actions").then(({ markNoteRead }) => {
      notes.filter((n) => !n.read).forEach((n) => {
        markNoteRead(n.id);
        onRead(n.id);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="💌 내 데스크 쪽지함" onClose={onClose}>
      {notes.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">받은 쪽지가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl bg-panel2 p-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-200">
                  {n.gift && <span className="mr-1 text-lg">{n.gift}</span>}
                  {n.from_name}
                </span>
                <span>
                  {new Date(n.created_at).toLocaleString("ko-KR", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-100">{n.message}</p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// 맵 에디터는 큰 컴포넌트라 필요할 때만 로드
const MapEditorLazy = dynamic(() => import("./MapEditor"), { ssr: false });
