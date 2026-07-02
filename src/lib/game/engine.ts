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
  OFFROAD_MULT,
  PLAYER_RADIUS,
  PROXIMITY_TILES,
  TILE,
  WALK_SPEED,
} from "./constants";
import { findPath, type PathNode } from "./pathfinding";
import type {
  CharacterAppearance,
  Direction,
  EmoteMessage,
  PlayerState,
  UserStatus,
} from "./types";

interface ActiveEmote extends EmoteMessage {
  expires: number;
}

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

  private self: PlayerState;
  private others = new Map<string, PlayerState & { tx: number; ty: number }>();
  private emotes = new Map<string, ActiveEmote[]>();
  private speakingIds = new Set<string>();
  private deskOwners = new Map<string, string>(); // object id -> 이름

  private path: PathNode[] = [];
  private pathTarget: PathNode | null = null;
  private followId: string | null = null;

  private currentArea: PrivateArea | null = null;
  private lockedAreas = new Set<string>();
  private portalArmed = true; // 포털 재발동 방지
  private hintObj: MapObject | null = null;

  private bikeCooldown = 0;
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
    opts?: { spawn?: { x: number; y: number }; guest?: boolean; status?: UserStatus }
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
      appearance,
      status: opts?.status ?? "available",
      areaId: null,
      spotlight: false,
      hand: false,
      micOn: false,
      camOn: false,
      sharing: false,
      guest: opts?.guest ?? false,
    };
  }

  // ---------- 라이프사이클 ----------

  start() {
    this.running = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
    this.canvas.addEventListener("dblclick", this.onDblClick);
    this.canvas.addEventListener("click", this.onClick);
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
  }

  setMap(map: MapData, keepPosition = true) {
    this.map = map;
    this.solid = buildSolidGrid(map);
    this.renderGround();
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
    this.self.x = tileX * TILE + TILE / 2;
    this.self.y = tileY * TILE + TILE / 2;
    this.path = [];
    this.pathTarget = null;
    this.portalArmed = false;
    this.pushState();
  }

  walkToTile(tx: number, ty: number) {
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

  setSpeaking(id: string, on: boolean) {
    if (on) this.speakingIds.add(id);
    else this.speakingIds.delete(id);
  }

  setDeskOwners(m: Map<string, string>) {
    this.deskOwners = m;
  }

  upsertOther(p: PlayerState) {
    if (p.id === this.self.id) return;
    const existing = this.others.get(p.id);
    if (existing) {
      existing.tx = p.x;
      existing.ty = p.y;
      Object.assign(existing, { ...p, x: existing.x, y: existing.y, tx: p.x, ty: p.y });
    } else {
      this.others.set(p.id, { ...p, tx: p.x, ty: p.y });
    }
  }

  removeOther(id: string) {
    this.others.delete(id);
  }

  reconcileRoster(list: PlayerState[]) {
    const ids = new Set(list.map((p) => p.id));
    for (const id of Array.from(this.others.keys())) {
      if (!ids.has(id)) this.others.delete(id);
    }
    for (const p of list) {
      if (p.id === this.self.id) continue;
      const existing = this.others.get(p.id);
      if (existing) {
        // 위치 목표는 broadcast 가 담당 — 메타만 갱신
        existing.name = p.name;
        existing.appearance = p.appearance;
        existing.status = p.status;
        existing.hand = p.hand;
        existing.micOn = p.micOn;
        existing.camOn = p.camOn;
        existing.sharing = p.sharing;
      } else {
        this.others.set(p.id, { ...p, tx: p.x, ty: p.y });
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
  };

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

  private onClick = (e: MouseEvent) => {
    if (this.editorMode) return;
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
    if (this.bikeCooldown > 0) return;
    if (this.self.onBike) {
      this.self.onBike = false;
      this.bikeCooldown = 350;
      this.resetRace();
    } else if (bikeZoneAt(this.map, this.self.x, this.self.y)) {
      this.self.onBike = true;
      this.self.dancing = false;
      this.bikeCooldown = 350;
    }
  }

  private toggleDance() {
    if (this.self.onBike) return;
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

    let dx = 0;
    let dy = 0;
    if (!this.inputLocked) {
      const k = this.keys;
      if (k.has("arrowup") || k.has("w")) dy -= 1;
      if (k.has("arrowdown") || k.has("s")) dy += 1;
      if (k.has("arrowleft") || k.has("a")) dx -= 1;
      if (k.has("arrowright") || k.has("d")) dx += 1;
    }

    // 키 입력이 있으면 자동 이동 취소
    if (dx !== 0 || dy !== 0) {
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
      }
      this.moveAxis((dx / len) * speed * dt, 0);
      this.moveAxis(0, (dy / len) * speed * dt);
    }

    // 레이스 진행 체크
    this.updateRace(now);

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

    // 위치 전송
    if (now - this.lastSent > 80) {
      this.lastSent = now;
      this.pushState();
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
      items.push({ y: baseY - 6, draw: () => drawObject(ctx, o, now) });
    }

    const allPlayers: PlayerState[] = [...this.others.values(), this.self];
    for (const p of allPlayers) {
      items.push({
        y: p.y,
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
              speaking: this.speakingIds.has(p.id),
              dancing: p.dancing,
              vehicle: this.map.vehicle ?? "bike",
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
