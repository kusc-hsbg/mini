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
  TILE_INFO,
  getPreset,
  mapPixelSize,
  objectInteraction,
  resolveMap,
} from "@/lib/game/maps";
import { EMOJIS, PROXIMITY_TILES, STATUS_META, TILE, headImgUrl, normalizeSpecial } from "@/lib/game/constants";
import { OBJECT_DEFS } from "@/lib/game/objects";
import { playPianoNote } from "@/lib/game/audio";
import { filterProfanity } from "@/lib/game/moderation";
import { useRoomChannel } from "@/hooks/useRoomChannel";
import { useControlChannel, type ControlChannel } from "@/hooks/useControlChannel";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { logEvent } from "@/lib/analytics";
import { addKill, banTarget, blockTarget, buyItem, buyWeapon, claimAttendance, claimQuest, equipItem, grantHearts, incrementRaceWin, redeemSecretWallet, saveBio as saveBioAction, sendDm, sendFriendRequest, setRoomClosed as setRoomClosedAction, setStatus as setStatusAction, spendHearts, unblockTarget } from "@/app/actions";
import StoreModal, { type WalletState } from "./StoreModal";
import FriendsPanel from "./FriendsPanel";
import MiniGamesModal from "./MiniGamesModal";
import BankModal from "./BankModal";
import PkHud from "./PkHud";
import AuctionModal from "./AuctionModal";
import { SHOP_MAP } from "@/lib/game/shop";
import { KILL_TITLES, WEAPON_MAP } from "@/lib/game/weapons";
import type { PlayerCosmetics } from "@/lib/game/types";
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
const GUEST_WALLET_KEY = "affinity:guest-wallet";
const GUEST_ATT_KEY = "affinity:guest-attendance";
const SPORTSCAR_SUMMON_KEY = "mount-sportscar";
const BALLOON_TOUR_MOUNT_KEY = "mount-balloon";
const CAR_SUMMON_COST = 10;

function bioStorageKey(id: string) {
  return `affinity:bio:${id}`;
}

function loadRememberedBio(id: string): string {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(bioStorageKey(id)) ?? "" : "";
  } catch {
    return "";
  }
}

function rememberBio(id: string, bio: string) {
  try {
    localStorage.setItem(bioStorageKey(id), bio);
  } catch {}
}

function loadGuestWallet(): WalletState {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(GUEST_WALLET_KEY) : null;
    if (raw) {
      const w = JSON.parse(raw);
      return {
        hearts: Number(w.hearts ?? 200),
        coins: Number(w.coins ?? 0),
        inventory: Array.isArray(w.inventory) ? w.inventory : [],
        equipped: w.equipped ?? {},
      };
    }
  } catch {}
  return { hearts: 200, coins: 0, inventory: [], equipped: {} };
}

interface Identity {
  id: string;
  name: string;
  appearance: CharacterAppearance;
  guest: boolean;
  bio: string;
}

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "g_" + Math.random().toString(36).slice(2);
}

function equippedToCosmetics(eq: Record<string, string>): PlayerCosmetics {
  return {
    frame: eq.frame,
    card: eq.card,
    pet: eq.pet,
    wings: eq.wings,
    mount: eq.mount,
    kart: eq.kart,
    dance: eq.dance,
  };
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
  let guestBio = "";
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
        nameAbove: !!g.nameAbove,
      };
      if (g.name) name = g.name;
      if (typeof g.bio === "string") guestBio = g.bio;
    }
  } catch {}
  return { id, name, appearance, guest: true, bio: guestBio };
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
  | { kind: "bio" }
  | { kind: "exhibit"; obj: MapObject }
  | { kind: "store" }
  | { kind: "warp" }
  | { kind: "quest" }
  | { kind: "minigame"; game?: "fishing" | "rhythm" | "farming" }
  | { kind: "bank" }
  | { kind: "collection" }
  | { kind: "auction" }
  | { kind: "quiz" }
  | null;

type PanelState = "participants" | "chat" | "meetings" | "friends" | "store" | null;

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
      const rememberedBio = profile.bio?.trim() ? profile.bio : loadRememberedBio(profile.id);
      setIdentity({
        id: profile.id,
        name: profile.display_name || "Player",
        guest: false,
        bio: rememberedBio,
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
          nameAbove: !!profile.name_above,
        },
      });
    } else {
      setIdentity(resolveGuestIdentity());
    }
  }, [profile]);

  // 소개(bio) 초기화. 편집은 HUD의 정보 버튼에서 직접 연다.
  useEffect(() => {
    if (!identity) return;
    const rememberedBio = identity.bio?.trim() ? identity.bio : loadRememberedBio(identity.id);
    if (rememberedBio !== identity.bio) identity.bio = rememberedBio;
    setMyBio(rememberedBio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

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
  const [nearWater, setNearWater] = useState(false);
  const resolvedRoomMap = useMemo(() => resolveMap(room.template_key, room.map_data), [room.id, room.template_key, room.map_data]);
  const [liveMap, setLiveMap] = useState<MapData>(() => resolvedRoomMap);
  const [mapEditorKey, setMapEditorKey] = useState(0);
  const [raceState, setRaceState] = useState<RaceState | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [touchedId, setTouchedId] = useState<string | null>(null);
  const [pkState, setPkState] = useState<{ hp: number; dead: boolean; weapon: string; kills: number } | null>(null);
  const [myBio, setMyBio] = useState("");
  const [wallet, setWallet] = useState<WalletState>(() =>
    profile
      ? {
          hearts: profile.hearts ?? 0,
          coins: profile.coins ?? 0,
          inventory: profile.inventory ?? [],
          equipped: profile.equipped ?? {},
        }
      : { hearts: 200, coins: 0, inventory: [], equipped: {} }
  );
  useEffect(() => {
    if (!profile) setWallet(loadGuestWallet());
  }, [profile]);
  // 게스트 지갑은 로컬에 영속화 (하트/아이템이 실제로 유지·증가하도록)
  useEffect(() => {
    if (!profile) {
      try {
        localStorage.setItem(GUEST_WALLET_KEY, JSON.stringify(wallet));
      } catch {}
    }
  }, [wallet, profile]);
  const [mounted, setMounted] = useState(false);
  const [summonedMount, setSummonedMount] = useState<string | null>(null);
  const activeCosmetics = useMemo(() => {
    const cos = equippedToCosmetics(wallet.equipped);
    if (summonedMount) cos.mount = summonedMount;
    return cos;
  }, [wallet.equipped, summonedMount]);
  const [stats, setStats] = useState({ raceWins: profile?.race_wins ?? 0, kills: profile?.kills ?? 0 });
  const [roomClosed, setRoomClosedState] = useState(!!room.closed);
  const [pianoPlaced, setPianoPlaced] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false);
  const [secretArmed, setSecretArmed] = useState(false);
  const [secretCode, setSecretCode] = useState("");
  const [quiz, setQuiz] = useState<{ text: string; host: string; hostName: string; correct?: "O" | "X"; myResult?: "pass" | "fail" } | null>(null);
  const [bossHud, setBossHud] = useState<{ hp: number; maxHp: number; kind: string; alive: boolean } | null>(null);
  const bossRef = useRef<{ x: number; y: number; hp: number; maxHp: number; kind: string; alive: boolean } | null>(null);
  const bossRespawnRef = useRef(0);
  // 보스 레이드 호스트 선출 (가장 작은 id) — 안정적 단일 시뮬레이터
  const isHost = useMemo(() => {
    if (!identity) return false;
    let min = identity.id;
    for (const p of players) if (p.id < min) min = p.id;
    return min === identity.id;
  }, [players, identity]);
  const isHostRef = useRef(false);
  isHostRef.current = isHost;

  useEffect(() => {
    setLiveMap(resolvedRoomMap);
    setMapEditorKey((k) => k + 1);
  }, [resolvedRoomMap]);

  const autoBusyRef = useRef(false);
  const myLocksRef = useRef<Set<string>>(new Set());
  // 노크 승인을 받은 영역: 만료 시각까지 lock 재브로드캐스트를 무시 (승인 직후 재잠김 방지)
  const knockGraceRef = useRef<Map<string, number>>(new Map());
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const ridersRef = useRef<Set<string>>(new Set()); // 내 양탄자에 탑승한 파티원
  const ridingOwnerRef = useRef<string | null>(null); // 내가 탑승 중인 주인
  const touchRewardRef = useRef<Map<string, number>>(new Map());
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
  const balloonTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      case "shot": {
        const s = payload as RtEvents["shot"];
        if (blockedRef.current.has(s.from)) break;
        engine?.receiveShot(s);
        break;
      }
      case "kill": {
        const k = payload as RtEvents["kill"];
        engine?.receiveKill(k);
        break;
      }
      case "obj-place": {
        const o = payload as RtEvents["obj-place"];
        engine?.addObject({ id: o.id, type: o.otype as MapObject["type"], x: o.x, y: o.y, name: o.name });
        break;
      }
      case "obj-remove": {
        const o = payload as RtEvents["obj-remove"];
        engine?.removeObject(o.id);
        break;
      }
      case "boss": {
        const b = payload as RtEvents["boss"];
        if (!isHostRef.current) {
          bossRef.current = b;
          engineRef.current?.setBoss(b);
          setBossHud({ hp: b.hp, maxHp: b.maxHp, kind: b.kind, alive: b.alive });
        }
        break;
      }
      case "boss-dmg": {
        const d = payload as RtEvents["boss-dmg"];
        if (isHostRef.current) {
          const b = bossRef.current;
          if (b && b.alive) {
            b.hp -= d.amount;
            if (b.hp <= 0) {
              b.alive = false;
              bossRespawnRef.current = Number.POSITIVE_INFINITY;
              addToast(`🏆 보스 처치! (${d.byName} 막타)`);
            }
          }
        }
        break;
      }
      case "ride-req": {
        const r = payload as RtEvents["ride-req"];
        if (r.to !== myId || blockedRef.current.has(r.from)) break;
        // 파티 동승 가능한 탈것(양탄자)을 소환 중일 때만 수락 가능
        const mountKey = walletRef.current.equipped.mount;
        const mount = mountKey ? SHOP_MAP[mountKey] : null;
        if (!mount?.rideableParty || !mounted) {
          addToast(`${r.fromName}님이 탑승을 요청했지만, 파티 탈것(양탄자)을 소환 중이 아니에요`);
          break;
        }
        if (ridersRef.current.size >= (mount.seats ?? 5) - 1) {
          addToast("🧞 양탄자 정원이 가득 찼어요");
          break;
        }
        addToast(`🧞 ${r.fromName}님의 탑승 요청`, "수락", () => {
          ridersRef.current.add(r.from);
          channelRef.current.send("ride-ok", { owner: myId, ownerName: identity?.name ?? "", rider: r.from });
        });
        break;
      }
      case "ride-ok": {
        const r = payload as RtEvents["ride-ok"];
        if (r.rider !== myId) break;
        ridingOwnerRef.current = r.owner;
        engine?.setPassengerOf(r.owner);
        addToast(`🧞 ${r.ownerName}님의 양탄자에 탑승! (이동 키로 내려요)`);
        break;
      }
      case "ride-end": {
        const r = payload as RtEvents["ride-end"];
        if (r.owner === myId) ridersRef.current.delete(r.rider);
        break;
      }
      case "party-warp": {
        const w = payload as RtEvents["party-warp"];
        if (w.riders.includes(myId ?? "")) {
          ridingOwnerRef.current = null;
          router.push(`/s/${space.id}/${w.roomId}`);
        }
        break;
      }
      case "quiz": {
        const q = payload as RtEvents["quiz"];
        if (q.kind === "start") {
          setQuiz({ text: q.text ?? "", host: q.host, hostName: q.hostName });
          moveToQuizStart();
          addToast(`🅾️❌ ${q.hostName}님의 OX 퀴즈`);
        } else if (q.kind === "reveal") {
          const myArea = engine?.getSelf().areaId ?? null;
          const correctZone = q.correct === "O" ? "quiz-o" : "quiz-x";
          const pass = myArea === correctZone;
          setQuiz((cur) => (cur ? { ...cur, correct: q.correct, myResult: pass ? "pass" : "fail" } : cur));
          addToast(pass ? `✅ 정답! (${q.correct}) 통과!` : `❌ 오답! 정답은 ${q.correct} 였어요 — 탈락`);
        } else {
          setQuiz(null);
        }
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
      resolvedRoomMap,
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
        onFishingSpot: (near) => setNearWater(near),
        onPlayerClick: () => setPanel("participants"),
        onPlayerRightClick: (id) => {
          if (!multiplayer) return;
          channelRef.current.send("ride-req", { from: identity.id, fromName: identity.name, to: id });
          addToast("🧞 탈것 탑승을 요청했어요 (상대가 수락하면 함께 이동)");
        },
        onDetach: () => {
          const owner = ridingOwnerRef.current;
          if (owner && multiplayer) channelRef.current.send("ride-end", { rider: identity.id, owner });
          ridingOwnerRef.current = null;
          addToast("🚶 탈것에서 내렸어요");
        },
        onRace: (ev) => {
          if (ev.kind === "start") {
            addToast(`🚦 레이스 시작! 시계방향으로 ${ev.laps}랩 완주하세요`);
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
            addToast(`🏆 완주! 총 기록 ${fmtMs(ev.totalMs)} — 트로피장으로 이동합니다!`);
            applyRaceRecord(identity.id, identity.name, ev.totalMs);
            // 트로피장(포디움)으로 이동 + 우승 기록
            const eng = engineRef.current;
            const activeMap = engineRef.current?.map ?? liveMap;
            const podium = activeMap.objects.find((o) => o.type === "podium");
            if (eng) {
              eng.patchSelf({ onBike: false });
              if (podium) eng.teleport(podium.x + 1, podium.y + 2);
              else if (activeMap.spawns[0]) eng.teleport(activeMap.spawns[0].x, activeMap.spawns[0].y);
            }
            if (profile) {
              incrementRaceWin().then((res) => {
                if (!("error" in res)) {
                  setStats((s) => ({ ...s, raceWins: res.raceWins }));
                  addToast(`🥇 레이스 우승 기록! 누적 ${res.raceWins}회 (도감에서 확인)`);
                }
              });
            }
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
        onTouch: (id) => {
          setTouchedId(id);
          if (!id) return;
          const now = Date.now();
          const prev = touchRewardRef.current.get(id) ?? 0;
          if (now - prev > 60_000) {
            touchRewardRef.current.set(id, now);
            awardHearts(1, "하이파이브");
          }
        },
        onGhost: (active) =>
          addToast(active ? "👻 고스트 모드 (10초) — 반투명 상태예요" : "고스트 모드 해제"),
        onShot: (p) => {
          if (multiplayer) channelRef.current.send("shot", p);
        },
        onKillBroadcast: (p) => {
          if (multiplayer) channelRef.current.send("kill", p);
        },
        onDeath: (killerName) =>
          addToast(
            liveMap.race
              ? "💀 미사일 3회 피격 — 경기장 감옥으로 이동했습니다"
              : killerName
                ? `💀 ${killerName}님에게 당했습니다! 곧 부활합니다`
                : "💀 사망! 곧 부활합니다"
          ),
        onKill: (victimName) => {
          addToast(`🎯 ${victimName}님을 처치했습니다!`);
          if (profile) {
            addKill().then((res) => {
              if (!("error" in res)) {
                setStats((s) => ({ ...s, kills: res.kills }));
                if (res.newTitle) addToast(`🏅 새 칭호 획득: ${res.newTitle}!`);
              }
            });
          }
        },
        onRespawn: () => addToast("✨ 부활했습니다!"),
        onBossHit: (amount) => {
          if (isHostRef.current) {
            const b = bossRef.current;
            if (b && b.alive) {
              b.hp -= amount;
              if (b.hp <= 0) {
                b.alive = false;
                bossRespawnRef.current = Number.POSITIVE_INFINITY;
                addToast("🏆 보스를 처치했습니다! 레버를 다시 내리기 전까지 재등장하지 않아요");
              }
            }
          } else if (multiplayer) {
            channelRef.current.send("boss-dmg", { amount, byName: identity.name });
          }
        },
        onItem: (kind: RaceItemKind) => {
          const meta: Record<RaceItemKind, [string, string]> = {
            turbo: ["🚀 터보! 2초간 초가속", "🚀"],
            boost: ["⚡ 부스트!", "⚡"],
            rocket: ["🎆 폭죽 로켓 발사! 보스에게 피해", "🚀"],
            slow: ["🐢 꽝... 슬로우에 걸렸어요", "🐢"],
            ink: ["🖤 먹물! 시야가 가려졌어요", "🖤"],
            meteor: ["☄️ 운석/폭탄! 잠시 멈춰요", "💫"],
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
      {
        spawn: initialSpawn ?? undefined,
        guest: identity.guest,
        status: statusRef.current,
        bio: identity.bio,
        cosmetics: activeCosmetics,
      }
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

  // 장착 코스메틱 / 탈것 상태를 엔진(내 캐릭터)에 반영 + presence 전파
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.patchSelf({ cosmetics: activeCosmetics, mounted: mounted && !!activeCosmetics.mount });
    pushPresence();
  }, [activeCosmetics, mounted, engineReady, pushPresence]);

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

  function moveToQuizStart() {
    const e = engineRef.current;
    const start = liveMap.areas.find((a) => a.id === "quiz-start");
    if (e && start) {
      e.teleport(start.x + Math.floor(start.w / 2), start.y + Math.floor(start.h / 2));
      return;
    }
    const plaza = rooms.find((r) => r.template_key === "plaza");
    if (plaza && plaza.id !== room.id) {
      router.push(`/s/${space.id}/${plaza.id}?area=quiz-start`);
    }
  }

  async function redeemSecretCode() {
    const code = secretCode.trim();
    if (code !== "2009") {
      setSecretCode("");
      return;
    }
    if (!profile) {
      setWallet((w) => ({ ...w, hearts: w.hearts + 10000, coins: w.coins + 10000 }));
      setSecretOpen(false);
      setSecretArmed(false);
      setSecretCode("");
      addToast("완료");
      return;
    }
    const res = await redeemSecretWallet(code);
    if ("error" in res) {
      setSecretCode("");
      return;
    }
    setWallet((w) => ({ ...w, hearts: res.hearts, coins: res.coins }));
    setSecretOpen(false);
    setSecretArmed(false);
    setSecretCode("");
    addToast("완료");
  }

  function startBalloonTour() {
    const e = engineRef.current;
    if (!e || !identity) return;
    if (balloonTimerRef.current) return;
    const cost = 10;
    if (walletRef.current.hearts < cost) {
      addToast("하트가 부족합니다.");
      return;
    }
    const id = `balloon-tour-${identity.id}`;
    const path = [
      { x: 28, y: 31 },
      { x: 18, y: 25 },
      { x: 20, y: 15 },
      { x: 30, y: 12 },
      { x: 42, y: 15 },
      { x: 44, y: 25 },
      { x: 32, y: 31 },
    ];
    const previousSummonedMount = summonedMount;
    const previousMounted = mounted;
    const previousCosmetics = activeCosmetics;
    const tourCosmetics: PlayerCosmetics = { ...activeCosmetics, mount: BALLOON_TOUR_MOUNT_KEY };
    const remove = () => {
      e.removeObject(id);
      if (multiplayer) channelRef.current.send("obj-remove", { id });
    };
    const restoreRide = () => {
      setSummonedMount(previousSummonedMount);
      setMounted(previousMounted);
      e.patchSelf({ cosmetics: previousCosmetics, mounted: previousMounted && !!previousCosmetics.mount });
      pushPresence();
    };
    const stopTour = (restore = true) => {
      remove();
      if (balloonTimerRef.current) clearInterval(balloonTimerRef.current);
      balloonTimerRef.current = null;
      if (restore) restoreRide();
    };
    const place = (idx: number) => {
      const p = path[idx];
      e.removeObject(id);
      e.addObject({ id, type: "balloon", x: p.x, y: p.y, name: "투어 열기구", props: { tour: true } });
      e.teleport(p.x + 1, p.y + 2);
      e.patchSelf({ cosmetics: tourCosmetics, mounted: true });
      pushPresence();
      if (multiplayer) {
        channelRef.current.send("obj-remove", { id });
        channelRef.current.send("obj-place", { id, otype: "balloon", x: p.x, y: p.y, name: "투어 열기구" });
      }
    };
    setSummonedMount(BALLOON_TOUR_MOUNT_KEY);
    setMounted(true);
    setWallet((w) => ({ ...w, hearts: w.hearts - cost }));
    if (profile) {
      spendHearts(cost).then((res) => {
        if ("error" in res) {
          setWallet((w) => ({ ...w, hearts: w.hearts + cost }));
          stopTour();
          addToast("❌ 열기구 호출 실패: " + res.error);
          return;
        }
        setWallet((w) => ({ ...w, hearts: res.hearts }));
      });
    }
    let idx = 0;
    place(idx);
    addToast("🎈 투어 열기구가 출발했습니다");
    balloonTimerRef.current = setInterval(() => {
      idx++;
      if (idx >= path.length) {
        stopTour();
        return;
      }
      place(idx);
    }, 900);
  }

  useEffect(() => {
    return () => {
      if (balloonTimerRef.current) clearInterval(balloonTimerRef.current);
      balloonTimerRef.current = null;
    };
  }, []);

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

  // ----- 보스 레이드 (레이스 맵) — 호스트가 시뮬레이션/브로드캐스트 -----
  useEffect(() => {
    if (!liveMap.race || !identity) {
      bossRef.current = null;
      setBossHud(null);
      engineRef.current?.setBoss(null);
      return;
    }
    if (!isHost) return; // 비호스트는 boss 이벤트로 수신
    const kind = liveMap.key.includes("sea") ? "kraken" : liveMap.key.includes("sky") ? "chicken" : "mole";
    const size = mapPixelSize(liveMap);
    const t = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      const now = Date.now();
      let b = bossRef.current;
      if (!b || (!b.alive && now > bossRespawnRef.current)) {
        const maxHp = 15;
        b = { x: size.w / 2, y: size.h / 2, hp: maxHp, maxHp, kind, alive: true };
        bossRef.current = b;
      }
      if (b.alive) {
        b.x = size.w / 2;
        b.y = size.h / 2;
      }
      e.setBoss(b);
      setBossHud({ hp: b.hp, maxHp: b.maxHp, kind: b.kind, alive: b.alive });
      if (multiplayer) {
        channelRef.current.send("boss", { x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, kind: b.kind, alive: b.alive });
      }
    }, 150);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMap, identity, isHost, multiplayer]);

  // ----- PK HUD 폴링 (아레나에서만) -----
  useEffect(() => {
    if (!liveMap.pk) {
      setPkState(null);
      return;
    }
    const t = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      setPkState({ hp: e.getSelfHp(), dead: e.isDead(), weapon: e.getWeapon(), kills: e.getSelf().kills ?? 0 });
    }, 120);
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

  // ----- 출석 보상 (하루 1회) -----
  useEffect(() => {
    let done = false;
    if (profile) {
      (async () => {
        const res = await claimAttendance();
        if (done || "error" in res || res.already) return;
        setWallet((w) => ({ ...w, hearts: res.hearts, coins: res.coins }));
        addToast(
          `📅 출석 완료! 💗${res.rewardHearts}${res.rewardCoins ? ` +🪙${res.rewardCoins}` : ""} 획득 (연속 ${res.streak}일)`
        );
      })();
    } else {
      // 게스트: 로컬 하루 1회 출석
      try {
        const today = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem(GUEST_ATT_KEY) !== today) {
          localStorage.setItem(GUEST_ATT_KEY, today);
          setWallet((w) => ({ ...w, hearts: w.hearts + 60 }));
          addToast("📅 출석 완료! 💗60 획득 (게스트)");
        }
      } catch {}
    }
    return () => {
      done = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

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
        else if (engineRef.current?.isNearWater()) setModal({ kind: "minigame", game: "fishing" });
      } else if (e.key === " ") {
        // 워프 포탈 근처에서 스페이스 → 전체 미니맵 워프
        const obj = engineRef.current?.getHintObject();
        if (obj?.type === "portalhub") {
          e.preventDefault();
          setModal({ kind: "warp" });
        }
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
    if (obj.type === "exhibit") {
      setModal({ kind: "exhibit", obj });
      return;
    }
    if (obj.type === "portalhub") {
      setModal({ kind: "warp" });
      return;
    }
    if (obj.type === "shopdisplay") {
      void buyOrEquipWorldItem(obj);
      return;
    }
    if (obj.type === "balloon") {
      startBalloonTour();
      return;
    }
    if (obj.type === "npc") {
      if (obj.props?.text || obj.props?.interaction) {
        setModal({ kind: "object", obj });
        return;
      }
      setModal({ kind: "quest" });
      return;
    }
    if (obj.type === "minigame") {
      setModal({ kind: "minigame" });
      return;
    }
    if (obj.type === "atm") {
      if (!profile) {
        addToast("ATM 이용은 로그인이 필요해요.");
        return;
      }
      setModal({ kind: "bank" });
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
    // 침대: 눕기/일어나기 토글
    if (obj.type === "bed") {
      const e = engineRef.current;
      if (!e) return;
      if (e.isSitting()) {
        e.standUp();
      } else if (e.sitOn(obj)) {
        addToast("🛏️ 누웠어요 — 이동 키나 X 키로 일어나요");
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

  async function buyOrEquipWorldItem(obj: MapObject) {
    const item = obj.props?.itemKey ? SHOP_MAP[obj.props.itemKey] : null;
    if (!item) {
      addToast("상점 아이템 정보가 없습니다.");
      return;
    }

    const current = walletRef.current;
    const owned = current.inventory.includes(item.key);
    if (owned) {
      if (item.slot === "none") {
        addToast(`${item.name}은 이미 보유 중입니다.`);
        return;
      }
      if (!profile) {
        setWallet((w) => ({ ...w, equipped: { ...w.equipped, [item.slot]: item.key } }));
        addToast(`${item.name} 장착 완료`);
        return;
      }
      const res = await equipItem(item.slot, item.key);
      if ("error" in res) {
        addToast("❌ " + res.error);
        return;
      }
      setWallet((w) => ({ ...w, equipped: res.equipped }));
      addToast(`${item.name} 장착 완료`);
      return;
    }

    const balance = item.currency === "heart" ? current.hearts : current.coins;
    if (balance < item.price) {
      addToast(item.currency === "heart" ? "하트가 부족합니다." : "코인이 부족합니다.");
      return;
    }

    if (!profile) {
      const nextInv = [...current.inventory, item.key];
      setWallet((w) =>
        item.currency === "heart"
          ? { ...w, hearts: w.hearts - item.price, inventory: nextInv }
          : { ...w, coins: w.coins - item.price, inventory: nextInv }
      );
      addToast(`${item.name} 구매 완료`);
      return;
    }

    const res = await buyItem(item.key);
    if ("error" in res) {
      addToast("❌ " + res.error);
      return;
    }
    setWallet((w) => ({ ...w, hearts: res.hearts, coins: res.coins, inventory: res.inventory }));
    addToast(`${item.name} 구매 완료`);
  }

  // ----- 채팅 전송 -----
  function sendChat(tab: ChatTab, rawText: string) {
    const engine = engineRef.current;
    if (!engine || !identity) return;
    const text = filterProfanity(rawText);
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

  // ----- 하트 지급/사용 -----
  function awardHearts(amount: number, label = "보상") {
    const gain = Math.max(0, Math.min(30, Math.floor(amount)));
    if (gain <= 0) return;
    setWallet((w) => ({ ...w, hearts: w.hearts + gain }));
    if (profile) {
      grantHearts(gain).then((res) => {
        if ("error" in res) {
          addToast(`❌ ${label} 저장 실패: ${res.error}`);
          return;
        }
        setWallet((w) => ({ ...w, hearts: Math.max(w.hearts, res.hearts) }));
      });
    }
    addToast(`💗 ${label} +${gain}`);
  }

  function summonCar() {
    if (mounted && summonedMount === SPORTSCAR_SUMMON_KEY) {
      setMounted(false);
      setSummonedMount(null);
      addToast("🚶 자동차에서 내렸어요");
      return;
    }
    if (walletRef.current.hearts < CAR_SUMMON_COST) {
      addToast(`❌ 자동차 소환에는 ${CAR_SUMMON_COST}하트가 필요해요`);
      return;
    }
    const activate = () => {
      setSummonedMount(SPORTSCAR_SUMMON_KEY);
      setMounted(true);
      addToast(`🚗 자동차를 소환했어요 (-${CAR_SUMMON_COST}💗)`);
    };
    setWallet((w) => ({ ...w, hearts: w.hearts - CAR_SUMMON_COST }));
    if (profile) {
      spendHearts(CAR_SUMMON_COST).then((res) => {
        if ("error" in res) {
          setWallet((w) => ({ ...w, hearts: w.hearts + CAR_SUMMON_COST }));
          setMounted(false);
          setSummonedMount(null);
          addToast("❌ 자동차 소환 실패: " + res.error);
          return;
        }
        setWallet((w) => ({ ...w, hearts: res.hearts }));
      });
    }
    activate();
  }

  // ----- 소개(bio) 저장 -----
  function applyBio(text: string) {
    const bio = filterProfanity(text.slice(0, 200));
    setMyBio(bio);
    engineRef.current?.patchSelf({ bio: bio || undefined });
    pushPresence();
    if (identity) identity.bio = bio;
    if (identity) rememberBio(identity.id, bio);
    if (profile) {
      saveBioAction(bio).then((res) => {
        if ("error" in res) addToast("❌ 소개 서버 저장 실패: " + res.error);
      });
    } else {
      // 게스트: 로컬 저장 (다음 접속에도 유지)
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        const g = raw ? JSON.parse(raw) : {};
        g.bio = bio;
        localStorage.setItem(GUEST_KEY, JSON.stringify(g));
      } catch {}
    }
    addToast("📝 소개를 저장했어요");
  }

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

  function doAddFriend(id: string, name: string) {
    if (!profile) {
      addToast("친구 추가는 로그인이 필요해요.");
      return;
    }
    sendFriendRequest(id).then((res) => {
      if ("error" in res) addToast("❌ " + res.error);
      else addToast(`🤝 ${name}님에게 친구 요청을 보냈어요`);
    });
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
  const touchedPlayer =
    (touchedId &&
      (players.find((p) => p.id === touchedId) ??
        engineRef.current?.getOthers().find((p) => p.id === touchedId))) ||
    null;
  const starhallExhibit = liveMap.key === "starhall" && hintObj?.type === "exhibit" ? hintObj : null;

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
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <Link
            href="/spaces"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-[#101720]/80 text-lg text-slate-200 shadow-xl backdrop-blur-xl transition hover:border-white/25 hover:bg-white/10"
            title="나가기"
          >
            ←
          </Link>
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-[#101720]/80 px-3 py-2 shadow-xl backdrop-blur-xl">
            <span className="max-w-[150px] truncate text-xs font-semibold text-white sm:max-w-[220px]">{space.name}</span>
            <span className="h-4 w-px bg-white/10" />
            <select
              value={room.id}
              onChange={(e) => router.push(`/s/${space.id}/${e.target.value}`)}
              className="max-w-[150px] cursor-pointer rounded-md bg-transparent text-xs text-slate-300 outline-none hover:text-white sm:max-w-[220px]"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id} className="bg-panel">
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {(isOwner || role === "admin") && (
            <Link
              href={`/s/${space.id}/settings`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-[#101720]/80 text-slate-200 shadow-xl backdrop-blur-xl transition hover:border-white/25 hover:bg-white/10"
              title="스페이스 설정"
            >
              ⚙️
            </Link>
          )}
          {isMod && (
            <button
              onClick={() => {
                const next = !roomClosed;
                setRoomClosedState(next);
                setRoomClosedAction(room.id, next);
                addToast(next ? "🚪 이 방의 방문을 닫았어요 (멤버/관리자만 입장)" : "🚪 이 방의 방문을 열었어요");
              }}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border shadow-xl backdrop-blur-xl transition ${
                roomClosed
                  ? "border-amber-300/40 bg-amber-300/15 text-amber-100"
                  : "border-white/10 bg-[#101720]/80 text-slate-200 hover:border-white/25 hover:bg-white/10"
              }`}
              title={roomClosed ? "방문 열기" : "방문 닫기"}
            >
              {roomClosed ? "🔒" : "🚪"}
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <div className="hidden items-center overflow-hidden rounded-lg border border-white/10 bg-[#101720]/80 shadow-xl backdrop-blur-xl sm:flex">
            <span className="border-r border-white/10 px-3 py-2 text-xs font-semibold text-pink-200">
              💗 {wallet.hearts.toLocaleString()}
            </span>
            <span className="px-3 py-2 text-xs font-semibold text-amber-200">🪙 {wallet.coins.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#101720]/80 p-1 shadow-xl backdrop-blur-xl">
          <HudIconButton
            active={panel === "store"}
            onClick={() => setPanel((cur) => (cur === "store" ? null : "store"))}
            title="상점 & 인벤토리"
          >
            ◈
          </HudIconButton>
          {profile && (
            <HudIconButton
              onClick={() => setModal({ kind: "auction" })}
              title="경매장"
            >
              🏷
            </HudIconButton>
          )}
          {profile && (
            <HudIconButton
              active={panel === "friends"}
              onClick={() => setPanel((cur) => (cur === "friends" ? null : "friends"))}
              title="친구"
            >
              👥
            </HudIconButton>
          )}
          {profile && (
            <HudIconButton
              onClick={() => setModal({ kind: "collection" })}
              title="도감 — 우승/킬/칭호"
            >
              ★
            </HudIconButton>
          )}
          <HudIconButton
            onClick={() => setModal({ kind: "quiz" })}
            title="OX 파티 퀴즈 진행"
          >
            OX
          </HudIconButton>
          {wallet.equipped.mount && (
            <HudIconButton
              active={mounted && !summonedMount}
              onClick={() => {
                const wasMounted = mounted && !summonedMount;
                setSummonedMount(null);
                setMounted(!wasMounted);
                addToast(wasMounted ? "🚶 탈것에서 내렸어요" : "🐺 탈것을 소환했어요");
              }}
              title="탈것 타기/내리기"
            >
              ◆
            </HudIconButton>
          )}
          <HudIconButton
            active={mounted && summonedMount === SPORTSCAR_SUMMON_KEY}
            onClick={summonCar}
            title={`자동차 소환/내리기 — ${CAR_SUMMON_COST}하트`}
          >
            ▰
          </HudIconButton>
          {wallet.inventory.includes("portable-piano") && (
            <HudIconButton
              active={pianoPlaced}
              onClick={() => {
                const e = engineRef.current;
                if (!e || !identity) return;
                const id = `piano-${identity.id}`;
                if (pianoPlaced) {
                  e.removeObject(id);
                  channelRef.current.send("obj-remove", { id });
                  setPianoPlaced(false);
                  addToast("🎹 휴대용 피아노를 회수했어요");
                } else {
                  const t = e.selfTile();
                  e.addObject({ id, type: "piano", x: t.x, y: t.y, name: "휴대용 피아노" });
                  channelRef.current.send("obj-place", { id, otype: "piano", x: t.x, y: t.y, name: "휴대용 피아노" });
                  setPianoPlaced(true);
                  addToast("🎹 피아노를 설치했어요 — X로 연주하세요");
                }
              }}
              title="휴대용 피아노 설치/회수"
            >
              ♪
            </HudIconButton>
          )}
          <HudIconButton
            onClick={() => setModal({ kind: "bio" })}
            title="내 소개 편집 — 근접한 상대에게 보여요"
          >
            i
          </HudIconButton>
          <HudIconButton
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/s/${space.slug}`);
              addToast("🔗 스페이스 초대 링크를 복사했어요");
            }}
            title="초대 링크 복사"
          >
            ↗
          </HudIconButton>
          <HudIconButton
            active={secretOpen}
            onClick={() => {
              setSecretOpen((v) => !v);
              setSecretArmed(false);
              setSecretCode("");
            }}
            title=" "
          >
            ·
          </HudIconButton>
          </div>
          <div className="hidden h-10 items-center rounded-lg border border-white/10 bg-[#101720]/80 px-3 text-xs shadow-xl backdrop-blur-xl lg:flex">
            {multiplayer ? (
              <span className={channel.ready ? "text-emerald-200" : "text-amber-200"}>
                ● {channel.ready ? Math.max(channel.online, players.length) : "..."}
              </span>
            ) : (
              <span className="text-amber-200">● solo</span>
            )}
          </div>
        </div>
      </div>

      {secretOpen && (
        <div className="pointer-events-auto absolute right-3 top-16 z-30 w-44 rounded-lg border border-white/10 bg-[#101720]/95 p-2 shadow-2xl backdrop-blur-xl">
          {!secretArmed ? (
            <button
              onClick={() => setSecretArmed(true)}
              className="grid h-9 w-full place-items-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white"
            >
              ·
            </button>
          ) : (
            <div className="flex gap-1.5">
              <input
                value={secretCode}
                autoFocus
                inputMode="numeric"
                maxLength={8}
                onChange={(e) => setSecretCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void redeemSecretCode();
                }}
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-200/50"
              />
              <button
                onClick={() => void redeemSecretCode()}
                className="grid h-9 w-9 place-items-center rounded-md bg-cyan-200 text-slate-950"
              >
                ↵
              </button>
            </div>
          )}
        </div>
      )}

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

      {/* 하이파이브 — 근접한 상대 소개 카드 (나에게만) */}
      {touchedPlayer && (() => {
        const cardKey = touchedPlayer.cosmetics?.card;
        const cardColor = cardKey ? SHOP_MAP[cardKey]?.color : undefined;
        const frameKey = touchedPlayer.cosmetics?.frame;
        const frameColor = frameKey ? SHOP_MAP[frameKey]?.color : undefined;
        return (
          <div
            className="pointer-events-none absolute right-3 top-24 z-20 w-64 overflow-hidden rounded-2xl border bg-panel/95 shadow-xl backdrop-blur"
            style={{ borderColor: cardColor ?? "rgba(244,114,182,0.4)" }}
          >
            {cardColor && (
              <div
                className="h-6 w-full"
                style={{
                  background:
                    cardColor === "rainbow"
                      ? "linear-gradient(90deg,#f87171,#fbbf24,#34d399,#38bdf8,#a78bfa)"
                      : `linear-gradient(90deg, ${cardColor}, transparent)`,
                }}
              />
            )}
            <div className="p-3">
              <div className="flex items-center gap-2">
                <span
                  className="grid h-8 w-8 place-items-center rounded-full text-lg"
                  style={frameColor ? { boxShadow: `0 0 0 2px ${frameColor === "rainbow" ? "#a78bfa" : frameColor}` } : undefined}
                >
                  💗
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{touchedPlayer.name}</div>
                  <div className="text-xs" style={{ color: STATUS_META[touchedPlayer.status]?.color }}>
                    {STATUS_META[touchedPlayer.status]?.emoji} {STATUS_META[touchedPlayer.status]?.label}
                  </div>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">
                {touchedPlayer.bio?.trim() ? (
                  touchedPlayer.bio
                ) : (
                  <span className="text-slate-500">아직 소개를 작성하지 않았어요.</span>
                )}
              </p>
            </div>
          </div>
        );
      })()}

      {starhallExhibit && (
        <div className="pointer-events-none absolute left-3 top-24 z-20 w-72 overflow-hidden rounded-xl border border-amber-200/25 bg-[#101720]/92 shadow-2xl backdrop-blur-xl">
          <div
            className="h-1.5"
            style={{ background: starhallExhibit.props?.color ?? "linear-gradient(90deg,#facc15,#67e8f9)" }}
          />
          <div className="p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-100/70">STAR HALL</div>
            <div className="mt-1 text-lg font-semibold text-white">{starhallExhibit.name}</div>
            {starhallExhibit.props?.title && <div className="text-sm text-cyan-100">{starhallExhibit.props.title}</div>}
            {starhallExhibit.props?.text && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{starhallExhibit.props.text}</p>
            )}
          </div>
        </div>
      )}

      {/* OX 퀴즈 참가자 배너 */}
      {quiz && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 w-[min(92vw,460px)] -translate-x-1/2 rounded-2xl border border-accent/40 bg-panel/95 p-3 text-center shadow-xl backdrop-blur">
          <div className="text-xs text-slate-400">🅾️❌ {quiz.hostName}님의 OX 퀴즈</div>
          <div className="mt-1 text-base font-semibold text-white">{quiz.text}</div>
          {!quiz.correct ? (
            <div className="mt-1 text-sm text-accent2">O존(초록) 또는 X존(빨강)으로 이동하세요!</div>
          ) : (
            <div className={`mt-1 text-sm font-bold ${quiz.myResult === "pass" ? "text-emerald-400" : "text-red-400"}`}>
              정답: {quiz.correct} · {quiz.myResult === "pass" ? "✅ 통과!" : "❌ 탈락"}
            </div>
          )}
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
          {!hintObj && nearWater ? <span className="text-cyan-300"> · 🎣 X로 낚시</span> : ""}
        </div>
        <div>1~0 이모지 · Z 춤 · X 의자 앉기 · F {liveMap.vehicle === "kart" ? "카트" : "오토바이"} · G 고스트 · M 미니맵</div>
      </div>

      {/* ---------- 레이스 HUD (그랑프리) ---------- */}
      {identity && <RaceHud state={raceState} leaderboard={leaderboard} selfId={identity.id} />}

      {/* ---------- 보스 레이드 배너 ---------- */}
      {bossHud?.alive && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-2xl border border-red-500/50 bg-panel/95 px-4 py-2 text-center shadow-xl backdrop-blur">
          <div className="text-sm font-bold text-red-300">
            {bossHud.hp / bossHud.maxHp <= 0.5 ? "STAGE 2 · " : ""}
            {bossHud.kind === "kraken" ? "🦑 크라켄" : bossHud.kind === "chicken" ? "🐔 알 쏘는 치킨" : "🦔 고슴도치"} 보스 레이드!
          </div>
          <div className="mx-auto mt-1 h-2.5 w-56 overflow-hidden rounded-full bg-black/50">
            <div className="h-full bg-red-500" style={{ width: `${Math.max(0, (bossHud.hp / bossHud.maxHp) * 100)}%` }} />
          </div>
          <div className="mt-1 text-xs text-slate-300">
            1초 차지 화살로 탄막 요격 · 아이템 로켓 15회 명중으로 처치
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {bossHud.kind === "kraken"
              ? "패턴: 파도 탄막 / 2스테이지 자녀·에너지볼·레이저·먹물"
              : bossHud.kind === "chicken"
                ? "패턴: 알 탄막 / 2스테이지 자녀·에너지볼·레이저"
                : "패턴: 사방 가시 / 2스테이지 자녀·에너지볼·레이저·용암"}
          </div>
        </div>
      )}

      {/* ---------- PK HUD (배틀 아레나) ---------- */}
      {liveMap.pk && identity && pkState && (
        <PkHud
          hp={pkState.hp}
          dead={pkState.dead}
          weapon={pkState.weapon}
          selfKills={pkState.kills}
          inventory={wallet.inventory}
          hearts={wallet.hearts}
          coins={wallet.coins}
          players={players}
          selfId={identity.id}
          onSetWeapon={(k) => {
            engineRef.current?.setWeapon(k);
            setPkState((p) => (p ? { ...p, weapon: k } : p));
          }}
          onBuyWeapon={(k) => {
            const wp = WEAPON_MAP[k];
            if (!wp) return;
            const invKey = `weapon-${k}`;
            if (wallet.inventory.includes(invKey)) return;
            const bal = wp.currency === "heart" ? wallet.hearts : wallet.coins;
            if (bal < wp.price) {
              addToast(wp.currency === "heart" ? "❌ 하트가 부족합니다." : "❌ 코인이 부족합니다.");
              return;
            }
            if (profile) {
              buyWeapon(k).then((res) => {
                if ("error" in res) addToast("❌ " + res.error);
                else {
                  setWallet((w) => ({ ...w, hearts: res.hearts, coins: res.coins, inventory: res.inventory }));
                  addToast("🔫 무기를 구매했어요!");
                }
              });
            } else {
              setWallet((w) => ({
                ...w,
                hearts: wp.currency === "heart" ? w.hearts - wp.price : w.hearts,
                coins: wp.currency === "coin" ? w.coins - wp.price : w.coins,
                inventory: [...w.inventory, invKey],
              }));
              addToast("🔫 무기를 구매했어요!");
            }
          }}
        />
      )}

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
              onAddFriend={doAddFriend}
              canFriend={!!profile}
              onKick={doKick}
              onBan={doBan}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "friends" && (
            <FriendsPanel
              players={players}
              onDm={(id) => {
                setPanel("chat");
                setChatTab({ kind: "dm", to: id });
                setUnreadDms((s) => {
                  const next = new Set(s);
                  next.delete(id);
                  return next;
                });
              }}
              onWalkTo={(id, name) => {
                engineRef.current?.walkToPlayer(id);
                addToast(`📍 ${name}님에게 이동합니다`);
              }}
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
          {panel === "store" && (
            <StoreModal
              wallet={wallet}
              loggedIn={!!profile}
              onChange={(w) => setWallet((prev) => ({ ...prev, ...w }))}
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
      {modal?.kind === "exhibit" && (
        <ExhibitModal obj={modal.obj} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "minigame" && (
        <MiniGamesModal
          initialGame={modal.game}
          onReward={(hearts) => {
            awardHearts(hearts, "미니게임 보상");
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "quiz" && identity && (
        <QuizModal
          active={!!quiz}
          onBroadcast={(kind, text, correct) => {
            const payload = { kind, host: identity.id, hostName: identity.name, text, correct };
            if (kind === "start") {
              setQuiz({ text: text ?? "", host: identity.id, hostName: identity.name });
              moveToQuizStart();
            }
            else if (kind === "end") setQuiz(null);
            else if (kind === "reveal") {
              const myArea = engineRef.current?.getSelf().areaId ?? null;
              const pass = myArea === (correct === "O" ? "quiz-o" : "quiz-x");
              setQuiz((cur) => (cur ? { ...cur, correct, myResult: pass ? "pass" : "fail" } : cur));
            }
            if (multiplayer) channelRef.current.send("quiz", payload);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "auction" && (
        <AuctionModal
          wallet={wallet}
          onChange={(w) => setWallet((prev) => ({ ...prev, ...w }))}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "collection" && (
        <CollectionModal
          raceWins={stats.raceWins}
          kills={stats.kills}
          titles={profile?.titles ?? []}
          inventoryCount={wallet.inventory.length}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "bank" && (
        <BankModal
          hearts={wallet.hearts}
          onHearts={(h) => setWallet((w) => ({ ...w, hearts: h }))}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "quest" && (
        <QuestModal
          loggedIn={!!profile}
          onGoto={(target) => {
            if (target === "customize") {
              router.push("/customize");
              return;
            }
            if (target === "store") {
              setModal(null);
              setPanel("store");
              return;
            }
            setModal({ kind: target });
          }}
          onReward={async () => {
            const res = await claimQuest();
            if ("error" in res) {
              addToast("❌ " + res.error);
              return null;
            }
            if (!res.already) setWallet((w) => ({ ...w, hearts: res.hearts }));
            return res.already ? "already" : res.hearts;
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "warp" && (
        <WarpModal
          rooms={rooms}
          currentRoomId={room.id}
          onWarp={(rid) => {
            setModal(null);
            if (rid !== room.id) {
              // 파티(내 양탄자 탑승자) 동시 이동
              if (multiplayer && ridersRef.current.size > 0) {
                channelRef.current.send("party-warp", {
                  by: identity?.id ?? "",
                  roomId: rid,
                  riders: [...ridersRef.current],
                });
                ridersRef.current.clear();
              }
              router.push(`/s/${space.id}/${rid}`);
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "bio" && (
        <BioModal
          initial={myBio}
          onSave={(text) => {
            applyBio(text);
            setModal(null);
          }}
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

// ---------- OX 파티 퀴즈 (진행자) ----------
function QuizModal({
  active,
  onBroadcast,
  onClose,
}: {
  active: boolean;
  onBroadcast: (kind: "start" | "reveal" | "end", text?: string, correct?: "O" | "X") => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <Modal title="🅾️❌ OX 파티 퀴즈 진행" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          문제를 내면 참가자들이 광장의 <b className="text-emerald-400">O존</b>/<b className="text-red-400">X존</b>으로 이동해요.
          정답을 공개하면 틀린 쪽이 탈락 처리됩니다.
        </p>
        <textarea
          className="input min-h-[80px] resize-none bg-panel2"
          placeholder="예) 지구는 평평하다? (O/X)"
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          onClick={() => {
            if (text.trim()) onBroadcast("start", text.trim());
          }}
          className="btn-primary w-full"
        >
          📢 문제 출제 (참가자 이동 시작)
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => onBroadcast("reveal", undefined, "O")}
            disabled={!active}
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-white disabled:opacity-40"
          >
            정답 공개: 🅾️ O
          </button>
          <button
            onClick={() => onBroadcast("reveal", undefined, "X")}
            disabled={!active}
            className="flex-1 rounded-lg bg-red-600 py-2 text-white disabled:opacity-40"
          >
            정답 공개: ❌ X
          </button>
        </div>
        <button onClick={() => onBroadcast("end")} disabled={!active} className="btn-ghost w-full disabled:opacity-40">
          퀴즈 종료
        </button>
      </div>
    </Modal>
  );
}

// ---------- 도감 (우승/킬/칭호) ----------
const TITLE_LABELS: Record<string, string> = {
  tutorial: "🌱 새싹 모험가",
  ...Object.fromEntries(KILL_TITLES.map((t) => [t.title, "🎖️ " + t.label])),
};
function CollectionModal({
  raceWins,
  kills,
  titles,
  inventoryCount,
  onClose,
}: {
  raceWins: number;
  kills: number;
  titles: string[];
  inventoryCount: number;
  onClose: () => void;
}) {
  return (
    <Modal title="📖 도감" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            ["🥇", "레이스 우승", raceWins],
            ["🎯", "누적 킬", kills],
            ["🎒", "보유 아이템", inventoryCount],
          ].map(([icon, label, val]) => (
            <div key={label as string} className="rounded-xl bg-panel2 p-3 text-center">
              <div className="text-2xl">{icon as string}</div>
              <div className="mt-1 text-lg font-bold text-white">{val as number}</div>
              <div className="text-xs text-slate-400">{label as string}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-sm text-slate-300">획득 칭호</div>
          {titles.length === 0 ? (
            <p className="rounded-xl bg-panel2/60 p-3 text-sm text-slate-500">
              아직 칭호가 없어요. 레이스 우승, PK 킬, 튜토리얼로 칭호를 모아보세요!
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {titles.map((t) => (
                <span key={t} className="rounded-full bg-accent/20 px-3 py-1 text-sm text-accent2">
                  {TITLE_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------- NPC 온보딩 퀘스트 ----------
function QuestModal({
  loggedIn,
  onGoto,
  onReward,
  onClose,
}: {
  loggedIn: boolean;
  onGoto: (target: "store" | "bio" | "warp" | "customize") => void;
  onReward: () => Promise<number | "already" | null>;
  onClose: () => void;
}) {
  const [rewardMsg, setRewardMsg] = useState<string | null>(null);
  const steps: { icon: string; title: string; desc: string; action?: () => void; label?: string }[] = [
    { icon: "🧑‍🎨", title: "캐릭터 꾸미기", desc: "나만의 아바타를 만들어보세요.", action: () => onGoto("customize"), label: "커스텀 열기" },
    { icon: "📝", title: "소개 작성", desc: "가까이 온 사람에게 보여줄 소개를 적어요.", action: () => onGoto("bio"), label: "소개 열기" },
    { icon: "💗", title: "하이파이브", desc: "다른 사람에게 다가가면 하트와 소개가 떠요." },
    { icon: "🛍️", title: "상점 구경", desc: "하트로 액자·펫·탈것을 사보세요.", action: () => onGoto("store"), label: "상점 열기" },
    { icon: "🌀", title: "워프 포탈", desc: "포탈에서 전체 지도를 열어 다른 곳으로 이동해요.", action: () => onGoto("warp"), label: "워프 열기" },
    { icon: "⭐", title: "스타홀 갤러리", desc: "명예의 전당에서 전시 인물의 이야기를 읽어요." },
  ];
  return (
    <Modal title="💬 안내원 삐삐" onClose={onClose}>
      <div className="space-y-3">
        <p className="rounded-xl bg-panel2 p-3 text-sm text-slate-200">
          어서 오세요! 처음이신가요? 아래를 하나씩 따라 해보면 금방 적응할 거예요. 다 둘러보면 보상을 드릴게요! 🎁
        </p>
        <ul className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl bg-panel2/60 p-2.5">
              <span className="text-xl">{s.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white">{s.title}</div>
                <div className="text-xs text-slate-400">{s.desc}</div>
              </div>
              {s.action && (
                <button
                  onClick={s.action}
                  className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-xs text-white hover:brightness-110"
                >
                  {s.label}
                </button>
              )}
            </li>
          ))}
        </ul>
        {loggedIn ? (
          <button
            onClick={async () => {
              const r = await onReward();
              if (r === "already") setRewardMsg("이미 보상을 받았어요. 즐겁게 플레이하세요! 😊");
              else if (typeof r === "number") setRewardMsg("🎁 튜토리얼 완료 보상 💗100 하트를 받았어요!");
            }}
            className="btn-primary w-full"
          >
            🎁 튜토리얼 완료 보상 받기 (💗100)
          </button>
        ) : (
          <p className="text-center text-xs text-slate-500">로그인하면 완료 보상을 받을 수 있어요.</p>
        )}
        {rewardMsg && <p className="text-center text-sm text-accent2">{rewardMsg}</p>}
      </div>
    </Modal>
  );
}

// ---------- 워프(전체 미니맵) ----------
function RoomThumb({ templateKey }: { templateKey: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const map = getPreset(templateKey);
    const rows = map.tiles.length;
    const cols = Math.max(...map.tiles.map((r) => r.length));
    cv.width = cols;
    cv.height = rows;
    const g = cv.getContext("2d");
    if (!g) return;
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < map.tiles[r].length; cc++) {
        g.fillStyle = TILE_INFO[map.tiles[r][cc]]?.color ?? "#12161f";
        g.fillRect(cc, r, 1, 1);
      }
    }
  }, [templateKey]);
  return <canvas ref={ref} className="h-full w-full [image-rendering:pixelated]" />;
}

function WarpModal({
  rooms,
  currentRoomId,
  onWarp,
  onClose,
}: {
  rooms: RoomRecord[];
  currentRoomId: string;
  onWarp: (roomId: string) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!sel) return;
    setProgress(0);
    const start = Date.now();
    const dur = 2500;
    const t = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / dur);
      setProgress(p);
      if (p >= 1) {
        clearInterval(t);
        onWarp(sel);
      }
    }, 50);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  return (
    <Modal title="🌀 워프 — 전체 지도" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          이동할 장소를 선택하면 2.5초 게이지가 찬 뒤 워프합니다. (도중에 취소 가능)
        </p>
        <div className="grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {rooms.map((r) => {
            const isCurrent = r.id === currentRoomId;
            const isSel = sel === r.id;
            return (
              <button
                key={r.id}
                disabled={isCurrent}
                onClick={() => setSel(isSel ? null : r.id)}
                className={`relative overflow-hidden rounded-xl border text-left transition ${
                  isCurrent
                    ? "border-emerald-500/50 opacity-60"
                    : isSel
                      ? "border-accent ring-2 ring-accent"
                      : "border-white/10 hover:border-white/30"
                }`}
              >
                <div className="h-20 w-full bg-[#0b1020]">
                  <RoomThumb templateKey={r.template_key} />
                </div>
                <div className="px-2 py-1.5">
                  <div className="truncate text-sm font-medium text-white">{r.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {isCurrent ? "현재 위치" : isSel ? `워프 중... ${Math.round(progress * 100)}%` : "선택"}
                  </div>
                </div>
                {isSel && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-accent" style={{ width: `${progress * 100}%` }} />
                )}
              </button>
            );
          })}
        </div>
        {sel && (
          <button onClick={() => setSel(null)} className="btn-ghost w-full text-sm">
            취소
          </button>
        )}
      </div>
    </Modal>
  );
}

// ---------- 스타홀 전시대 정보 ----------
function ExhibitModal({ obj, onClose }: { obj: MapObject; onClose: () => void }) {
  const head = obj.props?.head;
  return (
    <Modal title={`⭐ ${obj.name ?? "전시 인물"}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-4">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border-4 border-amber-500/70 bg-gradient-to-b from-slate-700 to-slate-900 shadow-lg">
            {head ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headImgUrl(head)}
                alt={obj.name ?? ""}
                className="absolute left-1/2 top-1 h-28 w-28 -translate-x-1/2"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-3xl">🖼️</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-white">{obj.name}</div>
            {obj.props?.title && (
              <div className="mt-0.5 inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                {obj.props.title}
              </div>
            )}
          </div>
        </div>
        <p className="whitespace-pre-wrap rounded-xl bg-panel2 p-3 text-sm leading-relaxed text-slate-200">
          {obj.props?.text ?? "소개가 준비 중입니다."}
        </p>
      </div>
    </Modal>
  );
}

// ---------- 소개(bio) 편집 ----------
function BioModal({
  initial,
  onSave,
  onClose,
}: {
  initial: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <Modal title="📝 내 소개" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          다른 사람이 나에게 가까이 닿으면 이 소개가 프로필 카드로 보여요. 계정에 영구 저장됩니다.
        </p>
        <textarea
          className="input min-h-[110px] resize-none bg-panel2"
          placeholder="예) 안녕하세요! 디자인을 좋아하는 000입니다. 편하게 말 걸어주세요 😊"
          maxLength={200}
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{text.length}/200</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
              나중에
            </button>
            <button onClick={() => onSave(text.trim())} className="btn-primary px-4 py-2 text-sm">
              저장
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// 맵 에디터는 큰 컴포넌트라 필요할 때만 로드
const MapEditorLazy = dynamic(() => import("./MapEditor"), { ssr: false });

function HudIconButton({
  children,
  title,
  active,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-9 min-w-9 place-items-center rounded-md px-2 text-sm font-semibold transition ${
        active
          ? "bg-cyan-300 text-slate-950 shadow-[0_0_18px_rgba(103,232,249,0.35)]"
          : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
