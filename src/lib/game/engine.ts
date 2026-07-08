// 한 방(Room)의 게임 시뮬레이션 + 렌더링.
import {
  MapData,
  MapObject,
  Portal,
  PrivateArea,
  areaAtPx,
  bikeZoneAt,
  boostAt,
  buildSolidGrid,
  inRaceRect,
  isSolidPx,
  mapPixelSize,
  nearestInteractive,
  offroadAt,
  portalAtPx,
  spawnPoint,
  spotlightAtPx,
} from "./maps";
import { OBJECT_DEFS } from "./objects";
import { drawCharacter, drawObject, drawObjectTop, drawTile } from "./sprites";
import {
  BIKE_SPEED,
  BOOST_MS,
  BOOST_MULT,
  NET_TICK,
  OFFROAD_MULT,
  PLAYER_RADIUS,
  PROXIMITY_TILES,
  TILE,
  WALK_SPEED,
} from "./constants";
import { findPath, type PathNode } from "./pathfinding";
import { WEAPON_MAP, MAX_HP, RESPAWN_MS } from "./weapons";
import type {
  CharacterAppearance,
  Direction,
  EmoteMessage,
  PlayerCosmetics,
  PlayerState,
  UserStatus,
} from "./types";

interface ActiveEmote extends EmoteMessage {
  expires: number;
}

// 캐릭터 몸이 서로 "닿는" 것으로 간주하는 최대 거리(px).
const TOUCH_PX = TILE * 1.15;

// 레이스 이벤트 (그랑프리)
export interface RaceEvent {
  kind: "start" | "lap" | "finish" | "reset";
  lap: number;
  laps: number;
  lapMs?: number;
  totalMs?: number;
  bestLapMs?: number;
}

export interface RaceState {
  active: boolean;
  lap: number;
  laps: number;
  cpIndex: number;
  cpTotal: number;
  elapsedMs: number;
  lapElapsedMs: number;
  bestLapMs: number | null;
}

export interface EngineCallbacks {
  onState: (s: PlayerState) => void; // 주기적 위치 전송
  onAreaChange?: (area: PrivateArea | null) => void;
  onPortal?: (portal: Portal) => void;
  onInteractHint?: (obj: MapObject | null) => void;
  onPlayerClick?: (id: string, screenX: number, screenY: number) => void;
  onAreaBlocked?: (area: PrivateArea, reason: "locked" | "full") => void;
  onRace?: (ev: RaceEvent) => void;
  onItem?: (kind: RaceItemKind) => void; // 레이스 아이템 획득/기름 밟음
  onTouch?: (id: string | null) => void; // 근접(닿음)한 상대 — 하트/소개 팝업
  onGhost?: (active: boolean) => void; // 고스트 모드 토글
  onShot?: (p: ShotPayload) => void; // PK 발사(브로드캐스트용)
  onKillBroadcast?: (p: KillPayload) => void; // 내가 죽었을 때 킬 정보 브로드캐스트
  onDeath?: (killerName: string) => void; // 내가 죽음
  onKill?: (victimName: string) => void; // 내가 상대를 처치
  onRespawn?: () => void;
}

export type RaceItemKind = "turbo" | "boost" | "slow" | "oil" | "rocket" | "ink" | "meteor";

// PK 투사체
interface Projectile {
  id: string;
  from: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  weapon: string;
  traveled: number;
  maxDist: number;
  mine: boolean;
}
interface Effect {
  kind: "explosion" | "smoke";
  x: number;
  y: number;
  r: number;
  until: number;
  born: number;
}

// PK 발사 브로드캐스트 payload
export interface ShotPayload {
  id: string;
  from: string;
  x: number;
  y: number;
  angle: number;
  weapon: string;
}
export interface KillPayload {
  killer: string;
  killerName: string;
  victim: string;
  victimName: string;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  map: MapData;
  private solid: boolean[][] = [];
  private ground: HTMLCanvasElement | null = null;
  private cb: EngineCallbacks;

  private keys = new Set<string>();
  private raf = 0;
  private last = 0;
  private lastSent = 0;
  private lastSentSig = ""; // 마지막으로 전송한 상태 시그니처 (변경 시에만 전송)

  private self: PlayerState;
  // lastMoveAt: 마지막 move 브로드캐스트 수신 시각 — presence 보정/제거 판단에 사용
  private others = new Map<string, PlayerState & { tx: number; ty: number; lastMoveAt: number }>();
  private emotes = new Map<string, ActiveEmote[]>();
  private deskOwners = new Map<string, string>(); // object id -> 이름

  private path: PathNode[] = [];
  private pathTarget: PathNode | null = null;
  private followId: string | null = null;
  private seat: { objId: string; prevX: number; prevY: number } | null = null; // 앉기 전 위치 복원용

  private currentArea: PrivateArea | null = null;
  private lockedAreas = new Set<string>();
  private portalArmed = true; // 포털 재발동 방지
  private hintObj: MapObject | null = null;
  private touchedId: string | null = null; // 근접(닿음)한 상대 — 하트 표시 대상

  private bikeCooldown = 0;
  private ghostUntil = 0; // 고스트 모드 만료 시각(performance.now 기준)
  // PK 전투
  private projectiles: Projectile[] = [];
  private effects: Effect[] = [];
  private lastFire = 0;
  private aimAngle = 0;
  private lastHitFrom: string | null = null;
  private respawnAt = 0;
  // 레이스 아이템 (아이템 박스/기름 웅덩이)
  private raceItems: MapObject[] = [];
  private itemCooldowns = new Map<string, number>(); // object id -> 다시 활성화되는 시각
  private effectMult = 1; // 아이템 효과 배속
  private effectUntil = 0;
  private stunUntil = 0; // 운석/폭탄 스턴 (이동 불가)
  private inkUntil = 0; // 먹물 (시야 가림)
  // 레이스 상태
  private boostUntil = 0;
  private raceActive = false;
  private raceLap = 0;
  private raceCpIndex = 0;
  private raceStart = 0;
  private lapStart = 0;
  private bestLapMs: number | null = null;
  private wasInStartRect = false;
  private cam = { x: 0, y: 0 };
  zoom = 1;
  showMinimap = true;
  editorMode = false;
  private running = false;
  inputLocked = false; // 모달 열림 등

  constructor(
    canvas: HTMLCanvasElement,
    map: MapData,
    id: string,
    name: string,
    appearance: CharacterAppearance,
    cb: EngineCallbacks,
    opts?: {
      spawn?: { x: number; y: number };
      guest?: boolean;
      status?: UserStatus;
      bio?: string;
      cosmetics?: PlayerCosmetics;
    }
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.map = map;
    this.cb = cb;
    this.solid = buildSolidGrid(map);

    const sp = opts?.spawn ?? spawnPoint(map, Math.floor(Math.random() * 4));
    this.self = {
      id,
      name,
      x: sp.x * TILE + TILE / 2,
      y: sp.y * TILE + TILE / 2,
      dir: "down",
      moving: false,
      onBike: false,
      dancing: false,
      sitting: false,
      appearance,
      status: opts?.status ?? "available",
      areaId: null,
      spotlight: false,
      hand: false,
      guest: opts?.guest ?? false,
      bio: opts?.bio,
      cosmetics: opts?.cosmetics,
      mounted: false,
      hp: MAX_HP,
      dead: false,
      weapon: "pistol",
      kills: 0,
    };
    this.raceItems = map.objects.filter((o) => o.type === "itembox" || o.type === "oil");
  }

  // ---------- 라이프사이클 ----------

  start() {
    this.running = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
    this.canvas.addEventListener("dblclick", this.onDblClick);
    this.canvas.addEventListener("click", this.onClick);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.renderGround();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearKeys);
    this.canvas.removeEventListener("dblclick", this.onDblClick);
    this.canvas.removeEventListener("click", this.onClick);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
  }

  setMap(map: MapData, keepPosition = true) {
    this.map = map;
    this.solid = buildSolidGrid(map);
    this.renderGround();
    this.raceItems = map.objects.filter((o) => o.type === "itembox" || o.type === "oil");
    this.itemCooldowns.clear();
    if (this.seat) this.standUp(); // 좌석 오브젝트가 사라졌을 수 있음
    if (!keepPosition) {
      const sp = spawnPoint(map);
      this.self.x = sp.x * TILE + TILE / 2;
      this.self.y = sp.y * TILE + TILE / 2;
    }
    this.path = [];
    this.pathTarget = null;
  }

  // 바닥 타일을 오프스크린 캔버스에 미리 그린다 (성능).
  private renderGround() {
    const { w, h } = mapPixelSize(this.map);
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const g = cv.getContext("2d")!;
    for (let r = 0; r < this.map.tiles.length; r++) {
      const line = this.map.tiles[r];
      for (let c = 0; c < line.length; c++) {
        drawTile(g, line[c], c, r);
      }
    }
    this.ground = cv;
  }

  // ---------- 외부 API ----------

  updateAppearance(app: CharacterAppearance, name: string) {
    this.self.appearance = app;
    this.self.name = name;
  }

  patchSelf(patch: Partial<PlayerState>) {
    Object.assign(this.self, patch);
    this.pushState();
  }

  teleport(tileX: number, tileY: number) {
    this.seat = null;
    this.self.sitting = false;
    this.self.x = tileX * TILE + TILE / 2;
    this.self.y = tileY * TILE + TILE / 2;
    this.path = [];
    this.pathTarget = null;
    this.portalArmed = false;
    this.pushState();
  }

  walkToTile(tx: number, ty: number) {
    if (this.seat) this.standUp();
    const sx = Math.floor(this.self.x / TILE);
    const sy = Math.floor(this.self.y / TILE);
    const p = findPath(this.solid, sx, sy, tx, ty);
    if (p) {
      this.path = p;
      this.pathTarget = p.length ? p[p.length - 1] : null;
    }
  }

  walkToPlayer(id: string) {
    const p = this.others.get(id);
    if (!p) return;
    this.walkToTile(Math.floor(p.tx / TILE), Math.floor(p.ty / TILE));
  }

  // ---------- 앉기 ----------

  isSitting() {
    return !!this.seat;
  }

  // 의자/소파/벤치에 앉기. 잠긴 영역 안의 좌석이면 실패(false).
  sitOn(obj: MapObject): boolean {
    if (this.self.onBike) return false;
    const def = OBJECT_DEFS[obj.type];
    if (!def) return false;
    const cx = (obj.x + def.w / 2) * TILE;
    const cy = (obj.y + def.h / 2) * TILE + 4;
    const area = areaAtPx(this.map, cx, cy);
    if (area && this.currentArea?.id !== area.id && this.lockedAreas.has(area.id)) {
      this.notifyBlocked(area, "locked");
      return false;
    }
    const isBed = obj.type === "bed";
    this.seat = { objId: obj.id, prevX: this.self.x, prevY: this.self.y };
    this.self.x = cx;
    this.self.y = cy;
    this.self.sitting = !isBed;
    this.self.lying = isBed;
    this.self.moving = false;
    this.self.dancing = false;
    this.self.dir = obj.dir === "up" ? "up" : "down";
    this.path = [];
    this.pathTarget = null;
    this.followId = null;
    this.pushState();
    return true;
  }

  standUp() {
    if (!this.seat) return;
    // 좌석이 벽/가구(솔리드) 위일 수 있으므로 앉기 전 위치로 복원
    this.self.x = this.seat.prevX;
    this.self.y = this.seat.prevY;
    this.seat = null;
    this.self.sitting = false;
    this.self.lying = false;
    this.pushState();
  }

  setFollow(id: string | null) {
    this.followId = id;
  }
  getFollow() {
    return this.followId;
  }

  setLockedAreas(ids: Set<string>) {
    this.lockedAreas = ids;
  }
  isAreaLocked(id: string) {
    return this.lockedAreas.has(id);
  }

  setDeskOwners(m: Map<string, string>) {
    this.deskOwners = m;
  }

  // 런타임에 오브젝트 추가/제거 (휴대용 피아노 등). 충돌 그리드 재계산.
  addObject(obj: MapObject) {
    if (this.map.objects.some((o) => o.id === obj.id)) return;
    this.map.objects.push(obj);
    this.solid = buildSolidGrid(this.map);
  }
  removeObject(id: string) {
    const idx = this.map.objects.findIndex((o) => o.id === id);
    if (idx < 0) return;
    this.map.objects.splice(idx, 1);
    this.solid = buildSolidGrid(this.map);
  }
  hasObject(id: string) {
    return this.map.objects.some((o) => o.id === id);
  }
  selfTile() {
    return { x: Math.floor(this.self.x / TILE), y: Math.floor(this.self.y / TILE) };
  }

  upsertOther(p: PlayerState) {
    if (p.id === this.self.id) return;
    const now = performance.now();
    const existing = this.others.get(p.id);
    if (existing) {
      // 순간이동/대량 유실 등으로 목표가 멀면 스냅 (맵을 가로질러 미끄러지는 현상 방지)
      const far = Math.hypot(p.x - existing.x, p.y - existing.y) > TILE * 6;
      Object.assign(existing, {
        ...p,
        x: far ? p.x : existing.x,
        y: far ? p.y : existing.y,
        tx: p.x,
        ty: p.y,
        lastMoveAt: now,
      });
    } else {
      this.others.set(p.id, { ...p, tx: p.x, ty: p.y, lastMoveAt: now });
    }
  }

  removeOther(id: string) {
    this.others.delete(id);
  }

  reconcileRoster(list: PlayerState[]) {
    const now = performance.now();
    const ids = new Set(list.map((p) => p.id));
    for (const [id, o] of Array.from(this.others.entries())) {
      // presence 가 잠깐 끊겨도(플랩) 최근에 move 를 보낸 플레이어는 유지 —
      // 즉시 지우면 캐릭터가 깜빡이며 사라진다.
      if (!ids.has(id) && now - o.lastMoveAt > 8000) this.others.delete(id);
    }
    for (const p of list) {
      if (p.id === this.self.id) continue;
      const existing = this.others.get(p.id);
      if (existing) {
        // 위치 목표는 broadcast 가 담당 — 메타만 갱신.
        existing.name = p.name;
        existing.appearance = p.appearance;
        existing.status = p.status;
        existing.statusMsg = p.statusMsg;
        existing.hand = p.hand;
        existing.bio = p.bio;
        existing.ghost = p.ghost;
        existing.cosmetics = p.cosmetics;
        existing.mounted = p.mounted;
        existing.hp = p.hp;
        existing.dead = p.dead;
        existing.weapon = p.weapon;
        existing.kills = p.kills;
        // presence 위치는 최대 3초 묵은 값이므로, 이동 중(최근 move 수신)인
        // 플레이어에게 덮어쓰면 뒤로 순간이동(고무줄)한다.
        // move 가 한동안 없을 때만 presence 위치로 수렴.
        if (
          now - existing.lastMoveAt > 4000 &&
          Math.hypot(p.x - existing.tx, p.y - existing.ty) > TILE
        ) {
          existing.tx = p.x;
          existing.ty = p.y;
        }
      } else {
        this.others.set(p.id, { ...p, tx: p.x, ty: p.y, lastMoveAt: 0 });
      }
    }
  }

  addEmote(playerId: string, e: EmoteMessage) {
    const arr = this.emotes.get(playerId) ?? [];
    const dur = e.kind === "chat" ? 5200 : 2600;
    arr.push({ ...e, expires: performance.now() + dur });
    while (arr.length > 3) arr.shift();
    this.emotes.set(playerId, arr);
  }

  getSelf(): PlayerState {
    return { ...this.self };
  }

  getOthers(): PlayerState[] {
    return [...this.others.values()];
  }

  getNearbyIds(maxTiles = PROXIMITY_TILES): string[] {
    const out: string[] = [];
    const maxPx = maxTiles * TILE;
    this.others.forEach((p) => {
      if (Math.hypot(p.x - this.self.x, p.y - this.self.y) <= maxPx) out.push(p.id);
    });
    return out;
  }

  getHintObject() {
    return this.hintObj;
  }

  getTouchedId() {
    return this.touchedId;
  }

  screenToTile(sx: number, sy: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = (sx - rect.left) / this.zoom + this.cam.x;
    const y = (sy - rect.top) / this.zoom + this.cam.y;
    return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
  }

  // ---------- 입력 ----------

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || this.inputLocked) return;
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
      e.preventDefault();
    }
    this.keys.add(k);
    if (k === "f") this.tryToggleBike();
    if (k === "z") this.toggleDance();
    if (k === "g") this.toggleGhost();
    if (k === " ") {
      if (this.isPk() && !this.self.dead) this.fire(this.aimAngle);
      else if (this.self.onBike) this.tryTurbo();
    }
  };

  private turboReady = 0; // 스페이스 터보 재사용 가능 시각
  private tryTurbo() {
    const now = performance.now();
    if (now < this.turboReady) return;
    this.turboReady = now + 8000; // 8초 쿨다운
    this.effectMult = 1.7;
    this.effectUntil = now + 1200;
    this.cb.onItem?.("turbo");
  }

  private toggleGhost() {
    // 탈것 탑승 중에는 고스트 불가
    if (this.self.onBike) return;
    if (this.self.ghost) {
      this.self.ghost = false;
      this.ghostUntil = 0;
      this.cb.onGhost?.(false);
    } else {
      this.self.ghost = true;
      this.ghostUntil = performance.now() + 10_000;
      this.cb.onGhost?.(true);
    }
    this.pushState();
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private clearKeys = () => this.keys.clear();

  private onDblClick = (e: MouseEvent) => {
    if (this.inputLocked || this.editorMode) return;
    const t = this.screenToTile(e.clientX, e.clientY);
    this.followId = null;
    this.walkToTile(t.x, t.y);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.isPk()) this.setAimFromScreen(e.clientX, e.clientY);
  };

  private onClick = (e: MouseEvent) => {
    if (this.editorMode) return;
    // PK 존: 클릭한 방향으로 발사
    if (this.isPk() && !this.inputLocked) {
      this.setAimFromScreen(e.clientX, e.clientY);
      this.fire(this.aimAngle);
      return;
    }
    // 플레이어 클릭 감지
    const rect = this.canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left) / this.zoom + this.cam.x;
    const wy = (e.clientY - rect.top) / this.zoom + this.cam.y;
    let hit: string | null = null;
    this.others.forEach((p) => {
      if (Math.abs(p.x - wx) < 16 && wy > p.y - 52 && wy < p.y + 8) hit = p.id;
    });
    if (hit) this.cb.onPlayerClick?.(hit, e.clientX, e.clientY);
  };

  private tryToggleBike() {
    if (this.bikeCooldown > 0 || this.seat) return;
    if (this.self.onBike) {
      this.self.onBike = false;
      this.bikeCooldown = 350;
      this.resetRace();
    } else if (bikeZoneAt(this.map, this.self.x, this.self.y)) {
      this.self.onBike = true;
      this.self.dancing = false;
      // 탈것 탑승 시 고스트 해제 (탈것에는 적용 안 됨)
      if (this.self.ghost) {
        this.self.ghost = false;
        this.ghostUntil = 0;
        this.cb.onGhost?.(false);
      }
      this.bikeCooldown = 350;
    }
  }

  private toggleDance() {
    if (this.self.onBike || this.seat) return;
    this.self.dancing = !this.self.dancing;
    this.pushState();
  }

  // ---------- 레이스 (그랑프리) ----------

  private resetRace() {
    if (this.raceActive) {
      this.raceActive = false;
      this.cb.onRace?.({
        kind: "reset",
        lap: this.raceLap,
        laps: this.map.race?.laps ?? 3,
      });
    }
    this.raceLap = 0;
    this.raceCpIndex = 0;
    this.wasInStartRect = false;
  }

  getRaceState(): RaceState | null {
    const race = this.map.race;
    if (!race) return null;
    const now = performance.now();
    return {
      active: this.raceActive,
      lap: this.raceLap,
      laps: race.laps,
      cpIndex: this.raceCpIndex,
      cpTotal: race.checkpoints.length,
      elapsedMs: this.raceActive ? now - this.raceStart : 0,
      lapElapsedMs: this.raceActive ? now - this.lapStart : 0,
      bestLapMs: this.bestLapMs,
    };
  }

  private updateRace(now: number) {
    const race = this.map.race;
    if (!race) return;
    if (!this.self.onBike) {
      this.wasInStartRect = false;
      return;
    }

    // 체크포인트 순서대로 통과
    if (this.raceActive && this.raceCpIndex < race.checkpoints.length) {
      if (inRaceRect(race.checkpoints[this.raceCpIndex], this.self.x, this.self.y)) {
        this.raceCpIndex++;
      }
    }

    // 출발/결승선 진입 에지 감지
    const inStart = inRaceRect(race.start, this.self.x, this.self.y);
    if (inStart && !this.wasInStartRect) {
      if (!this.raceActive) {
        // 레이스 시작
        this.raceActive = true;
        this.raceLap = 1;
        this.raceCpIndex = 0;
        this.raceStart = now;
        this.lapStart = now;
        this.cb.onRace?.({ kind: "start", lap: 1, laps: race.laps });
      } else if (this.raceCpIndex >= race.checkpoints.length) {
        // 랩 완료 (모든 CP 통과 후 결승선)
        const lapMs = now - this.lapStart;
        if (this.bestLapMs === null || lapMs < this.bestLapMs) this.bestLapMs = lapMs;
        if (this.raceLap >= race.laps) {
          const totalMs = now - this.raceStart;
          this.raceActive = false;
          this.cb.onRace?.({
            kind: "finish",
            lap: this.raceLap,
            laps: race.laps,
            lapMs,
            totalMs,
            bestLapMs: this.bestLapMs,
          });
          this.raceLap = 0;
          this.raceCpIndex = 0;
        } else {
          this.raceLap++;
          this.raceCpIndex = 0;
          this.lapStart = now;
          this.cb.onRace?.({
            kind: "lap",
            lap: this.raceLap,
            laps: race.laps,
            lapMs,
            bestLapMs: this.bestLapMs,
          });
        }
      }
    }
    this.wasInStartRect = inStart;
  }

  // ---------- PK 전투 (아레나) ----------

  isPk() {
    return this.map.pk === true;
  }
  getSelfHp() {
    return this.self.hp ?? MAX_HP;
  }
  isDead() {
    return !!this.self.dead;
  }
  getWeapon() {
    return this.self.weapon ?? "pistol";
  }
  setWeapon(key: string) {
    if (WEAPON_MAP[key]) {
      this.self.weapon = key;
      this.pushState();
    }
  }

  // 조준 각도 갱신 (마우스 월드 좌표 기준)
  setAimFromScreen(sx: number, sy: number) {
    const rect = this.canvas.getBoundingClientRect();
    const wx = (sx - rect.left) / this.zoom + this.cam.x;
    const wy = (sy - rect.top) / this.zoom + this.cam.y;
    this.aimAngle = Math.atan2(wy - this.self.y, wx - this.self.x);
  }

  // 발사 (angle 라디안). 무기의 pellet/spread 만큼 투사체 생성 + 브로드캐스트.
  fire(angle: number) {
    if (!this.isPk() || this.self.dead) return;
    const w = WEAPON_MAP[this.self.weapon ?? "pistol"];
    if (!w) return;
    const now = performance.now();
    if (now < this.lastFire + w.cooldownMs) return;
    this.lastFire = now;
    for (let i = 0; i < w.pellets; i++) {
      const spread = w.spreadDeg ? ((Math.random() - 0.5) * w.spreadDeg * Math.PI) / 180 : 0;
      const a = angle + spread;
      const id = `sh${now.toFixed(0)}_${i}_${Math.random().toString(36).slice(2, 5)}`;
      const payload: ShotPayload = { id, from: this.self.id, x: this.self.x, y: this.self.y, angle: a, weapon: w.key };
      this.spawnProjectile(payload, true);
      this.cb.onShot?.(payload);
    }
  }

  receiveShot(p: ShotPayload) {
    if (!this.isPk()) return;
    if (p.from === this.self.id) return; // 내 발사는 로컬에서 이미 생성
    this.spawnProjectile(p, false);
  }

  private spawnProjectile(p: ShotPayload, mine: boolean) {
    const w = WEAPON_MAP[p.weapon];
    if (!w) return;
    const speed = w.kind === "melee" ? 900 : w.speed;
    this.projectiles.push({
      id: p.id,
      from: p.from,
      x: p.x,
      y: p.y,
      vx: Math.cos(p.angle) * speed,
      vy: Math.sin(p.angle) * speed,
      weapon: p.weapon,
      traveled: 0,
      maxDist: w.rangePx,
      mine,
    });
  }

  private explode(x: number, y: number, w: (typeof WEAPON_MAP)[string], from: string) {
    const now = performance.now();
    if (w.kind === "smoke") {
      this.effects.push({ kind: "smoke", x, y, r: w.radiusPx ?? 90, until: now + 6000, born: now });
      return;
    }
    this.effects.push({ kind: "explosion", x, y, r: w.radiusPx ?? 40, until: now + 350, born: now });
    // 광역 데미지 (자신에게만 판정)
    if (from !== this.self.id && !this.self.dead) {
      const d = Math.hypot(x - this.self.x, y - this.self.y);
      if (d <= (w.radiusPx ?? 40)) {
        const falloff = 1 - d / (w.radiusPx ?? 40);
        this.applyDamage(Math.round(w.damage * (0.5 + falloff * 0.5)), from);
      }
    }
  }

  private applyDamage(dmg: number, from: string) {
    if (dmg <= 0 || this.self.dead) return;
    this.self.hp = Math.max(0, (this.self.hp ?? MAX_HP) - dmg);
    this.lastHitFrom = from;
    if (this.self.hp <= 0) this.die();
    else this.pushState();
  }

  private die() {
    if (this.self.dead) return;
    this.self.dead = true;
    this.self.hp = 0;
    this.self.moving = false;
    this.path = [];
    this.respawnAt = performance.now() + RESPAWN_MS;
    const killer = this.lastHitFrom;
    const kName = killer ? this.others.get(killer)?.name ?? "" : "";
    this.cb.onDeath?.(kName);
    if (killer) {
      this.cb.onKillBroadcast?.({
        killer,
        killerName: kName,
        victim: this.self.id,
        victimName: this.self.name,
      });
    }
    this.pushState();
  }

  // 다른 곳에서 온 kill 이벤트 — 내가 킬러면 킬 수 증가
  receiveKill(p: KillPayload) {
    if (p.killer !== this.self.id) return;
    this.self.kills = (this.self.kills ?? 0) + 1;
    this.cb.onKill?.(p.victimName);
    this.pushState();
  }

  private respawn() {
    const sp = this.map.spawns[Math.floor(Math.random() * Math.max(1, this.map.spawns.length))] ?? { x: 2, y: 2 };
    this.self.x = sp.x * TILE + TILE / 2;
    this.self.y = sp.y * TILE + TILE / 2;
    this.self.hp = MAX_HP;
    this.self.dead = false;
    this.lastHitFrom = null;
    this.cb.onRespawn?.();
    this.pushState();
  }

  private updatePk(dt: number, now: number) {
    // 부활
    if (this.self.dead && now >= this.respawnAt) this.respawn();

    // 투사체 이동/충돌
    const remain: Projectile[] = [];
    for (const pr of this.projectiles) {
      const w = WEAPON_MAP[pr.weapon];
      if (!w) continue;
      const step = Math.hypot(pr.vx, pr.vy) * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.traveled += step;
      let consumed = false;
      // 벽/엄폐물 충돌
      if (isSolidPx(this.solid, pr.x, pr.y)) {
        if (w.radiusPx) this.explode(pr.x, pr.y, w, pr.from);
        consumed = true;
      }
      // 사거리 초과
      if (!consumed && pr.traveled >= pr.maxDist) {
        if (w.radiusPx) this.explode(pr.x, pr.y, w, pr.from);
        consumed = true;
      }
      // 자신 피격 판정 (내가 쏜 것 제외)
      if (!consumed && pr.from !== this.self.id && !this.self.dead && !this.self.ghost) {
        const d = Math.hypot(pr.x - this.self.x, pr.y - this.self.y);
        if (d < PLAYER_RADIUS + 4) {
          if (w.radiusPx) this.explode(pr.x, pr.y, w, pr.from);
          else this.applyDamage(w.damage, pr.from);
          consumed = true;
        }
      }
      if (!consumed) remain.push(pr);
    }
    this.projectiles = remain;

    // 이펙트 만료
    this.effects = this.effects.filter((e) => e.until > now);
  }

  // ---------- 루프 ----------

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt, now);
    this.render(now);
    this.raf = requestAnimationFrame(this.loop);
  };

  private pushState() {
    this.cb.onState(this.getSelf());
  }

  private update(dt: number, now: number) {
    if (this.bikeCooldown > 0) this.bikeCooldown -= dt * 1000;

    // 고스트 모드 자동 해제 (10초)
    if (this.self.ghost && now >= this.ghostUntil) {
      this.self.ghost = false;
      this.ghostUntil = 0;
      this.cb.onGhost?.(false);
      this.pushState();
    }

    let dx = 0;
    let dy = 0;
    if (!this.inputLocked) {
      const k = this.keys;
      if (k.has("arrowup") || k.has("w")) dy -= 1;
      if (k.has("arrowdown") || k.has("s")) dy += 1;
      if (k.has("arrowleft") || k.has("a")) dx -= 1;
      if (k.has("arrowright") || k.has("d")) dx += 1;
    }

    // PK 사망 / 레이스 스턴(운석·폭탄) 중에는 이동 불가
    if (this.self.dead || now < this.stunUntil) {
      dx = 0;
      dy = 0;
    }

    // 키 입력이 있으면 자동 이동 취소 + 앉아 있으면 일어남
    if (dx !== 0 || dy !== 0) {
      if (this.seat) this.standUp();
      this.path = [];
      this.pathTarget = null;
      this.followId = null;
    }

    // 따라가기: 대상 위치로 경로 갱신
    if (this.followId) {
      const target = this.others.get(this.followId);
      if (!target) {
        this.followId = null;
      } else {
        const d = Math.hypot(target.x - this.self.x, target.y - this.self.y);
        if (d > TILE * 2 && (!this.path.length || now % 600 < 20)) {
          this.walkToTile(Math.floor(target.tx / TILE), Math.floor(target.ty / TILE));
        } else if (d <= TILE * 2) {
          this.path = [];
        }
      }
    }

    // 경로 따라 이동
    if (dx === 0 && dy === 0 && this.path.length) {
      const node = this.path[0];
      const px = node.x * TILE + TILE / 2;
      const py = node.y * TILE + TILE / 2;
      const ddx = px - this.self.x;
      const ddy = py - this.self.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist < 4) {
        this.path.shift();
        if (!this.path.length) this.pathTarget = null;
      } else {
        dx = ddx / dist;
        dy = ddy / dist;
      }
    }

    const moving = dx !== 0 || dy !== 0;
    this.self.moving = moving;
    if (moving && this.self.dancing) this.self.dancing = false;

    if (moving) {
      if (Math.abs(dy) >= Math.abs(dx)) this.self.dir = dy < 0 ? "up" : "down";
      else this.self.dir = dx < 0 ? "left" : "right";

      const len = Math.hypot(dx, dy) || 1;
      let speed = this.self.onBike ? BIKE_SPEED : WALK_SPEED;
      if (this.self.onBike) {
        // 부스트 패드 밟기
        if (boostAt(this.map, this.self.x, this.self.y)) {
          this.boostUntil = now + BOOST_MS;
        }
        if (now < this.boostUntil) speed *= BOOST_MULT;
        // 잔디/모래 오프로드 감속 (서킷 숏컷 방지)
        else if (this.map.race && offroadAt(this.map, this.self.x, this.self.y)) {
          speed *= OFFROAD_MULT;
        }
        // 아이템 효과 (터보/부스트/슬로우/기름)
        if (now < this.effectUntil) speed *= this.effectMult;
      }
      this.moveAxis((dx / len) * speed * dt, 0);
      this.moveAxis(0, (dy / len) * speed * dt);
    }

    // 레이스 아이템 픽업 (탑승 중 해당 타일 위)
    if (this.self.onBike && this.raceItems.length) {
      const col = Math.floor(this.self.x / TILE);
      const row = Math.floor(this.self.y / TILE);
      for (const o of this.raceItems) {
        if (o.x !== col || o.y !== row) continue;
        if (now < (this.itemCooldowns.get(o.id) ?? 0)) continue;
        if (o.type === "oil") {
          this.itemCooldowns.set(o.id, now + 1500);
          this.effectMult = 0.35;
          this.effectUntil = now + 1000;
          this.cb.onItem?.("oil");
        } else {
          this.itemCooldowns.set(o.id, now + 6000);
          // 카트라이더식 랜덤 아이템 (좋은 것/나쁜 것 도박)
          const roll = Math.random();
          let kind: RaceItemKind;
          if (roll < 0.24) kind = "boost";
          else if (roll < 0.44) kind = "turbo";
          else if (roll < 0.6) kind = "rocket";
          else if (roll < 0.74) kind = "slow";
          else if (roll < 0.88) kind = "ink";
          else kind = "meteor";
          if (kind === "turbo") {
            this.effectMult = 1.9;
            this.effectUntil = now + 2000;
          } else if (kind === "boost") {
            this.effectMult = 1.5;
            this.effectUntil = now + 1500;
          } else if (kind === "rocket") {
            this.effectMult = 2.0;
            this.effectUntil = now + 5000; // 로켓 5초간 2배
          } else if (kind === "slow") {
            this.effectMult = 0.55;
            this.effectUntil = now + 1800;
          } else if (kind === "ink") {
            this.inkUntil = now + 2600; // 먹물 — 시야 가림
          } else {
            this.stunUntil = now + 2500; // 운석/폭탄 — 스턴
          }
          this.cb.onItem?.(kind);
        }
      }
    }

    // 레이스 진행 체크
    this.updateRace(now);

    // PK 전투 (아레나 전용)
    if (this.isPk()) this.updatePk(dt, now);

    // ----- 영역/타일 상태 감지 -----
    const area = areaAtPx(this.map, this.self.x, this.self.y);
    if ((area?.id ?? null) !== (this.currentArea?.id ?? null)) {
      this.currentArea = area;
      this.self.areaId = area?.id ?? null;
      this.cb.onAreaChange?.(area);
      this.pushState();
    }

    const spot = spotlightAtPx(this.map, this.self.x, this.self.y);
    if (spot !== this.self.spotlight) {
      this.self.spotlight = spot;
      this.pushState();
    }

    // 포털
    const portal = portalAtPx(this.map, this.self.x, this.self.y);
    if (portal && this.portalArmed) {
      this.portalArmed = false;
      this.cb.onPortal?.(portal);
    } else if (!portal) {
      this.portalArmed = true;
    }

    // 상호작용 힌트
    const hint = nearestInteractive(this.map, this.self.x, this.self.y);
    if (hint?.id !== this.hintObj?.id) {
      this.hintObj = hint;
      this.cb.onInteractHint?.(hint);
    }

    // 근접(닿음) 감지 — 가장 가까운 상대. 하트/소개 팝업 대상.
    let touched: string | null = null;
    let touchedDist = TOUCH_PX;
    const iAmGhost = !!this.self.ghost;
    this.others.forEach((p) => {
      if (p.ghost || iAmGhost) return; // 고스트는 하트/소개 발생 안 함
      const d = Math.hypot(p.x - this.self.x, p.y - this.self.y);
      if (d < touchedDist) {
        touchedDist = d;
        touched = p.id;
      }
    });
    if (touched !== this.touchedId) {
      this.touchedId = touched;
      this.cb.onTouch?.(touched);
    }

    // 위치 전송 — 상태가 실제로 바뀌었을 때만 (가만히 있을 때 스팸 전송하면
    // Supabase Realtime rate limit 에 걸려 이모트/채팅까지 드랍된다).
    if (now - this.lastSent > NET_TICK) {
      const s = this.self;
      const sig = `${Math.round(s.x)},${Math.round(s.y)},${s.dir},${s.moving},${s.onBike},${s.dancing},${s.sitting},${s.lying},${s.hand},${s.status},${s.areaId},${s.spotlight},${s.hp},${s.dead}`;
      if (sig !== this.lastSentSig) {
        this.lastSentSig = sig;
        this.lastSent = now;
        this.pushState();
      }
    }

    // 원격 플레이어 보간
    this.others.forEach((p) => {
      p.x += (p.tx - p.x) * Math.min(1, dt * 12);
      p.y += (p.ty - p.y) * Math.min(1, dt * 12);
    });

    // 이모트 만료 정리
    this.emotes.forEach((arr, id) => {
      const live = arr.filter((e) => e.expires > now);
      if (live.length) this.emotes.set(id, live);
      else this.emotes.delete(id);
    });
  }

  // 프라이빗 영역 입장 제한: 잠김 or 최대 인원 초과 시 진입 불가
  private lastBlockNotify = 0;

  private notifyBlocked(area: PrivateArea, reason: "locked" | "full") {
    const now = performance.now();
    if (now - this.lastBlockNotify > 2500) {
      this.lastBlockNotify = now;
      this.cb.onAreaBlocked?.(area, reason);
    }
  }

  private canEnterArea(nx: number, ny: number): boolean {
    const target = areaAtPx(this.map, nx, ny);
    if (!target) return true;
    if (this.currentArea?.id === target.id) return true;
    if (this.lockedAreas.has(target.id)) {
      this.notifyBlocked(target, "locked");
      return false;
    }
    if (target.maxOccupancy) {
      let count = 0;
      this.others.forEach((p) => {
        if (p.areaId === target.id) count++;
      });
      if (count >= target.maxOccupancy) {
        this.notifyBlocked(target, "full");
        return false;
      }
    }
    return true;
  }

  private moveAxis(mvx: number, mvy: number) {
    const r = PLAYER_RADIUS;
    const nx = this.self.x + mvx;
    const ny = this.self.y + mvy;

    if (mvx !== 0) {
      const checkX = nx + Math.sign(mvx) * r;
      if (
        !isSolidPx(this.solid, checkX, this.self.y - r + 2) &&
        !isSolidPx(this.solid, checkX, this.self.y + r - 2) &&
        this.canEnterArea(nx, this.self.y)
      ) {
        this.self.x = nx;
      } else {
        this.path = [];
      }
    }
    if (mvy !== 0) {
      const checkY = ny + Math.sign(mvy) * r;
      if (
        !isSolidPx(this.solid, this.self.x - r + 2, checkY) &&
        !isSolidPx(this.solid, this.self.x + r - 2, checkY) &&
        this.canEnterArea(this.self.x, ny)
      ) {
        this.self.y = ny;
      } else {
        this.path = [];
      }
    }
  }

  // ---------- 렌더 ----------

  private render(now: number) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const z = this.zoom;
    const size = mapPixelSize(this.map);
    const vw = W / z;
    const vh = H / z;

    let camX = this.self.x - vw / 2;
    let camY = this.self.y - vh / 2;
    camX = Math.max(0, Math.min(camX, Math.max(0, size.w - vw)));
    camY = Math.max(0, Math.min(camY, Math.max(0, size.h - vh)));
    if (size.w < vw) camX = (size.w - vw) / 2;
    if (size.h < vh) camY = (size.h - vh) / 2;
    this.cam.x = camX;
    this.cam.y = camY;

    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.scale(z, z);
    ctx.translate(-Math.round(camX), -Math.round(camY));

    // 바닥 (오프스크린)
    if (this.ground) ctx.drawImage(this.ground, 0, 0);

    // 스포트라이트 타일 표시
    for (const s of this.map.spotlights) {
      const pulse = 0.18 + Math.sin(now / 400) * 0.06;
      ctx.fillStyle = `rgba(251,146,60,${pulse})`;
      ctx.fillRect(s.x * TILE, s.y * TILE, TILE, TILE);
      ctx.strokeStyle = "rgba(251,146,60,0.5)";
      ctx.strokeRect(s.x * TILE + 1, s.y * TILE + 1, TILE - 2, TILE - 2);
    }

    // 이동 목표 마커
    if (this.pathTarget) {
      const px = this.pathTarget.x * TILE + TILE / 2;
      const py = this.pathTarget.y * TILE + TILE / 2;
      const rr = 8 + Math.sin(now / 150) * 3;
      ctx.strokeStyle = "rgba(124,140,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ----- 오브젝트 + 플레이어를 y 정렬로 함께 렌더 -----
    interface RenderItem {
      y: number;
      draw: () => void;
    }
    const items: RenderItem[] = [];

    for (const o of this.map.objects) {
      const def = OBJECT_DEFS[o.type];
      if (!def) continue;
      const baseY = (o.y + def.h) * TILE;
      // 아이템 박스는 획득 후 리스폰 전까지 흐리게 표시
      const collected =
        o.type === "itembox" && now < (this.itemCooldowns.get(o.id) ?? 0);
      items.push({ y: baseY - 6, draw: () => drawObject(ctx, o, now, collected) });
    }

    const allPlayers: PlayerState[] = [...this.others.values(), this.self];
    for (const p of allPlayers) {
      items.push({
        // 앉거나 누운 캐릭터는 좌석/침대 오브젝트보다 나중에(위에) 그려야 가려지지 않는다
        y: p.sitting || p.lying ? p.y + 12 : p.y,
        draw: () =>
          drawCharacter(
            ctx,
            p.x,
            p.y + PLAYER_RADIUS,
            p.appearance,
            p.dir,
            p.moving,
            p.onBike,
            now,
            p.name,
            p.id === this.self.id,
            {
              status: p.status,
              hand: p.hand,
              dancing: p.dancing,
              sitting: p.sitting,
              lying: p.lying,
              vehicle: this.map.vehicle ?? "bike",
              ghost: p.ghost,
              cosmetics: p.cosmetics,
              mounted: p.mounted,
            }
          ),
      });
    }

    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    // 전경(캐노피/글로우) 레이어
    for (const o of this.map.objects) {
      const def = OBJECT_DEFS[o.type];
      if (def?.tall) drawObjectTop(ctx, o, now);
    }

    // 데스크 소유자 명판
    if (this.deskOwners.size) {
      ctx.font = "9px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      for (const o of this.map.objects) {
        if (o.type !== "desk") continue;
        const owner = this.deskOwners.get(o.id);
        if (!owner) continue;
        const cx0 = (o.x + 1) * TILE;
        const cy0 = o.y * TILE - 14;
        const tw = ctx.measureText(owner).width;
        ctx.fillStyle = "rgba(10,14,25,0.75)";
        ctx.fillRect(cx0 - tw / 2 - 4, cy0 - 8, tw + 8, 11);
        ctx.fillStyle = "#a5b4fc";
        ctx.fillText(owner, cx0, cy0);
      }
    }

    // 맵 라벨
    ctx.font = "bold 10px ui-sans-serif, system-ui";
    ctx.textAlign = "left";
    for (const l of this.map.labels) {
      const lx = l.x * TILE;
      const ly = l.y * TILE - 4;
      const tw = ctx.measureText(l.text).width;
      ctx.fillStyle = "rgba(10,14,25,0.6)";
      ctx.fillRect(lx - 3, ly - 10, tw + 6, 13);
      ctx.fillStyle = "rgba(229,237,255,0.9)";
      ctx.fillText(l.text, lx, ly);
    }

    // 포털 라벨 (가까울 때)
    for (const p of this.map.portals) {
      const px = p.x * TILE + TILE / 2;
      const py = p.y * TILE;
      const d = Math.hypot(px - this.self.x, py - this.self.y);
      if (d < TILE * 4 && p.label) {
        ctx.font = "10px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        const tw = ctx.measureText(p.label).width;
        ctx.fillStyle = "rgba(10,14,25,0.8)";
        ctx.fillRect(px - tw / 2 - 4, py - 22, tw + 8, 13);
        ctx.fillStyle = "#93c5fd";
        ctx.fillText(p.label, px, py - 12);
      }
    }

    // 상호작용 힌트 (X)
    if (this.hintObj && !this.editorMode) {
      const def = OBJECT_DEFS[this.hintObj.type];
      const hx = (this.hintObj.x + (def?.w ?? 1) / 2) * TILE;
      const hy = this.hintObj.y * TILE - 20 - Math.sin(now / 250) * 2;
      ctx.fillStyle = "rgba(251,191,36,0.95)";
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111827";
      ctx.font = "bold 10px ui-sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("X", hx, hy + 0.5);
      ctx.textBaseline = "alphabetic";
    }

    // 하이파이브 하트 — 닿은 상대 머리 위 (나에게만 보임)
    if (this.touchedId) {
      const tp = this.others.get(this.touchedId);
      if (tp) {
        const hx = tp.x;
        const hy = tp.y - 50 - (tp.onBike ? 8 : 0) - Math.abs(Math.sin(now / 260)) * 4;
        ctx.font = "20px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💗", hx, hy);
        ctx.textBaseline = "alphabetic";
      }
    }

    // PK 전투 렌더 (투사체/이펙트/체력바)
    if (this.isPk()) this.renderPk(ctx, now);

    // 프라이빗 영역: 내부에 있으면 외부 어둡게 + 경계 표시
    if (this.currentArea) {
      const a = this.currentArea;
      ctx.fillStyle = "rgba(8,10,20,0.45)";
      const ax = a.x * TILE;
      const ay = a.y * TILE;
      const aw = a.w * TILE;
      const ah = a.h * TILE;
      // 상하좌우 4개 사각형으로 외부 덮기
      ctx.fillRect(camX, camY, vw, Math.max(0, ay - camY));
      ctx.fillRect(camX, ay + ah, vw, Math.max(0, camY + vh - (ay + ah)));
      ctx.fillRect(camX, ay, Math.max(0, ax - camX), ah);
      ctx.fillRect(ax + aw, ay, Math.max(0, camX + vw - (ax + aw)), ah);
      ctx.strokeStyle = "rgba(124,140,255,0.55)";
      ctx.lineWidth = 2;
      ctx.strokeRect(ax + 1, ay + 1, aw - 2, ah - 2);
    }

    // 에디터 오버레이
    if (this.editorMode) this.renderEditorOverlay(ctx);

    // 이모트(말풍선)
    for (const p of allPlayers) this.renderEmotes(ctx, p, now);

    ctx.restore();

    // 미니맵
    if (this.showMinimap && this.ground) this.renderMinimap(ctx, W);

    // 먹물(ink) — 시야 가림 (화면 대부분을 검게, 중앙만 살짝 보임)
    if (now < this.inkUntil) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 24, W / 2, H / 2, Math.max(W, H) * 0.55);
      g.addColorStop(0, "rgba(0,0,0,0.25)");
      g.addColorStop(0.45, "rgba(2,2,6,0.9)");
      g.addColorStop(1, "rgba(0,0,0,0.99)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 16px ui-sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🖤 먹물!", W / 2, 40);
    }
    // 스턴 표시
    if (now < this.stunUntil) {
      ctx.fillStyle = "rgba(251,191,36,0.9)";
      ctx.font = "bold 16px ui-sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("💫 스턴!", W / 2, 40);
    }
  }

  private renderPk(ctx: CanvasRenderingContext2D, now: number) {
    // 투사체
    for (const pr of this.projectiles) {
      const w = WEAPON_MAP[pr.weapon];
      if (!w) continue;
      if (w.kind === "throw" || w.kind === "smoke" || w.kind === "cannon" || w.kind === "tank") {
        ctx.font = "14px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(w.icon, pr.x, pr.y);
        ctx.textBaseline = "alphabetic";
      } else {
        // 총알 — 진행 방향 짧은 선
        const len = w.kind === "sniper" ? 14 : 8;
        const m = Math.hypot(pr.vx, pr.vy) || 1;
        ctx.strokeStyle = w.color;
        ctx.lineWidth = w.kind === "sniper" ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(pr.x, pr.y);
        ctx.lineTo(pr.x - (pr.vx / m) * len, pr.y - (pr.vy / m) * len);
        ctx.stroke();
      }
    }
    // 이펙트
    for (const e of this.effects) {
      if (e.kind === "explosion") {
        const t = (now - e.born) / (e.until - e.born);
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = "rgba(251,146,60,0.6)";
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 0.3 * (1 - t), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        // 연막
        ctx.fillStyle = "rgba(120,130,140,0.55)";
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 체력바 + 사망 표시 (자신 포함 모든 플레이어)
    const all: PlayerState[] = [this.self, ...this.others.values()];
    for (const p of all) {
      const hp = p.hp ?? MAX_HP;
      const barY = p.y - 42;
      if (p.dead) {
        ctx.font = "16px serif";
        ctx.textAlign = "center";
        ctx.fillText("💀", p.x, barY);
        continue;
      }
      if (hp >= MAX_HP && p.id !== this.self.id) continue; // 만피는 생략(자기 자신은 항상 표시)
      const bw = 26;
      const ratio = Math.max(0, hp / MAX_HP);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(p.x - bw / 2 - 1, barY - 1, bw + 2, 5);
      ctx.fillStyle = ratio > 0.5 ? "#34d399" : ratio > 0.25 ? "#fbbf24" : "#ef4444";
      ctx.fillRect(p.x - bw / 2, barY, bw * ratio, 3);
    }
  }

  private renderEditorOverlay(ctx: CanvasRenderingContext2D) {
    const { w, h } = mapPixelSize(this.map);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += TILE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += TILE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // 스폰
    ctx.font = "bold 11px ui-sans-serif";
    ctx.textAlign = "center";
    for (const s of this.map.spawns) {
      ctx.fillStyle = "rgba(52,211,153,0.35)";
      ctx.fillRect(s.x * TILE, s.y * TILE, TILE, TILE);
      ctx.fillStyle = "#fff";
      ctx.fillText("S", s.x * TILE + 16, s.y * TILE + 20);
    }
    // 포털
    for (const p of this.map.portals) {
      ctx.fillStyle = "rgba(59,130,246,0.35)";
      ctx.fillRect(p.x * TILE, p.y * TILE, TILE, TILE);
      ctx.fillStyle = "#fff";
      ctx.fillText("P", p.x * TILE + 16, p.y * TILE + 20);
    }
    // 프라이빗 영역
    for (const a of this.map.areas) {
      ctx.fillStyle = "rgba(168,85,247,0.15)";
      ctx.fillRect(a.x * TILE, a.y * TILE, a.w * TILE, a.h * TILE);
      ctx.strokeStyle = "rgba(168,85,247,0.6)";
      ctx.strokeRect(a.x * TILE, a.y * TILE, a.w * TILE, a.h * TILE);
      ctx.fillStyle = "#e9d5ff";
      ctx.textAlign = "left";
      ctx.fillText(a.name, a.x * TILE + 4, a.y * TILE + 14);
      ctx.textAlign = "center";
    }
  }

  private renderMinimap(ctx: CanvasRenderingContext2D, W: number) {
    const size = mapPixelSize(this.map);
    const mw = 148;
    const mh = Math.round((size.h / size.w) * mw);
    const mx = W - mw - 12;
    const my = 60;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    if (this.ground) ctx.drawImage(this.ground, mx, my, mw, mh);
    // 플레이어 점
    const sx = mw / size.w;
    const sy = mh / size.h;
    this.others.forEach((p) => {
      ctx.fillStyle = "#facc15";
      ctx.fillRect(mx + p.x * sx - 1.5, my + p.y * sy - 1.5, 3, 3);
    });
    ctx.fillStyle = "#34d399";
    ctx.beginPath();
    ctx.arc(mx + this.self.x * sx, my + this.self.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(mx - 3.5, my - 3.5, mw + 7, mh + 7);
    ctx.restore();
  }

  private renderEmotes(ctx: CanvasRenderingContext2D, p: PlayerState, now: number) {
    const arr = this.emotes.get(p.id);
    if (!arr || !arr.length) return;
    const baseY = p.y - 52 - (p.onBike ? 8 : 0);

    arr.forEach((e, i) => {
      const age = e.expires - now;
      const total = e.kind === "chat" ? 5200 : 2600;
      const t = 1 - age / total;
      const rise = t * 10;
      const alpha = age < 500 ? age / 500 : 1;
      ctx.globalAlpha = Math.max(0, alpha);
      const y = baseY - i * 26 - rise;

      if (e.kind === "emoji") {
        ctx.font = "22px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(e.value, p.x, y);
      } else {
        ctx.font = "12px ui-sans-serif, system-ui";
        const text = e.value.length > 60 ? e.value.slice(0, 59) + "…" : e.value;
        const w = ctx.measureText(text).width;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(15,20,35,0.92)";
        roundRectPath(ctx, p.x - w / 2 - 8, y - 11, w + 16, 22, 8);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p.x - 5, y + 10);
        ctx.lineTo(p.x + 5, y + 10);
        ctx.lineTo(p.x, y + 16);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#e5edff";
        ctx.fillText(text, p.x - w / 2, y);
      }
      ctx.globalAlpha = 1;
      ctx.textBaseline = "alphabetic";
    });
  }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
