// 대형 프리셋 맵 5종 (광장/오피스/파크/그랑프리 서킷/비치 리조트).
// 코드로 조립해 실수 없이 큰 맵을 만든다. (기존 24x18 → 80x50급, 면적 약 9배)
import type {
  MapData,
  MapLabel,
  MapObject,
  Portal,
  PrivateArea,
  TilePoint,
} from "./maps";
import type { ObjectKind } from "./objects";

// ---------- 그리드 빌더 ----------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Grid {
  g: string[][];
  constructor(public w: number, public h: number, fill: string) {
    this.g = Array.from({ length: h }, () => Array(w).fill(fill));
  }
  set(x: number, y: number, ch: string) {
    if (y >= 0 && y < this.h && x >= 0 && x < this.w) this.g[y][x] = ch;
  }
  rect(x: number, y: number, w: number, h: number, ch: string) {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) this.set(c, r, ch);
  }
  border(x: number, y: number, w: number, h: number, ch: string) {
    for (let c = x; c < x + w; c++) {
      this.set(c, y, ch);
      this.set(c, y + h - 1, ch);
    }
    for (let r = y; r < y + h; r++) {
      this.set(x, r, ch);
      this.set(x + w - 1, r, ch);
    }
  }
  blob(cx: number, cy: number, rx: number, ry: number, ch: string) {
    for (let r = 0; r < this.h; r++) {
      for (let c = 0; c < this.w; c++) {
        const dx = (c - cx) / rx;
        const dy = (r - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(c, r, ch);
      }
    }
  }
  scatter(ch: string, n: number, x: number, y: number, w: number, h: number, seed: number, on?: string) {
    const rng = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      const c = x + Math.floor(rng() * w);
      const r = y + Math.floor(rng() * h);
      if (!on || this.g[r]?.[c] === on) this.set(c, r, ch);
    }
  }
  rows(): string[] {
    return this.g.map((r) => r.join(""));
  }
}

// ---------- 맵 조립 도우미 ----------

interface Ctx {
  objects: MapObject[];
  areas: PrivateArea[];
  portals: Portal[];
  spawns: TilePoint[];
  spotlights: TilePoint[];
  labels: MapLabel[];
  seq: number;
  prefix: string;
}

function ctx(prefix: string): Ctx {
  return { objects: [], areas: [], portals: [], spawns: [], spotlights: [], labels: [], seq: 0, prefix };
}

function add(c: Ctx, type: ObjectKind, x: number, y: number, extra?: Partial<MapObject>): MapObject {
  const o: MapObject = { id: `${c.prefix}-${++c.seq}`, type, x, y, ...extra };
  c.objects.push(o);
  return o;
}

// 회의실: 벽 + 카펫 + 테이블/의자 + 화이트보드 + 프라이빗 영역.
// 문(출입구)은 아래쪽 벽 중앙 2칸.
function meetingRoom(
  g: Grid,
  c: Ctx,
  id: string,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  carpet: string,
  maxOccupancy?: number
) {
  g.rect(x, y, w, h, carpet);
  g.border(x, y, w, h, "#");
  const doorX = x + Math.floor(w / 2) - 1;
  g.set(doorX, y + h - 1, carpet);
  g.set(doorX + 1, y + h - 1, carpet);
  // 내부 가구
  const tx = x + Math.floor(w / 2) - 1;
  const ty = y + Math.floor(h / 2);
  add(c, "table", tx, ty);
  add(c, "chair", tx, ty - 1);
  add(c, "chair", tx + 1, ty - 1);
  add(c, "chair", tx, ty + 1, { dir: "up" });
  add(c, "chair", tx + 1, ty + 1, { dir: "up" });
  add(c, "whiteboard", x + Math.floor(w / 2) - 1, y, { name: `${name} 보드` });
  add(c, "plant", x + 1, y + 1);
  c.areas.push({
    id,
    name,
    x: x + 1,
    y: y + 1,
    w: w - 2,
    h: h - 2,
    maxOccupancy,
    lockable: true,
  });
  c.labels.push({ x: x + 1, y: y + 1, text: name });
}

// ==================== 1. 타운 스퀘어 (80 x 50) ====================

function buildPlaza(): MapData {
  const W = 80;
  const H = 50;
  const g = new Grid(W, H, ",");
  const c = ctx("pz");

  g.scatter(";", 480, 1, 1, W - 2, H - 2, 7, ",");

  // 외곽 나무 울타리
  for (let x = 0; x < W; x += 3) {
    add(c, "tree", x, 0);
    add(c, "tree", x, H - 2);
  }
  for (let y = 3; y < H - 3; y += 3) {
    add(c, "tree", 0, y);
    add(c, "tree", W - 2, y);
  }

  // 도로: 가로 1줄 + 세로 1줄 (오토바이 코스)
  g.rect(4, 40, W - 8, 3, "=");
  g.rect(6, 6, 3, 37, "=");
  g.rect(6, 40, 3, 3, "=");
  // 오토바이 거치대
  g.rect(10, 41, 2, 1, "B");
  g.rect(64, 41, 2, 1, "B");
  c.labels.push({ x: 10, y: 40, text: "🏍️ 라이딩 코스" });

  // 중앙 광장 (보도블럭) + 분수
  g.rect(26, 14, 30, 20, "-");
  add(c, "fountain", 39, 22);
  c.spawns.push({ x: 38, y: 27 }, { x: 42, y: 27 }, { x: 38, y: 20 }, { x: 43, y: 24 });
  add(c, "bulletin", 30, 15, { name: "광장 게시판" });
  add(c, "sign", 33, 15, {
    name: "안내판",
    props: { text: "타운 스퀘어에 오신 걸 환영합니다!\n\nX 키로 오브젝트와 상호작용할 수 있어요.\n게시판, 아케이드, 카페를 둘러보세요." },
  });
  add(c, "lamp", 27, 15);
  add(c, "lamp", 52, 15);
  add(c, "lamp", 27, 31);
  add(c, "lamp", 52, 31);
  add(c, "flowerbed", 29, 19);
  add(c, "flowerbed", 50, 19);
  add(c, "flowerbed", 29, 28);
  add(c, "flowerbed", 50, 28);

  // 카페 (좌상단 건물)
  g.rect(12, 6, 14, 11, "w");
  g.border(12, 6, 14, 11, "#");
  g.set(18, 16, "w");
  g.set(19, 16, "w");
  g.rect(18, 17, 2, 2, "-");
  add(c, "counter", 13, 8);
  add(c, "counter", 14, 8);
  add(c, "counter", 15, 8);
  add(c, "coffee", 13, 7);
  add(c, "vending", 16, 7);
  add(c, "roundtable", 18, 9);
  add(c, "chair", 17, 10);
  add(c, "chair", 20, 10);
  add(c, "roundtable", 22, 12);
  add(c, "chair", 21, 13);
  add(c, "chair", 24, 13);
  add(c, "table", 14, 13);
  add(c, "chair", 14, 12);
  add(c, "chair", 15, 14, { dir: "up" });
  add(c, "speaker", 24, 7, {
    name: "카페 라디오",
    props: { url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3" },
  });
  c.areas.push({ id: "cafe", name: "☕ 카페", x: 13, y: 7, w: 12, h: 9 });
  c.labels.push({ x: 13, y: 7, text: "☕ 카페" });

  // 스테이지 (우상단) — 스포트라이트 방송 구역
  g.rect(58, 7, 16, 10, "-");
  g.rect(60, 8, 12, 4, "m");
  add(c, "tv", 64, 8, { name: "스테이지 스크린", props: { url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" } });
  add(c, "speaker", 60, 8);
  add(c, "speaker", 70, 8);
  for (let i = 0; i < 3; i++) c.spotlights.push({ x: 63 + i * 2, y: 10 });
  for (let r = 13; r <= 15; r++)
    for (let x = 60; x <= 71; x += 2) add(c, "bench", x, r === 14 ? r : r, {});
  c.labels.push({ x: 60, y: 9, text: "🎤 스테이지 (스포트라이트)" });

  // 게임 코너 (우하단)
  g.rect(60, 34, 14, 5, "-");
  add(c, "arcade", 61, 34, { name: "테트리스" });
  add(c, "arcade", 63, 34, { name: "테트리스 2" });
  add(c, "tv", 66, 34, {
    name: "보드게임(외부 임베드)",
    props: { interaction: "game", url: "https://playtictactoe.org" },
  });
  add(c, "roundtable", 69, 35);
  add(c, "chair", 68, 36);
  add(c, "chair", 71, 36);
  add(c, "minigame", 61, 37, { name: "미니게임 기기" });
  c.areas.push({ id: "game-corner", name: "🕹️ 게임 코너", x: 60, y: 33, w: 14, h: 6 });
  c.labels.push({ x: 61, y: 33, text: "🕹️ 게임 코너" });

  // 연못 + 피크닉 (좌하단)
  g.blob(16, 30, 7, 4, "s");
  g.blob(16, 30, 5.4, 2.8, "~");
  add(c, "bench", 11, 25);
  add(c, "bench", 20, 25);
  add(c, "tree", 24, 27);
  // 피크닉 정자 2곳
  g.rect(12, 44, 6, 4, "d");
  add(c, "roundtable", 14, 45);
  add(c, "chair", 13, 46);
  add(c, "chair", 16, 46);
  c.areas.push({ id: "picnic-1", name: "🧺 피크닉 A", x: 12, y: 44, w: 6, h: 4, maxOccupancy: 4 });
  g.rect(22, 44, 6, 4, "d");
  add(c, "roundtable", 24, 45);
  add(c, "chair", 23, 46);
  add(c, "chair", 26, 46);
  c.areas.push({ id: "picnic-2", name: "🧺 피크닉 B", x: 22, y: 44, w: 6, h: 4, maxOccupancy: 4 });
  c.labels.push({ x: 12, y: 43, text: "🧺 피크닉" });

  // 흙길 연결
  g.rect(39, 34, 3, 6, "d");
  g.rect(39, 10, 3, 4, "d");
  g.rect(19, 22, 7, 2, "d");
  g.rect(56, 22, 6, 2, "d");

  // 포털: 오피스/파크 이동 문 + 광장 내부 순간이동
  add(c, "door", 44, 14, { name: "오피스 입구" });
  c.portals.push({ id: "pz-po-office", x: 44, y: 14, kind: "room", roomTemplate: "office", label: "🏢 오피스로" });
  add(c, "door", 46, 14, { name: "파크 입구" });
  c.portals.push({ id: "pz-po-garden", x: 46, y: 14, kind: "room", roomTemplate: "garden", label: "🌳 파크로" });
  add(c, "door", 48, 14, { name: "서킷 입구" });
  c.portals.push({ id: "pz-po-circuit", x: 48, y: 14, kind: "room", roomTemplate: "circuit", label: "🏁 그랑프리 서킷으로" });
  add(c, "flag", 49, 13);
  add(c, "door", 50, 14, { name: "비치 입구" });
  c.portals.push({ id: "pz-po-beach", x: 50, y: 14, kind: "room", roomTemplate: "beach", label: "🏖️ 비치 리조트로" });
  add(c, "door", 52, 14, { name: "스타홀 입구" });
  c.portals.push({ id: "pz-po-starhall", x: 52, y: 14, kind: "room", roomTemplate: "starhall", label: "⭐ 스타홀 갤러리로" });
  add(c, "door", 54, 14, { name: "카페 입구" });
  c.portals.push({ id: "pz-po-cafe", x: 54, y: 14, kind: "room", roomTemplate: "cafe", label: "🌿 야외 카페로" });
  add(c, "door", 74, 41, { name: "지름길" });
  c.portals.push({ id: "pz-tp-1", x: 74, y: 41, kind: "same", tx: 5, ty: 41, label: "↔ 반대편 도로" });
  add(c, "door", 5, 44, { name: "지름길" });
  c.portals.push({ id: "pz-tp-2", x: 5, y: 44, kind: "same", tx: 73, ty: 41, label: "↔ 반대편 도로" });

  // 중앙 워프 포탈 (전체 미니맵)
  add(c, "portalhub", 44, 25, { name: "워프 포탈" });
  c.labels.push({ x: 44, y: 24, text: "🌀 워프 포탈 (X/스페이스)" });

  // 안내 NPC (온보딩 퀘스트)
  add(c, "npc", 36, 25, { name: "안내원 삐삐" });
  c.labels.push({ x: 34, y: 24, text: "💬 안내원 삐삐 (X)" });

  // ATM (예치/이자/송금)
  add(c, "atm", 53, 16, { name: "하트 ATM" });

  // 대형 조형물(사람보다 큰 석상/체스) + 배틀 아레나 입구
  add(c, "statue", 31, 27, { name: "광장의 수호상" });
  add(c, "chess", 48, 27, { name: "거대 체스말", props: { color: "dark" } });
  add(c, "door", 39, 33, { name: "배틀 아레나 입구" });
  c.portals.push({ id: "pz-po-arena", x: 39, y: 33, kind: "room", roomTemplate: "arena", label: "🔫 배틀 아레나(PK)로" });

  // OX 파티 퀴즈 존 (O = 초록 / X = 빨강 플랫폼)
  g.rect(30, 18, 5, 4, "g");
  g.rect(45, 18, 5, 4, "m");
  c.areas.push({ id: "quiz-o", name: "🅾️ O 존", x: 30, y: 18, w: 5, h: 4 });
  c.areas.push({ id: "quiz-x", name: "❌ X 존", x: 45, y: 18, w: 5, h: 4 });
  c.labels.push({ x: 31, y: 17, text: "🅾️ O" });
  c.labels.push({ x: 46, y: 17, text: "❌ X" });

  return {
    key: "plaza",
    name: "타운 스퀘어",
    description: "분수 광장, 카페, 스테이지, 게임 코너, 라이딩 코스가 있는 대형 광장",
    tiles: g.rows(),
    objects: c.objects,
    areas: c.areas,
    portals: c.portals,
    spawns: c.spawns,
    spotlights: c.spotlights,
    labels: c.labels,
  };
}

// ==================== 2. 픽셀 오피스 (76 x 46) ====================

function buildOffice(): MapData {
  const W = 76;
  const H = 46;
  const g = new Grid(W, H, "x");
  const c = ctx("of");

  // 건물 본체
  g.rect(2, 2, W - 4, H - 4, ".");
  g.border(2, 2, W - 4, H - 4, "#");

  // ---- 로비 (하단 중앙) ----
  g.rect(30, 34, 18, 9, "c");
  c.spawns.push({ x: 38, y: 39 }, { x: 36, y: 39 }, { x: 40, y: 39 });
  add(c, "counter", 34, 36);
  add(c, "counter", 35, 36);
  add(c, "counter", 36, 36);
  add(c, "plant", 31, 35);
  add(c, "plant", 46, 35);
  add(c, "bulletin", 41, 35, { name: "사내 게시판" });
  add(c, "sign", 44, 35, {
    name: "오피스 안내",
    props: { text: "픽셀 오피스입니다.\n좌측: 회의실 A~D\n우측: 오픈 데스크(자리 지정 가능)\n상단: 타운홀 · 우하단: 라운지" },
  });
  c.labels.push({ x: 31, y: 34, text: "🏢 로비" });

  // ---- 회의실 4개 (좌측) ----
  meetingRoom(g, c, "meet-a", "회의실 A", 4, 4, 12, 9, "c", 6);
  meetingRoom(g, c, "meet-b", "회의실 B", 4, 14, 12, 9, "m", 6);
  meetingRoom(g, c, "meet-c", "회의실 C", 4, 24, 12, 9, "g", 8);
  meetingRoom(g, c, "meet-d", "회의실 D", 4, 34, 12, 9, "c", 4);

  // ---- 포커스 부스 3개 (좌중앙 열) ----
  for (let i = 0; i < 3; i++) {
    const bx = 18;
    const by = 20 + i * 6;
    g.rect(bx, by, 5, 5, "k");
    g.border(bx, by, 5, 5, "#");
    g.set(bx + 4, by + 2, "k");
    add(c, "desk", bx + 1, by + 1, { name: `부스 ${i + 1} 데스크` });
    add(c, "chair", bx + 1, by + 2);
    c.areas.push({
      id: `booth-${i + 1}`,
      name: `🔕 포커스 부스 ${i + 1}`,
      x: bx + 1,
      y: by + 1,
      w: 3,
      h: 3,
      maxOccupancy: 1,
      lockable: true,
    });
  }
  c.labels.push({ x: 18, y: 19, text: "🔕 포커스 부스" });

  // ---- 타운홀 (상단 중앙) — 스포트라이트 발표장 ----
  g.rect(26, 4, 26, 13, "m");
  g.border(26, 4, 26, 13, "#");
  g.set(38, 16, "m");
  g.set(39, 16, "m");
  add(c, "tv", 37, 5, { name: "발표 스크린", props: { url: "" } });
  add(c, "whiteboard", 41, 5, { name: "타운홀 보드" });
  add(c, "speaker", 27, 5);
  add(c, "speaker", 49, 5);
  for (let i = 0; i < 3; i++) c.spotlights.push({ x: 37 + i * 2, y: 7 });
  for (let r = 10; r <= 14; r += 2)
    for (let x = 29; x <= 47; x += 3) add(c, "chair", x, r);
  c.areas.push({ id: "townhall", name: "📣 타운홀", x: 27, y: 5, w: 24, h: 11 });
  c.labels.push({ x: 27, y: 5, text: "📣 타운홀 (스포트라이트)" });

  // ---- 오픈 데스크 (우측) — 자리 지정 가능한 책상 24개 ----
  g.rect(54, 4, 19, 26, "w");
  let deskNo = 0;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 4; col++) {
      deskNo++;
      const dx = 55 + col * 5;
      const dy = 5 + row * 4;
      c.objects.push({
        id: `desk-${deskNo}`,
        type: "desk",
        x: dx,
        y: dy,
        name: `데스크 ${deskNo}`,
      });
      add(c, "chair", dx, dy + 1, { dir: "up" });
    }
  }
  add(c, "plant", 54, 4);
  add(c, "plant", 72, 4);
  add(c, "plant", 54, 28);
  c.labels.push({ x: 55, y: 4, text: "💻 오픈 데스크 (X키로 자리 지정)" });

  // ---- 라운지 & 키친 (우하단) ----
  g.rect(52, 32, 21, 11, "g");
  add(c, "rug", 60, 36, { props: { color: "#7c5cd6" } });
  add(c, "sofa", 56, 34);
  add(c, "sofa", 56, 38, { dir: "up" });
  add(c, "tv", 60, 33, { name: "라운지 TV", props: { url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" } });
  add(c, "coffee", 68, 33);
  add(c, "vending", 70, 33);
  add(c, "counter", 66, 33);
  add(c, "roundtable", 66, 37);
  add(c, "chair", 65, 38);
  add(c, "chair", 68, 38);
  add(c, "piano", 71, 40, { name: "라운지 피아노" });
  add(c, "bed", 53, 39, { name: "낮잠 침대", props: { color: "#7c5cd6" } });
  add(c, "bookshelf", 53, 33);
  c.areas.push({ id: "lounge", name: "🛋️ 라운지", x: 53, y: 33, w: 20, h: 9 });
  c.labels.push({ x: 53, y: 32, text: "🛋️ 라운지 & 키친" });

  // ---- 임원실 (멤버 전용 문) ----
  g.rect(18, 4, 6, 6, "k");
  g.border(18, 4, 6, 6, "#");
  g.set(20, 9, "k");
  add(c, "desk", 19, 5, { name: "임원 데스크" });
  add(c, "chair", 19, 6);
  add(c, "plant", 22, 5);
  c.portals.push({
    id: "of-po-exec",
    x: 20,
    y: 9,
    kind: "same",
    tx: 20,
    ty: 7,
    membersOnly: true,
    label: "🔐 멤버 전용 임원실",
  });
  c.labels.push({ x: 18, y: 4, text: "🔐 임원실" });

  // ---- 비밀 서버실 (비밀번호 문) ----
  g.rect(18, 11, 6, 6, "k");
  g.border(18, 11, 6, 6, "#");
  g.set(20, 16, "k");
  add(c, "bookshelf", 19, 12, { name: "서버 랙" });
  c.portals.push({
    id: "of-po-server",
    x: 20,
    y: 16,
    kind: "same",
    tx: 20,
    ty: 14,
    password: "1234",
    label: "🔑 서버실 (비밀번호: 관리자에게 문의)",
  });

  // ---- 포털: 광장으로 + 중앙 워프 포탈 ----
  add(c, "door", 38, 42, { name: "정문" });
  c.portals.push({ id: "of-po-plaza", x: 38, y: 42, kind: "room", roomTemplate: "plaza", label: "⛲ 광장으로" });
  add(c, "portalhub", 37, 38, { name: "워프 포탈" });
  add(c, "atm", 46, 37, { name: "하트 ATM" });

  return {
    key: "office",
    name: "픽셀 오피스",
    description: "회의실 4곳, 타운홀, 오픈 데스크 24석, 라운지, 포커스 부스를 갖춘 오피스",
    tiles: g.rows(),
    objects: c.objects,
    areas: c.areas,
    portals: c.portals,
    spawns: c.spawns,
    spotlights: c.spotlights,
    labels: c.labels,
  };
}

// ==================== 3. 선셋 파크 (72 x 44) ====================

function buildGarden(): MapData {
  const W = 72;
  const H = 44;
  const g = new Grid(W, H, ",");
  const c = ctx("gd");

  g.scatter(";", 420, 1, 1, W - 2, H - 2, 21, ",");

  // 외곽 나무
  for (let x = 0; x < W; x += 3) {
    add(c, "tree", x, 0);
    add(c, "tree", x, H - 2);
  }
  for (let y = 3; y < H - 3; y += 4) {
    add(c, "tree", 0, y);
    add(c, "tree", W - 2, y);
  }

  // 호수 + 모래사장
  g.blob(24, 18, 11, 7, "s");
  g.blob(24, 18, 9, 5.4, "~");
  add(c, "bench", 14, 10);
  add(c, "bench", 32, 10);
  add(c, "bench", 14, 26);
  add(c, "bench", 32, 26);
  c.labels.push({ x: 20, y: 12, text: "🌊 선셋 호수" });

  // 산책로(흙길)
  g.rect(4, 30, 60, 2, "d");
  g.rect(36, 6, 2, 26, "d");
  g.rect(4, 6, 2, 26, "d");
  g.rect(4, 6, 34, 2, "d");
  c.spawns.push({ x: 37, y: 31 }, { x: 35, y: 31 });

  // 자전거/오토바이 트랙 (외곽 도로 루프)
  g.rect(2, 40, 68, 2, "=");
  g.rect(66, 8, 2, 34, "=");
  g.rect(2, 38, 1, 4, "=");
  g.rect(4, 40, 2, 1, "B");
  g.rect(62, 40, 2, 1, "B");
  c.labels.push({ x: 5, y: 39, text: "🏍️ 파크 트랙" });

  // 캠프파이어 서클
  g.blob(52, 14, 5, 3.5, "d");
  add(c, "campfire", 52, 14);
  add(c, "bench", 49, 11);
  add(c, "bench", 54, 11);
  add(c, "bench", 49, 17);
  add(c, "bench", 54, 17);
  c.areas.push({ id: "campfire", name: "🔥 캠프파이어", x: 47, y: 10, w: 11, h: 9 });
  c.labels.push({ x: 48, y: 10, text: "🔥 캠프파이어" });

  // 야외 무대 (스포트라이트)
  g.rect(44, 24, 14, 7, "-");
  g.rect(46, 25, 10, 2, "m");
  for (let i = 0; i < 3; i++) c.spotlights.push({ x: 48 + i * 2, y: 25 });
  add(c, "speaker", 45, 25);
  add(c, "speaker", 56, 25);
  add(c, "bench", 46, 29);
  add(c, "bench", 50, 29);
  add(c, "bench", 54, 29);
  c.labels.push({ x: 45, y: 24, text: "🎶 야외 무대" });

  // 꽃밭 정원
  for (let i = 0; i < 6; i++) add(c, "flowerbed", 10 + (i % 3) * 2, 34 + Math.floor(i / 3) * 2);
  for (let i = 0; i < 6; i++) add(c, "flowerbed", 44 + (i % 3) * 2, 34 + Math.floor(i / 3) * 2);
  add(c, "sign", 16, 34, {
    name: "정원 안내",
    props: { text: "선셋 파크 꽃밭입니다.\n피크닉 영역에서 프라이빗 대화를 즐겨보세요." },
  });

  // 피크닉 그늘막 3곳
  const spots: [number, number, string][] = [
    [10, 4, "🧺 피크닉 1"],
    [24, 34, "🧺 피크닉 2"],
    [58, 33, "🧺 피크닉 3"],
  ];
  spots.forEach(([px, py, name], i) => {
    g.rect(px, py, 6, 4, "d");
    add(c, "roundtable", px + 2, py + 1);
    add(c, "chair", px + 1, py + 2);
    add(c, "chair", px + 4, py + 2);
    c.areas.push({ id: `garden-picnic-${i + 1}`, name, x: px, y: py, w: 6, h: 4, maxOccupancy: 5 });
  });

  // 파크 라디오 + 게시판
  add(c, "speaker", 38, 30, {
    name: "파크 라디오",
    props: { url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3" },
  });
  add(c, "bulletin", 40, 31, { name: "파크 게시판" });

  // 나무 군락
  const rng = mulberry32(99);
  for (let i = 0; i < 14; i++) {
    const tx = 6 + Math.floor(rng() * 60);
    const ty = 4 + Math.floor(rng() * 34);
    const ch = g.g[ty]?.[tx];
    const ch2 = g.g[ty + 1]?.[tx + 1];
    if ((ch === "," || ch === ";") && (ch2 === "," || ch2 === ";")) add(c, "tree", tx, ty);
  }

  // 포털: 광장으로 + 중앙 워프 포탈
  add(c, "door", 38, 41, { name: "파크 출구" });
  c.portals.push({ id: "gd-po-plaza", x: 38, y: 41, kind: "room", roomTemplate: "plaza", label: "⛲ 광장으로" });
  add(c, "portalhub", 34, 28, { name: "워프 포탈" });

  return {
    key: "garden",
    name: "선셋 파크",
    description: "호수, 캠프파이어, 야외 무대, 피크닉 존, 라이딩 트랙이 있는 대형 공원",
    tiles: g.rows(),
    objects: c.objects,
    areas: c.areas,
    portals: c.portals,
    spawns: c.spawns,
    spotlights: c.spotlights,
    labels: c.labels,
  };
}

// ==================== 4. 그랑프리 서킷 (88 x 54) ====================
// 게더타운 Grand Prix 구성: 카트(F로 탑승) · 부스트 패드 · 라바콘 장애물 ·
// 체커 결승선 · 3랩 레이스 · 리더보드 · 관중석 · 중계석(스포트라이트) · 포디움

function buildCircuit(): MapData {
  const W = 88;
  const H = 54;
  const g = new Grid(W, H, ",");
  const c = ctx("cc");

  g.scatter(";", 460, 1, 1, W - 2, H - 2, 42, ",");

  // ---- 트랙 (아스팔트 링, 폭 7타일) + 연석 ----
  g.rect(7, 7, 74, 42, "r"); // 외곽 연석
  g.rect(8, 8, 72, 40, "a"); // 아스팔트
  g.rect(14, 14, 60, 28, "r"); // 안쪽 연석
  g.rect(15, 15, 58, 26, ","); // 잔디 아일랜드
  g.scatter(";", 120, 16, 16, 56, 24, 43, ",");

  // 결승선 (체커, 상단 직선)
  for (let r = 8; r < 15; r++) {
    g.set(44, r, "F");
    g.set(45, r, "F");
  }

  // ---- 부스트 패드 ----
  const boosts: [number, number][] = [
    [30, 44], [31, 44], [50, 44], [51, 44], [65, 43], [66, 43], // 백스트레이트
    [10, 22], [11, 22], // 좌측 직선
    [76, 30], [77, 30], // 우측 직선
    [55, 10], [56, 10], // 홈스트레이트 후반
  ];
  for (const [bx, by] of boosts) g.set(bx, by, "^");

  // ---- 피트레인 (아일랜드 상단) ----
  g.rect(28, 16, 32, 7, "-");
  for (let i = 0; i < 8; i++) g.set(31 + i * 3, 18, "b");
  add(c, "counter", 29, 20);
  add(c, "counter", 30, 20);
  add(c, "coffee", 31, 20);
  add(c, "vending", 57, 17);
  add(c, "sign", 28, 17, {
    name: "피트레인 안내",
    props: {
      text: "🏁 그랑프리 서킷에 오신 걸 환영합니다!\n\n1) 노란 칸에서 F 키로 카트 탑승\n2) 체커 라인을 지나면 랩 타이머 시작\n3) 시계 방향으로 3랩 완주!\n\n⚡ 노란 화살표 = 스피드 부스트\n🎁 ? 박스 = 랜덤 아이템 (터보/부스트/슬로우)\n🛢️ 기름 웅덩이 = 밟으면 미끄러져요\n🚧 라바콘은 완전히 막혀요 — 피하세요\n🌿 잔디/모래에선 카트가 느려집니다",
    },
  });
  c.spawns.push({ x: 34, y: 21 }, { x: 37, y: 21 }, { x: 40, y: 21 }, { x: 43, y: 21 });
  c.labels.push({ x: 29, y: 16, text: "🔧 피트레인 (F로 카트 탑승)" });

  // ---- 포디움 + 깃발 (아일랜드 중앙) ----
  add(c, "podium", 42, 28);
  add(c, "flag", 40, 28);
  add(c, "flag", 46, 28);
  c.labels.push({ x: 41, y: 27, text: "🏆 포디움" });

  // ---- 아일랜드 꾸미기 ----
  g.blob(62, 33, 6, 3.5, "s");
  g.blob(62, 33, 4.6, 2.5, "~");
  add(c, "tree", 20, 26);
  add(c, "tree", 25, 32);
  add(c, "tree", 55, 26);
  add(c, "bench", 30, 33);
  add(c, "bench", 34, 33);
  for (let i = 0; i < 4; i++) add(c, "flowerbed", 28 + i * 2, 25);
  c.areas.push({ id: "infield", name: "🌿 인필드 라운지", x: 28, y: 31, w: 10, h: 6 });

  // ---- 관중석 + 중계석 (트랙 위쪽 외곽) ----
  g.rect(14, 2, 60, 5, "-");
  for (let i = 0; i < 7; i++) add(c, "grandstand", 15 + i * 5, 2);
  c.labels.push({ x: 15, y: 2, text: "📣 관중석" });
  g.rect(60, 2, 13, 5, "-");
  add(c, "tv", 66, 2, { name: "중계 스크린", props: { url: "" } });
  add(c, "speaker", 64, 3);
  add(c, "speaker", 70, 3);
  c.spotlights.push({ x: 66, y: 4 }, { x: 68, y: 4 });
  c.labels.push({ x: 62, y: 6, text: "🎙️ 중계석 (스포트라이트)" });

  // ---- 라바콘 장애물 (트랙 위) ----
  const cones: [number, number][] = [
    [58, 11], [62, 12], // 홈스트레이트 이후
    [75, 20], [77, 26], [74, 35], // 우측
    [60, 45], [52, 42], [38, 45], [30, 42], // 하단
    [10, 36], [13, 30], [11, 19], // 좌측
    [25, 9], [33, 12], // 상단 진입
  ];
  for (const [cx2, cy2] of cones) add(c, "cone", cx2, cy2);

  // ---- 아이템 박스 (? 박스 — 밟으면 랜덤 효과, 6초 후 리스폰) ----
  const itemBoxes: [number, number][] = [
    [20, 9], [22, 10], [24, 11], // 홈스트레이트 초입
    [76, 20], [77, 23], // 우측 직선
    [44, 44], [42, 45], [40, 46], // 백스트레이트
    [10, 30], [11, 33], // 좌측 직선
  ];
  for (const [ix, iy] of itemBoxes) add(c, "itembox", ix, iy);

  // ---- 기름 웅덩이 (밟으면 미끄러짐) ----
  const oils: [number, number][] = [
    [66, 12], [24, 46], [12, 25], [75, 38],
  ];
  for (const [ox, oy] of oils) add(c, "oil", ox, oy);

  // ---- 타이어 방벽 (코너 보호) ----
  const tireSpots: [number, number][] = [
    [15, 15], [16, 15], [15, 16], // 아일랜드 코너 4곳
    [71, 15], [72, 15], [72, 16],
    [15, 39], [15, 40], [16, 40],
    [72, 39], [71, 40], [72, 40],
    [8, 8], [9, 8], [8, 9], // 외곽 코너 4곳
    [78, 8], [79, 8], [79, 9],
    [8, 46], [8, 47], [9, 47],
    [79, 46], [78, 47], [79, 47],
  ];
  for (const [tx, ty] of tireSpots) add(c, "tires", tx, ty);

  // ---- 외곽 나무/램프 ----
  for (let x = 0; x < W; x += 4) add(c, "tree", x, H - 2);
  for (let y = 10; y < H - 3; y += 6) {
    add(c, "tree", 0, y);
    add(c, "tree", W - 2, y);
  }
  add(c, "lamp", 6, 8);
  add(c, "lamp", 81, 8);
  add(c, "lamp", 6, 46);
  add(c, "lamp", 81, 46);

  // ---- 포털: 광장/테마 서킷 + 중앙 워프 포탈 ----
  add(c, "door", 4, 27, { name: "서킷 출구" });
  c.portals.push({ id: "cc-po-plaza", x: 4, y: 27, kind: "room", roomTemplate: "plaza", label: "⛲ 광장으로" });
  add(c, "portalhub", 50, 19, { name: "워프 포탈" });
  // 테마 전환 게이트 (요트/비행기)
  add(c, "sign", 44, 18, { name: "테마 서킷", props: { text: "🏁 테마 서킷\n\n오른쪽 문으로 바다 요트/하늘 비행기 서킷으로 이동!" } });
  add(c, "door", 46, 20, { name: "바다 요트 서킷" });
  c.portals.push({ id: "cc-po-sea", x: 46, y: 20, kind: "room", roomTemplate: "circuit-sea", label: "🛥️ 바다 요트 서킷으로" });
  add(c, "door", 48, 20, { name: "하늘 비행기 서킷" });
  c.portals.push({ id: "cc-po-sky", x: 48, y: 20, kind: "room", roomTemplate: "circuit-sky", label: "✈️ 하늘 비행기 서킷으로" });

  return {
    key: "circuit",
    name: "그랑프리 서킷",
    description: "카트 레이싱 서킷 — 부스트 패드, 라바콘, 3랩 타임어택, 리더보드, 관중석과 포디움",
    tiles: g.rows(),
    objects: c.objects,
    areas: c.areas,
    portals: c.portals,
    spawns: c.spawns,
    spotlights: c.spotlights,
    labels: c.labels,
    vehicle: "kart",
    race: {
      laps: 3,
      start: { x: 44, y: 8, w: 2, h: 7 },
      checkpoints: [
        { x: 73, y: 26, w: 7, h: 2 }, // CP1 우측 (시계 방향)
        { x: 43, y: 41, w: 2, h: 7 }, // CP2 하단
        { x: 8, y: 26, w: 7, h: 2 }, // CP3 좌측
      ],
    },
  };
}

// ==================== 5. 비치 리조트 (76 x 48) ====================
// 바다 · 보드워크(부두) · 티키 바 · 비치 발리볼 · 카바나 · 캠프파이어 · 선셋 스테이지

function buildBeach(): MapData {
  const W = 76;
  const H = 48;
  const g = new Grid(W, H, ",");
  const c = ctx("bc");

  g.scatter(";", 320, 1, 1, 44, H - 2, 77, ",");

  // ---- 바다 (우측) + 백사장 ----
  g.rect(56, 0, W - 56, H, "~");
  g.rect(44, 0, 12, H, "s");
  // 물결치는 해안선
  const shore = mulberry32(88);
  for (let r = 0; r < H; r++) {
    const wob = Math.floor(shore() * 3);
    for (let i = 0; i < wob; i++) g.set(56 + i, r, "s");
  }

  // ---- 보드워크 (부두) — 바다로 뻗은 원목 데크 ----
  g.rect(50, 20, 22, 5, "w");
  add(c, "lamp", 52, 19);
  add(c, "lamp", 62, 19);
  add(c, "lamp", 70, 19);
  add(c, "bench", 58, 23);
  add(c, "bench", 64, 23);
  add(c, "sign", 68, 21, {
    name: "부두 끝",
    props: { text: "🌅 선셋 포인트\n\n여기서 보는 노을이 제일 예뻐요.\n벤치에 앉아서(X) 잠시 쉬어가세요." },
  });
  c.areas.push({ id: "pier", name: "🌅 선셋 부두", x: 60, y: 20, w: 12, h: 5, maxOccupancy: 6 });
  c.labels.push({ x: 51, y: 20, text: "🌉 보드워크" });

  // ---- 티키 바 (백사장 위 오두막) ----
  g.rect(30, 6, 12, 8, "w");
  g.border(30, 6, 12, 8, "#");
  g.set(35, 13, "w");
  g.set(36, 13, "w");
  add(c, "counter", 31, 8);
  add(c, "counter", 32, 8);
  add(c, "counter", 33, 8);
  add(c, "coffee", 31, 7);
  add(c, "vending", 40, 7);
  add(c, "piano", 37, 8, { name: "비치 피아노" });
  add(c, "speaker", 34, 7, {
    name: "티키 라디오",
    props: { url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3" },
  });
  add(c, "roundtable", 32, 10);
  add(c, "chair", 31, 11);
  add(c, "chair", 34, 11);
  add(c, "roundtable", 37, 10);
  add(c, "chair", 36, 11);
  add(c, "chair", 39, 11);
  c.areas.push({ id: "tiki-bar", name: "🍹 티키 바", x: 31, y: 7, w: 10, h: 6 });
  c.labels.push({ x: 31, y: 6, text: "🍹 티키 바" });

  // ---- 비치 발리볼 코트 ----
  g.rect(45, 30, 10, 8, "s");
  add(c, "cone", 45, 33);
  add(c, "cone", 54, 33);
  add(c, "flag", 45, 30);
  add(c, "flag", 54, 30);
  c.areas.push({ id: "volleyball", name: "🏐 비치 발리볼", x: 45, y: 30, w: 10, h: 8, maxOccupancy: 8 });
  c.labels.push({ x: 45, y: 29, text: "🏐 비치 발리볼" });

  // ---- 카바나 3동 (프라이빗, 잠금 가능) ----
  for (let i = 0; i < 3; i++) {
    const bx = 45;
    const by = 4 + i * 6;
    g.rect(bx, by, 6, 5, "w");
    g.border(bx, by, 6, 5, "#");
    g.set(bx, by + 2, "w"); // 서쪽 출입구
    add(c, "bed", bx + 2, by + 1, { name: `카바나 침대 ${i + 1}`, props: { color: "#0d9488" } });
    c.areas.push({
      id: `cabana-${i + 1}`,
      name: `⛱️ 카바나 ${i + 1}`,
      x: bx + 1,
      y: by + 1,
      w: 4,
      h: 3,
      maxOccupancy: 4,
      lockable: true,
    });
  }
  c.labels.push({ x: 45, y: 3, text: "⛱️ 카바나 (잠금 가능)" });

  // ---- 캠프파이어 (백사장) ----
  add(c, "campfire", 48, 42);
  add(c, "bench", 45, 40);
  add(c, "bench", 51, 40);
  add(c, "bench", 45, 44);
  add(c, "bench", 51, 44);
  c.areas.push({ id: "beach-fire", name: "🔥 비치 파이어", x: 44, y: 39, w: 11, h: 7 });
  c.labels.push({ x: 44, y: 39, text: "🔥 비치 파이어" });

  // ---- 선셋 스테이지 (스포트라이트) ----
  g.rect(8, 8, 16, 9, "-");
  g.rect(10, 9, 12, 3, "m");
  for (let i = 0; i < 3; i++) c.spotlights.push({ x: 12 + i * 3, y: 10 });
  add(c, "speaker", 9, 9);
  add(c, "speaker", 21, 9);
  add(c, "tv", 14, 9, { name: "스테이지 스크린", props: { url: "" } });
  add(c, "bench", 10, 14);
  add(c, "bench", 14, 14);
  add(c, "bench", 18, 14);
  c.labels.push({ x: 9, y: 8, text: "🎶 선셋 스테이지 (스포트라이트)" });

  // ---- 라이딩 트랙 (잔디 쪽 루프) ----
  g.rect(4, 44, 48, 2, "=");
  g.rect(4, 22, 2, 24, "=");
  g.rect(4, 22, 24, 2, "=");
  g.rect(6, 44, 2, 1, "B");
  g.rect(46, 44, 2, 1, "B");
  c.labels.push({ x: 7, y: 43, text: "🏍️ 비치 트랙" });

  // ---- 피크닉 & 야자수 ----
  g.rect(12, 28, 6, 4, "d");
  add(c, "roundtable", 14, 29);
  add(c, "chair", 13, 30);
  add(c, "chair", 16, 30);
  c.areas.push({ id: "beach-picnic", name: "🧺 야자수 피크닉", x: 12, y: 28, w: 6, h: 4, maxOccupancy: 5 });
  const rng = mulberry32(55);
  for (let i = 0; i < 12; i++) {
    const tx = 4 + Math.floor(rng() * 36);
    const ty = 4 + Math.floor(rng() * 38);
    const ch = g.g[ty]?.[tx];
    const ch2 = g.g[ty + 1]?.[tx + 1];
    if ((ch === "," || ch === ";") && (ch2 === "," || ch2 === ";")) add(c, "tree", tx, ty);
  }
  for (let i = 0; i < 5; i++) add(c, "flowerbed", 26 + i * 2, 40);

  // ---- 게시판/안내판 + 아케이드 ----
  add(c, "bulletin", 34, 17, { name: "리조트 게시판" });
  add(c, "sign", 37, 17, {
    name: "리조트 안내",
    props: {
      text: "🏖️ 비치 리조트에 오신 걸 환영합니다!\n\n· 티키 바: 피아노 연주 & 커피\n· 카바나: 프라이빗 대화 (잠금 가능)\n· 부두 벤치에 앉아 노을 감상 (X 키)\n· 비치 트랙: F 키로 오토바이 라이딩",
    },
  });
  add(c, "arcade", 40, 17, { name: "비치 테트리스" });

  // ---- 스폰 + 포털 ----
  c.spawns.push({ x: 36, y: 20 }, { x: 38, y: 20 }, { x: 36, y: 22 }, { x: 38, y: 22 });
  add(c, "door", 30, 21, { name: "리조트 출구" });
  c.portals.push({ id: "bc-po-plaza", x: 30, y: 21, kind: "room", roomTemplate: "plaza", label: "⛲ 광장으로" });
  add(c, "portalhub", 37, 24, { name: "워프 포탈" });

  return {
    key: "beach",
    name: "비치 리조트",
    description: "바다, 부두, 티키 바, 비치 발리볼, 카바나, 캠프파이어가 있는 휴양지 맵",
    tiles: g.rows(),
    objects: c.objects,
    areas: c.areas,
    portals: c.portals,
    spawns: c.spawns,
    spotlights: c.spotlights,
    labels: c.labels,
  };
}

// ==================== 6. 스타홀 갤러리 (46 x 30) ====================
// 명예의전당 컨셉 — 그림책 캐릭터 5인을 전시대(exhibit)에 전시. X 키로 정보 팝업.

function buildStarhall(): MapData {
  const W = 46;
  const H = 30;
  const g = new Grid(W, H, "k"); // 어두운 마루
  const c = ctx("sh");

  // 벽 + 바닥 마감
  g.border(0, 0, W, H, "#");
  // 중앙 레드카펫 러너 (입구 → 안쪽)
  g.rect(21, 6, 4, H - 7, "m");
  // 앞쪽 대리석 통로
  g.rect(4, 5, W - 8, 3, "-");

  // ---- 전시대 5인 (뒷벽 라인) ----
  const stars: { head: string; name: string; title: string; text: string }[] = [
    {
      head: "b-lucian",
      name: "루시안",
      title: "빛의 기사",
      text: "어둠이 가장 짙은 밤, 스스로 등불이 되기를 택한 소년.\n두려움 앞에서도 한 걸음 더 나아가는 용기의 상징입니다.",
    },
    {
      head: "g-lucia",
      name: "루시아",
      title: "여명의 성녀",
      text: "새벽의 첫 빛과 함께 나타난다는 소녀.\n지친 이들의 마음에 가장 먼저 아침을 가져다줍니다.",
    },
    {
      head: "b-moses",
      name: "모세",
      title: "물길을 가르는 자",
      text: "지팡이 하나로 바다를 갈랐다는 전설의 인도자.\n막다른 길에서도 새로운 길을 여는 지혜를 지녔습니다.",
    },
    {
      head: "g-ariel",
      name: "아리엘",
      title: "바람의 노래",
      text: "하늘과 바다를 잇는 노래를 부르는 음유시인.\n그 선율을 들은 이는 누구나 다시 꿈을 꾼다고 합니다.",
    },
    {
      head: "b-cross",
      name: "크로스",
      title: "맹세의 수호자",
      text: "마지막 순간까지 약속을 지켜낸 방패의 기사.\n한 번 맺은 언약은 결코 저버리지 않습니다.",
    },
  ];
  const startX = 5;
  const gap = 8;
  stars.forEach((s, i) => {
    const ex = startX + i * gap;
    add(c, "exhibit", ex, 2, {
      name: s.name,
      props: { head: s.head, title: s.title, text: s.text },
    });
    // 전시대 사이 장식 램프
    if (i < stars.length - 1) add(c, "lamp", ex + gap - 3, 3);
  });
  add(c, "lamp", 3, 3);
  add(c, "lamp", W - 4, 3);

  // ---- 관람 벤치 + 중앙 트로피(분수 대용) ----
  add(c, "bench", 10, 18);
  add(c, "bench", 16, 18);
  add(c, "bench", 30, 18);
  add(c, "bench", 36, 18);
  add(c, "fountain", 21, 12);
  add(c, "flowerbed", 8, 24);
  add(c, "flowerbed", 12, 24);
  add(c, "flowerbed", 33, 24);
  add(c, "flowerbed", 37, 24);
  add(c, "plant", 2, 26);
  add(c, "plant", W - 3, 26);

  // ---- 안내판 + 스폰 + 포털 ----
  add(c, "sign", 18, 25, {
    name: "스타홀 안내",
    props: {
      text: "⭐ 스타홀 갤러리\n\n그림책 속 전설의 인물 다섯을 전시한 명예의 전당입니다.\n전시대 앞에서 X 키를 누르면 그 인물의 이야기를 볼 수 있어요.",
    },
  });
  c.spawns.push({ x: 22, y: 24 }, { x: 23, y: 24 }, { x: 21, y: 23 }, { x: 24, y: 23 });
  add(c, "door", 22, 28, { name: "갤러리 출구" });
  c.portals.push({ id: "sh-po-plaza", x: 22, y: 28, kind: "room", roomTemplate: "plaza", label: "⛲ 광장으로" });
  add(c, "door", 23, 28, { name: "갤러리 출구" });
  c.portals.push({ id: "sh-po-plaza2", x: 23, y: 28, kind: "room", roomTemplate: "plaza", label: "⛲ 광장으로" });
  add(c, "portalhub", 29, 20, { name: "워프 포탈" });
  c.labels.push({ x: 4, y: 1, text: "⭐ 스타홀 갤러리 — 명예의 전당" });

  return {
    key: "starhall",
    name: "스타홀 갤러리",
    description: "그림책 캐릭터 5인을 전시한 명예의 전당. 전시대에서 X 키로 인물 정보를 볼 수 있어요.",
    tiles: g.rows(),
    objects: c.objects,
    areas: c.areas,
    portals: c.portals,
    spawns: c.spawns,
    spotlights: c.spotlights,
    labels: c.labels,
  };
}

// ==================== 7. 야외 카페 테라스 (50 x 36) ====================
// 아늑한 야외 카페 — 원목 데크, 파라솔 테이블, 스트링 라이트, 커피바, 피아노, 작은 무대.

function buildCafe(): MapData {
  const W = 50;
  const H = 36;
  const g = new Grid(W, H, ",");
  const c = ctx("cf");

  g.scatter(";", 260, 1, 1, W - 2, H - 2, 61, ",");

  // 외곽 나무 울타리
  for (let x = 0; x < W; x += 3) {
    add(c, "tree", x, 0);
    add(c, "tree", x, H - 2);
  }
  for (let y = 3; y < H - 3; y += 4) {
    add(c, "tree", 0, y);
    add(c, "tree", W - 2, y);
  }

  // 원목 데크 (중앙 테라스)
  g.rect(6, 5, 38, 24, "w");
  // 보도블럭 진입로
  g.rect(22, 29, 6, 6, "-");

  // ---- 커피 바 (상단) ----
  g.rect(10, 5, 14, 4, "k");
  add(c, "counter", 11, 7);
  add(c, "counter", 12, 7);
  add(c, "counter", 13, 7);
  add(c, "coffee", 11, 6);
  add(c, "coffee", 14, 6);
  add(c, "vending", 22, 6);
  add(c, "speaker", 17, 6, {
    name: "카페 재즈",
    props: { url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3" },
  });
  c.labels.push({ x: 10, y: 5, text: "☕ 커피 바" });

  // ---- 파라솔 테이블 6세트 ----
  const tables: [number, number][] = [
    [10, 13], [18, 13], [26, 13],
    [10, 20], [18, 20], [26, 20],
  ];
  tables.forEach(([tx, ty], i) => {
    add(c, "roundtable", tx, ty, { name: `테이블 ${i + 1}` });
    add(c, "chair", tx - 1, ty + 1);
    add(c, "chair", tx + 2, ty + 1);
    add(c, "chair", tx, ty + 2, { dir: "up" });
  });

  // ---- 작은 무대 (스포트라이트) + 피아노 ----
  g.rect(33, 11, 9, 8, "m");
  for (let i = 0; i < 2; i++) c.spotlights.push({ x: 35 + i * 2, y: 13 });
  add(c, "piano", 34, 12, { name: "카페 피아노" });
  add(c, "speaker", 40, 12);
  add(c, "bench", 34, 16);
  add(c, "bench", 38, 16);
  c.labels.push({ x: 33, y: 11, text: "🎹 라이브 무대" });

  // ---- 스트링 라이트(램프) & 화분 ----
  add(c, "lamp", 6, 5);
  add(c, "lamp", 43, 5);
  add(c, "lamp", 6, 28);
  add(c, "lamp", 43, 28);
  for (let i = 0; i < 5; i++) add(c, "flowerbed", 8 + i * 3, 27);
  add(c, "plant", 7, 12);
  add(c, "plant", 42, 22);
  add(c, "minigame", 8, 24, { name: "미니게임 기기" });

  // ---- 게시판 + 안내 ----
  add(c, "bulletin", 30, 6, { name: "카페 게시판" });
  add(c, "sign", 28, 6, {
    name: "카페 안내",
    props: { text: "🌿 야외 카페 테라스\n\n커피 한 잔 내리고(X) 파라솔 아래에서 쉬어가세요.\n무대의 피아노는 누구나 연주할 수 있어요." },
  });

  // ---- 스폰 + 포털 + 워프 ----
  c.spawns.push({ x: 24, y: 24 }, { x: 26, y: 24 }, { x: 22, y: 23 });
  add(c, "door", 25, 34, { name: "카페 출구" });
  c.portals.push({ id: "cf-po-plaza", x: 25, y: 34, kind: "room", roomTemplate: "plaza", label: "⛲ 광장으로" });
  add(c, "portalhub", 20, 24, { name: "워프 포탈" });
  c.labels.push({ x: 6, y: 4, text: "🌿 야외 카페 테라스" });

  return {
    key: "cafe",
    name: "야외 카페 테라스",
    description: "원목 데크, 파라솔 테이블, 커피 바, 라이브 피아노 무대가 있는 아늑한 야외 카페",
    tiles: g.rows(),
    objects: c.objects,
    areas: c.areas,
    portals: c.portals,
    spawns: c.spawns,
    spotlights: c.spotlights,
    labels: c.labels,
  };
}

// ==================== 7.5 테마 레이스 (바다 요트 / 하늘 비행기) ====================
// 사각 링 트랙. 트랙 밖은 solid 방벽(바다=물, 하늘=허공)으로 이탈을 막는다.

function buildRingRace(theme: "sea" | "sky"): MapData {
  const W = 80;
  const H = 50;
  const barrier = theme === "sea" ? "~" : "x"; // 트랙 밖 방벽(통과불가)
  const island = theme === "sea" ? "w" : "-"; // 안쪽 섬(데크/구름 플랫폼)
  const g = new Grid(W, H, barrier);
  const c = ctx(theme);

  // ---- 사각 링 트랙 ----
  g.rect(7, 7, W - 14, H - 14, "r"); // 외곽 연석
  g.rect(8, 8, W - 16, H - 16, "a"); // 아스팔트(활주로/부두)
  g.rect(14, 14, W - 28, H - 28, "r"); // 안쪽 연석
  g.rect(15, 15, W - 30, H - 30, island); // 안쪽 섬

  // 결승선(상단 직선 세로 체커)
  for (let r = 8; r < 14; r++) {
    g.set(39, r, "F");
    g.set(40, r, "F");
  }
  // 카트 패드(출발, 6인 이상 탑승 가능) + 부스트
  g.rect(33, 11, 12, 1, "b");
  const boosts: [number, number][] = [
    [W - 11, 24], [W - 11, 25], [24, H - 11], [25, H - 11], [10, 24], [10, 25], [55, 9], [56, 9],
  ];
  for (const [bx, by] of boosts) g.set(bx, by, "^");

  // 스폰(출발선 뒤)
  c.spawns.push({ x: 34, y: 11 }, { x: 37, y: 11 }, { x: 42, y: 11 }, { x: 45, y: 11 }, { x: 34, y: 9 }, { x: 45, y: 9 });

  // ---- 아이템 박스 / 기름 ----
  const items: [number, number][] = [
    [20, 10], [26, 10], [W - 11, 20], [W - 11, 30], [30, H - 11], [50, H - 11], [10, 20], [10, 30], [60, 10],
  ];
  for (const [ix, iy] of items) add(c, "itembox", ix, iy);
  for (const [ox, oy] of [[W - 11, 16], [16, H - 11], [10, 34]] as [number, number][]) add(c, "oil", ox, oy);

  // ---- 안쪽 섬 꾸미기 + 포디움(트로피장) ----
  add(c, "podium", 38, 30);
  add(c, "flag", 36, 30);
  add(c, "flag", 41, 30);
  if (theme === "sea") {
    // 요트 부두 테마 — 야자수/부표(라바콘)/모래
    g.blob(24, 24, 4, 2.6, "s");
    g.blob(55, 32, 4, 2.6, "s");
    add(c, "tree", 22, 22);
    add(c, "tree", 56, 33);
    for (const [bx, by] of [[16, 8], [63, 8], [16, H - 9], [63, H - 9]] as [number, number][]) add(c, "cone", bx, by);
    add(c, "sign", 30, 16, {
      name: "요트 레이스 안내",
      props: { text: "🛥️ 바다 요트 레이스\n\n부두(F로 카트 탑승)에서 출발해 3바퀴!\n트랙 밖은 바다라 빠지지 않게 조심하세요.\n⚡ 부스트 · 🎁 아이템 박스 활용!" },
    });
    c.labels.push({ x: 16, y: 6, text: "🛥️ 바다 요트 서킷" });
  } else {
    // 하늘 비행기 테마 — 구름섬/활주로
    for (const [cx2, cy2] of [[20, 20], [55, 22], [30, 34], [50, 32], [24, 30]] as [number, number][]) {
      add(c, "flowerbed", cx2, cy2); // 구름 대용 장식
    }
    for (const [bx, by] of [[16, 8], [63, 8], [16, H - 9], [63, H - 9]] as [number, number][]) add(c, "flag", bx, by);
    add(c, "sign", 30, 16, {
      name: "하늘 레이스 안내",
      props: { text: "✈️ 하늘 비행기 레이스\n\n활주로(F로 탑승)에서 출발해 3바퀴!\n트랙 밖은 허공이니 이탈 금지.\n⚡ 부스트 · 🎁 아이템 박스로 역전을!" },
    });
    c.labels.push({ x: 16, y: 6, text: "✈️ 하늘 활주로 서킷" });
  }

  // ---- 관중석 + 램프 ----
  for (let i = 0; i < 5; i++) add(c, "grandstand", 18 + i * 9, 2);
  add(c, "lamp", 6, 6);
  add(c, "lamp", W - 7, 6);
  add(c, "lamp", 6, H - 7);
  add(c, "lamp", W - 7, H - 7);

  // ---- 워프 포탈(안쪽 섬) — 전체 미니맵으로 어디든 이동 ----
  // (트랙 위에 방 포털을 두면 주행 중 오발동하므로, 안쪽 섬의 워프 포탈로만 이동)
  add(c, "portalhub", 44, 30, { name: "워프 포탈" });

  return {
    key: theme === "sea" ? "circuit-sea" : "circuit-sky",
    name: theme === "sea" ? "바다 요트 서킷" : "하늘 비행기 서킷",
    description:
      theme === "sea"
        ? "바다 위 부두를 도는 요트 레이스. 트랙 밖은 바다 방벽으로 막혀 있어요."
        : "구름 위 활주로를 도는 비행기 레이스. 트랙 밖은 허공 방벽으로 막혀 있어요.",
    tiles: g.rows(),
    objects: c.objects,
    areas: c.areas,
    portals: c.portals,
    spawns: c.spawns,
    spotlights: c.spotlights,
    labels: c.labels,
    vehicle: "kart",
    race: {
      laps: 3,
      start: { x: 39, y: 8, w: 2, h: 6 },
      checkpoints: [
        { x: W - 14, y: 24, w: 6, h: 2 }, // 우측
        { x: 39, y: H - 14, w: 2, h: 6 }, // 하단
        { x: 8, y: 24, w: 6, h: 2 }, // 좌측
      ],
    },
  };
}

// ==================== 8. 배틀 아레나 (PK 샷건존, 44 x 32) ====================
// 무기를 구매해 서로 PK 하는 전투 구역. 엄폐물(상자/드럼통/모래주머니)로 몸을 숨긴다.

function buildArena(): MapData {
  const W = 44;
  const H = 32;
  const g = new Grid(W, H, "k"); // 어두운 콘크리트 바닥
  const c = ctx("ar");

  g.border(0, 0, W, H, "#");
  // 바닥 패턴(격자 얼룩)
  g.scatter("x", 40, 2, 2, W - 4, H - 4, 33, "k");
  // 중앙 도로 느낌
  g.rect(4, 15, W - 8, 2, "=");
  g.rect(21, 4, 2, W - 12, "=");

  // ---- 엄폐물 배치 (대칭) ----
  const covers: [string, number, number][] = [
    ["crate", 10, 8], ["crate", 11, 8], ["barrel", 13, 9],
    ["sandbag", 8, 12], ["crate", 30, 8], ["crate", 31, 8],
    ["barrel", 29, 9], ["sandbag", 33, 12], ["crate", 18, 12],
    ["barrel", 24, 12], ["sandbag", 20, 20], ["crate", 12, 22],
    ["crate", 13, 22], ["barrel", 16, 23], ["sandbag", 28, 20],
    ["crate", 30, 22], ["barrel", 27, 23], ["crate", 21, 25],
    ["barrel", 6, 18], ["barrel", 37, 18], ["crate", 6, 25], ["crate", 37, 25],
  ];
  for (const [type, cx2, cy2] of covers) add(c, type as ObjectKind, cx2, cy2);

  // ---- 대형 조형물(중앙) ----
  add(c, "statue", 21, 13, { name: "전장의 수호상" });

  // ---- 무기 상점 안내 + 스폰(양측) ----
  add(c, "sign", 3, 3, {
    name: "무기 상점 안내",
    props: {
      text: "🔫 배틀 아레나 — PK 존\n\n상단 무기 아이콘으로 무기를 구매/선택하세요.\n· 클릭 또는 스페이스로 바라보는 방향으로 발사\n· HP 0이 되면 3.5초 후 부활\n· 킬을 쌓아 칭호를 획득! (킬러 = 100킬)\n\n엄폐물 뒤에 숨어 교전하세요.",
    },
  });
  c.spawns.push({ x: 4, y: 6 }, { x: 6, y: 6 }, { x: 4, y: 26 }, { x: 6, y: 26 });
  c.spawns.push({ x: 39, y: 6 }, { x: 37, y: 6 }, { x: 39, y: 26 }, { x: 37, y: 26 });
  add(c, "lamp", 2, 2);
  add(c, "lamp", W - 3, 2);
  add(c, "lamp", 2, H - 3);
  add(c, "lamp", W - 3, H - 3);
  c.labels.push({ x: 3, y: 1, text: "🔫 배틀 아레나 (PK)" });

  // ---- 포털: 광장으로 + 워프 ----
  add(c, "door", 21, 30, { name: "아레나 출구" });
  c.portals.push({ id: "ar-po-plaza", x: 21, y: 30, kind: "room", roomTemplate: "plaza", label: "⛲ 광장으로(안전지대)" });

  return {
    key: "arena",
    name: "배틀 아레나",
    description: "무기를 구매해 PK 하는 전투 구역. 엄폐물 뒤에서 교전하고 킬로 칭호를 획득하세요.",
    tiles: g.rows(),
    objects: c.objects,
    areas: c.areas,
    portals: c.portals,
    spawns: c.spawns,
    spotlights: c.spotlights,
    labels: c.labels,
    pk: true,
  };
}

export const PRESET_MAPS: Record<string, MapData> = {
  plaza: buildPlaza(),
  office: buildOffice(),
  garden: buildGarden(),
  circuit: buildCircuit(),
  beach: buildBeach(),
  starhall: buildStarhall(),
  cafe: buildCafe(),
  arena: buildArena(),
  "circuit-sea": buildRingRace("sea"),
  "circuit-sky": buildRingRace("sky"),
};
