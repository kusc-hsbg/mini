// 캐릭터/타일/오브젝트를 코드로 그리는 픽셀아트 렌더러 (외부 이미지 에셋 0개).
import type { CharacterAppearance, Direction, PlayerCosmetics, UserStatus } from "./types";
import { TILE_INFO, type MapObject } from "./maps";
import { OBJECT_DEFS } from "./objects";
import { STATUS_META, TILE, headImgUrl } from "./constants";
import { SHOP_MAP } from "./shop";

// ---------- 유틸 ----------

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export function darken(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return hex;
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.floor(r * (1 - amt)));
  g = Math.max(0, Math.floor(g * (1 - amt)));
  b = Math.max(0, Math.floor(b * (1 - amt)));
  return `rgb(${r},${g},${b})`;
}

export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return hex;
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.min(255, Math.floor(r + (255 - r) * amt));
  g = Math.min(255, Math.floor(g + (255 - g) * amt));
  b = Math.min(255, Math.floor(b + (255 - b) * amt));
  return `rgb(${r},${g},${b})`;
}

function roundRect(
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

// 커스텀 오브젝트 이미지 캐시
const imgCache = new Map<string, HTMLImageElement | null>();
function getImage(url: string): HTMLImageElement | null {
  if (imgCache.has(url)) return imgCache.get(url) ?? null;
  imgCache.set(url, null);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => imgCache.set(url, img);
  img.src = url;
  return null;
}

// ---------- 타일 ----------

export function drawTile(
  ctx: CanvasRenderingContext2D,
  ch: string,
  col: number,
  row: number
) {
  const info = TILE_INFO[ch] ?? TILE_INFO["."];
  const x = col * TILE;
  const y = row * TILE;
  ctx.fillStyle = info.color;
  ctx.fillRect(x, y, TILE, TILE);
  const rnd = hash2(col, row);

  switch (ch) {
    case ",":
    case ";": {
      // 잔디: 색 변화 + 풀잎
      if (rnd > 0.75) {
        ctx.fillStyle = lighten(info.color, 0.05);
        ctx.fillRect(x, y, TILE, TILE);
      }
      ctx.fillStyle = darken(info.color, 0.14);
      for (let i = 0; i < 3; i++) {
        const gx = x + 4 + Math.floor(hash2(col * 3 + i, row) * 24);
        const gy = y + 4 + Math.floor(hash2(col, row * 3 + i) * 24);
        ctx.fillRect(gx, gy, 2, 4);
      }
      break;
    }
    case "d": {
      // 흙길: 자갈
      ctx.fillStyle = darken(info.color, 0.12);
      for (let i = 0; i < 3; i++) {
        const gx = x + Math.floor(hash2(col + i, row * 2) * 26);
        const gy = y + Math.floor(hash2(col * 2, row + i) * 26);
        ctx.fillRect(gx, gy, 3, 2);
      }
      break;
    }
    case "s": {
      ctx.fillStyle = darken(info.color, 0.08);
      for (let i = 0; i < 4; i++) {
        const gx = x + Math.floor(hash2(col + i, row) * 28);
        const gy = y + Math.floor(hash2(col, row + i) * 28);
        ctx.fillRect(gx, gy, 2, 2);
      }
      break;
    }
    case "-": {
      // 보도블럭
      ctx.strokeStyle = "rgba(0,0,0,0.14)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      ctx.beginPath();
      ctx.moveTo(x + TILE / 2, y);
      ctx.lineTo(x + TILE / 2, y + TILE / 2);
      ctx.moveTo(x, y + TILE / 2);
      ctx.lineTo(x + TILE, y + TILE / 2);
      ctx.stroke();
      break;
    }
    case "=": {
      // 도로: 아스팔트 질감 + 차선
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      if (rnd > 0.5) ctx.fillRect(x + 6, y + 10, 4, 2);
      ctx.fillStyle = "#d7cf6b";
      if ((col + row) % 2 === 0) ctx.fillRect(x + TILE / 2 - 1, y + 4, 3, 12);
      break;
    }
    case "~": {
      // 물: 파도 무늬
      ctx.fillStyle = info.accent!;
      ctx.globalAlpha = 0.45;
      const off = Math.floor(hash2(col, row) * 8);
      ctx.fillRect(x + 3 + off, y + 7, 12, 3);
      ctx.fillRect(x + 12 - off, y + 20, 12, 3);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(x + 6 + off, y + 8, 5, 1);
      break;
    }
    case ".": {
      // 실내 타일: 격자
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      if (rnd > 0.85) {
        ctx.fillStyle = "rgba(0,0,0,0.03)";
        ctx.fillRect(x, y, TILE, TILE);
      }
      break;
    }
    case "p": {
      // 스타홀 석재: 따뜻한 대리석과 은은한 줄무늬
      ctx.strokeStyle = "rgba(112,77,34,0.10)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      if (rnd > 0.62) {
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 8 + rnd * 6);
        ctx.quadraticCurveTo(x + 15, y + 5, x + 28, y + 18);
        ctx.stroke();
      }
      break;
    }
    case "e": {
      // 민트 조명석: 전시 프레임 주변 발광 바닥
      const grd = ctx.createRadialGradient(x + TILE / 2, y + TILE / 2, 2, x + TILE / 2, y + TILE / 2, TILE / 2);
      grd.addColorStop(0, "rgba(237,255,248,0.95)");
      grd.addColorStop(0.55, info.color);
      grd.addColorStop(1, "#52b894");
      ctx.fillStyle = grd;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = "rgba(255,255,255,0.34)";
      ctx.strokeRect(x + 4.5, y + 4.5, TILE - 9, TILE - 9);
      break;
    }
    case "w":
    case "k": {
      // 원목 마루: 가로 플랭크 + 이음새
      ctx.fillStyle = darken(info.color, 0.13);
      ctx.fillRect(x, y + 10, TILE, 1);
      ctx.fillRect(x, y + 21, TILE, 1);
      const seam = Math.floor(hash2(col, row) * 3);
      ctx.fillRect(x + 8 + seam * 6, y, 1, 10);
      ctx.fillRect(x + 4 + seam * 8, y + 11, 1, 10);
      ctx.fillRect(x + 12 + seam * 5, y + 22, 1, 10);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      if (rnd > 0.7) ctx.fillRect(x + 2, y + 3, 10, 2);
      break;
    }
    case "c":
    case "m":
    case "g": {
      // 카펫: 도트 패턴
      ctx.fillStyle = darken(info.color, 0.1);
      for (let iy = 4; iy < TILE; iy += 8) {
        for (let ix = ((iy / 8) % 2) * 4 + 2; ix < TILE; ix += 8) {
          ctx.fillRect(x + ix, y + iy, 2, 2);
        }
      }
      break;
    }
    case "#": {
      // 벽 2.5D: 윗면 밝게 + 몸통 + 아랫단 그림자
      ctx.fillStyle = info.accent!;
      ctx.fillRect(x, y, TILE, 10);
      ctx.fillStyle = darken(info.color, 0.08);
      ctx.fillRect(x, y + 10, TILE, TILE - 10);
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(x, y, TILE, 2);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(x, y + TILE - 5, TILE, 5);
      // 벽돌 라인
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(x, y + 17, TILE, 1);
      ctx.fillRect(x + ((col % 2) * 16 + 8) % TILE, y + 10, 1, 7);
      ctx.fillRect(x + ((col % 2) * 8 + 16) % TILE, y + 18, 1, 8);
      break;
    }
    case "B":
    case "b": {
      ctx.fillStyle = "rgba(251,191,36,0.16)";
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.strokeStyle = "rgba(251,191,36,0.7)";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
      ctx.setLineDash([]);
      ctx.font = "14px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch === "b" ? "🏎️" : "🏍️", x + TILE / 2, y + TILE / 2);
      break;
    }
    case "r": {
      // 레이싱 연석: 빨강/흰색 스트라이프
      const half = TILE / 2;
      for (let iy = 0; iy < 2; iy++) {
        for (let ix = 0; ix < 2; ix++) {
          ctx.fillStyle = (ix + iy + col + row) % 2 === 0 ? "#d64545" : "#f3f4f6";
          ctx.fillRect(x + ix * half, y + iy * half, half, half);
        }
      }
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(x, y + TILE - 3, TILE, 3);
      break;
    }
    case "a": {
      // 서킷 아스팔트: 미세 질감 + 간헐적 스키드 마크
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      if (rnd > 0.55) ctx.fillRect(x + 4 + Math.floor(rnd * 14), y + 6 + Math.floor(rnd * 16), 5, 2);
      if (rnd > 0.93) {
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 26);
        ctx.quadraticCurveTo(x + 14, y + 14, x + 28, y + 8);
        ctx.stroke();
      }
      break;
    }
    case "^": {
      // 스피드 부스트: 노란 더블 셰브론 (게더 그랑프리 스타일)
      ctx.fillStyle = "rgba(251,191,36,0.12)";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#fbbf24";
      for (const oy of [4, 14]) {
        ctx.beginPath();
        ctx.moveTo(x + 6, y + oy + 10);
        ctx.lineTo(x + 16, y + oy);
        ctx.lineTo(x + 26, y + oy + 10);
        ctx.lineTo(x + 26, y + oy + 14);
        ctx.lineTo(x + 16, y + oy + 4);
        ctx.lineTo(x + 6, y + oy + 14);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "F": {
      // 체커 무늬 (출발/결승선)
      const s = 8;
      for (let iy = 0; iy < TILE / s; iy++) {
        for (let ix = 0; ix < TILE / s; ix++) {
          ctx.fillStyle = (ix + iy) % 2 === 0 ? "#e5e7eb" : "#1f2430";
          ctx.fillRect(x + ix * s, y + iy * s, s, s);
        }
      }
      break;
    }
  }
}

// ---------- 오브젝트 ----------

const BOOK_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#f97316"];

export function drawObject(
  ctx: CanvasRenderingContext2D,
  o: MapObject,
  t: number,
  collected = false // itembox: 획득 후 리스폰 대기 중
) {
  const def = OBJECT_DEFS[o.type];
  if (!def) return;
  const x = o.x * TILE;
  const y = o.y * TILE;
  const w = def.w * TILE;
  const h = def.h * TILE;

  switch (o.type) {
    case "itembox": {
      // 회전하는 ? 박스 (마리오카트 스타일) — 획득 시 흐린 외곽선만
      const bobY = Math.sin(t / 260 + o.x) * 2.5;
      const cx = x + TILE / 2;
      const cy = y + TILE / 2 + bobY;
      if (collected) {
        ctx.globalAlpha = 0.22;
      }
      // 그림자
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(x + TILE / 2, y + TILE - 4, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // 무지개 그라데이션 박스
      const hue = Math.floor((t / 12 + o.x * 40) % 360);
      ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
      roundRect(ctx, cx - 10, cy - 10, 20, 20, 4);
      ctx.fill();
      ctx.fillStyle = `hsl(${(hue + 60) % 360}, 80%, 68%)`;
      roundRect(ctx, cx - 10, cy - 10, 20, 8, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, cx - 10, cy - 10, 20, 20, 4);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px ui-sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", cx, cy + 1);
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
      return;
    }
    case "oil": {
      // 검은 기름 웅덩이 + 무지개빛 광택
      ctx.fillStyle = "rgba(12,14,18,0.85)";
      ctx.beginPath();
      ctx.ellipse(x + 16, y + 17, 13, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 8, y + 11, 5, 3.5, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 25, y + 22, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      const sh = Math.sin(t / 400 + o.y) * 2;
      ctx.fillStyle = "rgba(120,180,255,0.28)";
      ctx.beginPath();
      ctx.ellipse(x + 13 + sh, y + 15, 5, 2, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(200,140,255,0.22)";
      ctx.beginPath();
      ctx.ellipse(x + 20 - sh, y + 19, 4, 1.8, 0.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case "trackarrow": {
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;
      const angle =
        o.dir === "down" ? Math.PI / 2 : o.dir === "left" ? Math.PI : o.dir === "up" ? -Math.PI / 2 : 0;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = "rgba(250,204,21,0.22)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.strokeStyle = "rgba(17,24,39,0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-2, -11);
      ctx.lineTo(-2, -5);
      ctx.lineTo(-14, -5);
      ctx.lineTo(-14, 5);
      ctx.lineTo(-2, 5);
      ctx.lineTo(-2, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    case "desk": {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 2, y + h - 4, w - 4, 4);
      ctx.fillStyle = "#8a6444";
      roundRect(ctx, x + 1, y + 2, w - 2, h - 4, 4);
      ctx.fill();
      ctx.fillStyle = "#9d7350";
      ctx.fillRect(x + 3, y + 4, w - 6, 4);
      // 모니터
      ctx.fillStyle = "#1f2430";
      roundRect(ctx, x + 8, y - 8, 20, 14, 2);
      ctx.fill();
      ctx.fillStyle = "#3b6ea5";
      ctx.fillRect(x + 10, y - 6, 16, 10);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(x + 11, y - 5, 6, 3);
      ctx.fillStyle = "#1f2430";
      ctx.fillRect(x + 16, y + 6, 4, 3);
      // 키보드
      ctx.fillStyle = "#3a4152";
      ctx.fillRect(x + 36, y + 10, 16, 7);
      break;
    }
    case "chair": {
      const back = o.dir === "up" ? "bottom" : "top";
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(x + 16, y + 26, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4a5568";
      roundRect(ctx, x + 7, y + 10, 18, 14, 4);
      ctx.fill();
      ctx.fillStyle = "#5b6b82";
      roundRect(ctx, x + 9, y + 12, 14, 10, 3);
      ctx.fill();
      ctx.fillStyle = "#3d475a";
      if (back === "top") roundRect(ctx, x + 7, y + 2, 18, 8, 3);
      else roundRect(ctx, x + 7, y + 22, 18, 8, 3);
      ctx.fill();
      break;
    }
    case "sofa": {
      const color = o.props?.color ?? "#c05e5e";
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 2, y + h - 5, w - 4, 5);
      ctx.fillStyle = darken(color, 0.25);
      roundRect(ctx, x + 1, y + 2, w - 2, h - 4, 6); // 프레임
      ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, x + 5, y + 10, w - 10, h - 14, 4); // 좌석
      ctx.fill();
      ctx.fillStyle = lighten(color, 0.12);
      ctx.fillRect(x + 5, y + 10, (w - 10) / 2 - 1, h - 14);
      ctx.fillStyle = darken(color, 0.15);
      roundRect(ctx, x + 1, y + 2, w - 2, 9, 4); // 등받이
      ctx.fill();
      break;
    }
    case "table":
    case "counter": {
      const base = o.type === "counter" ? "#6b4e34" : "#8a6444";
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 2, y + h - 4, w - 4, 4);
      ctx.fillStyle = base;
      roundRect(ctx, x + 1, y + 2, w - 2, h - 4, 4);
      ctx.fill();
      ctx.fillStyle = lighten(base, 0.12);
      ctx.fillRect(x + 3, y + 4, w - 6, 4);
      if (o.type === "counter") {
        ctx.fillStyle = darken(base, 0.2);
        ctx.fillRect(x + 1, y + h - 10, w - 2, 6);
      }
      break;
    }
    case "roundtable": {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h - 8, w / 2 - 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a6444";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 3, h / 2 - 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#9d7350";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2 - 2, w / 2 - 7, h / 2 - 10, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "bookshelf": {
      ctx.fillStyle = "#5b4632";
      ctx.fillRect(x + 1, y - 6, w - 2, h + 4);
      ctx.fillStyle = "#463525";
      ctx.fillRect(x + 1, y + h - 6, w - 2, 4);
      for (let shelf = 0; shelf < 2; shelf++) {
        const sy = y - 3 + shelf * 13;
        for (let i = 0; i < 7; i++) {
          ctx.fillStyle = BOOK_COLORS[Math.floor(hash2(o.x + i, o.y + shelf) * BOOK_COLORS.length)];
          ctx.fillRect(x + 4 + i * 8, sy, 6, 10);
        }
      }
      break;
    }
    case "plant": {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(x + 16, y + 27, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#a1633c";
      ctx.fillRect(x + 10, y + 18, 12, 10);
      ctx.fillStyle = "#7e4d2e";
      ctx.fillRect(x + 10, y + 18, 12, 3);
      ctx.fillStyle = "#2f9e5a";
      ctx.beginPath();
      ctx.arc(x + 16, y + 10, 8, 0, Math.PI * 2);
      ctx.arc(x + 10, y + 15, 5, 0, Math.PI * 2);
      ctx.arc(x + 22, y + 15, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#47c27c";
      ctx.beginPath();
      ctx.arc(x + 14, y + 9, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "tree": {
      // 본체(줄기 + 하단 잎) — 상단 캐노피는 drawObjectTop 에서.
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(x + TILE, y + h - 4, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6b4226";
      ctx.fillRect(x + TILE - 5, y + TILE, 10, TILE - 6);
      ctx.fillStyle = "#59371f";
      ctx.fillRect(x + TILE - 5, y + TILE, 3, TILE - 6);
      ctx.fillStyle = "#276b40";
      ctx.beginPath();
      ctx.arc(x + TILE, y + TILE - 2, 20, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "flowerbed": {
      ctx.fillStyle = "#2e6b34";
      roundRect(ctx, x + 3, y + 6, 26, 22, 6);
      ctx.fill();
      const cols = ["#f472b6", "#fbbf24", "#f87171", "#c084fc", "#fb923c"];
      for (let i = 0; i < 5; i++) {
        const fx = x + 7 + Math.floor(hash2(o.x * 5 + i, o.y) * 18);
        const fy = y + 9 + Math.floor(hash2(o.x, o.y * 5 + i) * 14);
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fef9c3";
        ctx.fillRect(fx - 1, fy - 1, 2, 2);
      }
      break;
    }
    case "fountain": {
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.fillStyle = "#8d93a3";
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2 - 2, h / 2 - 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#767c8c";
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2 - 7, h / 2 - 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3b82c4";
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2 - 10, h / 2 - 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // 물기둥 애니메이션
      const ph = 10 + Math.sin(t / 220) * 4;
      ctx.fillStyle = "#7cc6ff";
      ctx.fillRect(cx - 3, cy - ph - 8, 6, ph);
      ctx.beginPath();
      ctx.ellipse(cx, cy - ph - 9, 7 + Math.sin(t / 180) * 2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 4; i++) {
        const a = t / 300 + (i * Math.PI) / 2;
        ctx.fillRect(cx + Math.cos(a) * 14 - 1, cy + Math.sin(a) * 7 - 1, 3, 2);
      }
      ctx.fillStyle = "#9aa0b0";
      ctx.beginPath();
      ctx.ellipse(cx, cy - 6, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "campfire": {
      ctx.fillStyle = "#6b4226";
      ctx.save();
      ctx.translate(x + 16, y + 22);
      ctx.rotate(0.5);
      ctx.fillRect(-11, -3, 22, 5);
      ctx.rotate(-1);
      ctx.fillRect(-11, -3, 22, 5);
      ctx.restore();
      const f = Math.sin(t / 90) * 3;
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 2 - f);
      ctx.quadraticCurveTo(x + 25, y + 14, x + 16, y + 20);
      ctx.quadraticCurveTo(x + 7, y + 14, x + 16, y + 2 - f);
      ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 8 - f / 2);
      ctx.quadraticCurveTo(x + 21, y + 15, x + 16, y + 19);
      ctx.quadraticCurveTo(x + 11, y + 15, x + 16, y + 8 - f / 2);
      ctx.fill();
      break;
    }
    case "whiteboard": {
      ctx.fillStyle = "#6b7280";
      ctx.fillRect(x + 6, y + h - 8, 4, 8);
      ctx.fillRect(x + w - 10, y + h - 8, 4, 8);
      ctx.fillStyle = "#d1d5db";
      roundRect(ctx, x + 2, y - 12, w - 4, 26, 3);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 5, y - 9, w - 10, 20);
      ctx.strokeStyle = "#93b6f0";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 9, y - 4);
      ctx.lineTo(x + 24, y - 4);
      ctx.moveTo(x + 9, y + 1);
      ctx.lineTo(x + 30, y + 1);
      ctx.stroke();
      ctx.strokeStyle = "#f0a8a8";
      ctx.beginPath();
      ctx.arc(x + w - 16, y - 1, 5, 0, Math.PI * 1.4);
      ctx.stroke();
      break;
    }
    case "tv": {
      ctx.fillStyle = "#374151";
      ctx.fillRect(x + w / 2 - 4, y + h - 8, 8, 8);
      ctx.fillRect(x + w / 2 - 12, y + h - 3, 24, 3);
      ctx.fillStyle = "#111827";
      roundRect(ctx, x + 2, y - 12, w - 4, 26, 3);
      ctx.fill();
      const glow = 0.5 + Math.sin(t / 500) * 0.1;
      ctx.fillStyle = `rgba(76,130,190,${glow})`;
      ctx.fillRect(x + 5, y - 9, w - 10, 20);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - 4, y - 4);
      ctx.lineTo(x + w / 2 + 5, y + 1);
      ctx.lineTo(x + w / 2 - 4, y + 6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "bulletin": {
      ctx.fillStyle = "#6b4226";
      ctx.fillRect(x + 6, y + h - 8, 4, 8);
      ctx.fillRect(x + w - 10, y + h - 8, 4, 8);
      ctx.fillStyle = "#8a6444";
      roundRect(ctx, x + 2, y - 12, w - 4, 26, 3);
      ctx.fill();
      ctx.fillStyle = "#c8934e";
      ctx.fillRect(x + 5, y - 9, w - 10, 20);
      const notes = ["#fef08a", "#bae6fd", "#fbcfe8", "#bbf7d0"];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = notes[i];
        ctx.fillRect(x + 8 + i * 13, y - 6 + (i % 2) * 8, 9, 8);
      }
      break;
    }
    case "sign": {
      ctx.fillStyle = "#6b4226";
      ctx.fillRect(x + 14, y + 12, 4, 16);
      ctx.fillStyle = "#8a6444";
      roundRect(ctx, x + 3, y, 26, 14, 3);
      ctx.fill();
      ctx.fillStyle = "#d9b98a";
      ctx.fillRect(x + 6, y + 3, 20, 8);
      ctx.fillStyle = "#6b4226";
      ctx.fillRect(x + 8, y + 5, 12, 1.5);
      ctx.fillRect(x + 8, y + 8, 8, 1.5);
      break;
    }
    case "speaker": {
      ctx.fillStyle = "#1f2430";
      roundRect(ctx, x + 7, y + 2, 18, 26, 3);
      ctx.fill();
      ctx.fillStyle = "#374151";
      ctx.beginPath();
      ctx.arc(x + 16, y + 10, 5, 0, Math.PI * 2);
      ctx.arc(x + 16, y + 21, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6b7280";
      ctx.beginPath();
      ctx.arc(x + 16, y + 10, 2, 0, Math.PI * 2);
      ctx.arc(x + 16, y + 21, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "arcade": {
      ctx.fillStyle = "#312e81";
      roundRect(ctx, x + 3, y - 14, 26, 44, 3);
      ctx.fill();
      ctx.fillStyle = "#1e1b4b";
      ctx.fillRect(x + 3, y - 14, 26, 6);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(x + 6, y - 6, 20, 16);
      // 테트리스 블록 화면
      const cells = [
        [0, 0, "#22d3ee"], [1, 0, "#22d3ee"], [2, 0, "#22d3ee"],
        [1, 1, "#facc15"], [2, 1, "#facc15"], [0, 2, "#f472b6"],
      ] as const;
      for (const [cxx, cyy, colr] of cells) {
        ctx.fillStyle = colr;
        ctx.fillRect(x + 8 + cxx * 5, y - 4 + cyy * 5, 4, 4);
      }
      ctx.fillStyle = "#4338ca";
      ctx.fillRect(x + 4, y + 12, 24, 8);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(x + 10, y + 16, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(x + 20, y + 16, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "piano": {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 2, y + h - 4, w - 4, 4);
      ctx.fillStyle = "#111827";
      roundRect(ctx, x + 1, y - 4, w - 2, h + 2, 4);
      ctx.fill();
      ctx.fillStyle = "#f9fafb";
      ctx.fillRect(x + 4, y + 12, w - 8, 10);
      ctx.fillStyle = "#111827";
      for (let i = 0; i < 8; i++) ctx.fillRect(x + 8 + i * 7, y + 12, 3, 6);
      break;
    }
    case "coffee": {
      ctx.fillStyle = "#4b5563";
      roundRect(ctx, x + 6, y + 2, 20, 24, 3);
      ctx.fill();
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(x + 8, y + 5, 16, 7);
      ctx.fillStyle = "#f87171";
      ctx.fillRect(x + 10, y + 7, 4, 3);
      ctx.fillStyle = "#e5e7eb";
      ctx.fillRect(x + 13, y + 17, 7, 6);
      const steam = Math.sin(t / 300) * 2;
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 15);
      ctx.quadraticCurveTo(x + 14 + steam, y + 11, x + 16, y + 8);
      ctx.stroke();
      break;
    }
    case "vending": {
      ctx.fillStyle = "#b91c1c";
      roundRect(ctx, x + 4, y - 12, 24, 42, 3);
      ctx.fill();
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(x + 4, y + 22, 24, 8);
      ctx.fillStyle = "#e0f2fe";
      ctx.fillRect(x + 7, y - 8, 13, 24);
      const items = ["#fbbf24", "#34d399", "#60a5fa", "#f472b6"];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = items[i];
        ctx.fillRect(x + 9 + (i % 2) * 6, y - 5 + Math.floor(i / 2) * 9, 4, 6);
      }
      ctx.fillStyle = "#fca5a5";
      ctx.fillRect(x + 22, y - 6, 4, 12);
      break;
    }
    case "rug": {
      const color = o.props?.color ?? "#7c5cd6";
      ctx.fillStyle = darken(color, 0.25);
      roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 8);
      ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);
      break;
    }
    case "bench": {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(x + 3, y + h - 5, w - 6, 4);
      ctx.fillStyle = "#7e5a3a";
      roundRect(ctx, x + 2, y + 8, w - 4, 12, 3);
      ctx.fill();
      ctx.fillStyle = "#6b4a2e";
      ctx.fillRect(x + 4, y + 12, w - 8, 2);
      ctx.fillStyle = "#5c4027";
      ctx.fillRect(x + 5, y + 20, 4, 8);
      ctx.fillRect(x + w - 9, y + 20, 4, 8);
      break;
    }
    case "lamp": {
      ctx.fillStyle = "#374151";
      ctx.fillRect(x + 14, y - 10, 4, 36);
      ctx.fillStyle = "#4b5563";
      ctx.fillRect(x + 10, y + 24, 12, 4);
      ctx.fillStyle = "#fde68a";
      ctx.beginPath();
      ctx.arc(x + 16, y - 14, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#374151";
      ctx.fillRect(x + 10, y - 22, 12, 4);
      break;
    }
    case "door": {
      // 세련된 차원문 포탈 — 타원형 소용돌이 + 발광 림 + 룬 입자
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;
      const rx = TILE / 2 - 3;
      const ry = TILE / 2 - 1;
      ctx.save();
      // 바닥 발광
      ctx.fillStyle = `rgba(124,140,255,${0.1 + Math.sin(t / 500) * 0.03})`;
      ctx.beginPath();
      ctx.ellipse(cx, y + TILE - 3, rx + 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // 포탈 내부 그라데이션
      const grd = ctx.createRadialGradient(cx, cy, 1, cx, cy, rx);
      grd.addColorStop(0, "rgba(240,245,255,0.95)");
      grd.addColorStop(0.4, "rgba(124,140,255,0.85)");
      grd.addColorStop(0.8, "rgba(80,60,180,0.65)");
      grd.addColorStop(1, "rgba(30,20,70,0.2)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // 소용돌이 아크
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.4;
      for (let a = 0; a < 3; a++) {
        const off = (t / 320) + (a * Math.PI * 2) / 3;
        ctx.beginPath();
        for (let s = 0; s < 1; s += 0.08) {
          const ang = off + s * Math.PI * 2;
          const rr = s * rx * 0.9;
          const px = cx + Math.cos(ang) * rr;
          const py = cy + Math.sin(ang) * rr * (ry / rx);
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // 발광 림
      ctx.strokeStyle = `rgba(160,180,255,${0.7 + Math.sin(t / 300) * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      // 떠다니는 입자
      for (let p = 0; p < 3; p++) {
        const pa = t / 400 + p * 2.1;
        const pr = rx * (0.5 + 0.4 * Math.sin(t / 500 + p));
        ctx.fillStyle = "rgba(220,230,255,0.9)";
        ctx.beginPath();
        ctx.arc(cx + Math.cos(pa) * pr, cy + Math.sin(pa) * pr * 0.7, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case "cone": {
      // 라바콘 — 레이스 장애물
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(x + 16, y + 27, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 4);
      ctx.lineTo(x + 24, y + 26);
      ctx.lineTo(x + 8, y + 26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff7ed";
      ctx.fillRect(x + 11, y + 15, 10, 4);
      ctx.fillStyle = "#c2410c";
      ctx.fillRect(x + 6, y + 25, 20, 4);
      break;
    }
    case "tires": {
      // 타이어 스택 방벽
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.ellipse(x + 16, y + 28, 12, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const ty = y + 22 - i * 7;
        ctx.fillStyle = "#1f2430";
        ctx.beginPath();
        ctx.ellipse(x + 16, ty, 13, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#374151";
        ctx.beginPath();
        ctx.ellipse(x + 16, ty - 1.5, 13, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.beginPath();
        ctx.ellipse(x + 16, ty - 1.5, 6, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(x + 4, y + 12, 6, 3);
      ctx.fillRect(x + 22, y + 12, 6, 3);
      break;
    }
    case "podium": {
      // 시상대 1/2/3위
      const steps: [number, number, string, string][] = [
        [0, 14, "#9ca3af", "2"], // 왼쪽 2위
        [32, 6, "#facc15", "1"], // 가운데 1위
        [64, 20, "#b45309", "3"], // 오른쪽 3위
      ];
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 2, y + h - 5, w - 4, 5);
      for (const [ox, top, colr, num] of steps) {
        ctx.fillStyle = colr;
        ctx.fillRect(x + ox + 2, y + top, 28, h - top - 2);
        ctx.fillStyle = lighten(colr, 0.2);
        ctx.fillRect(x + ox + 2, y + top, 28, 5);
        ctx.fillStyle = "#111827";
        ctx.font = "bold 13px ui-sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(num, x + ox + 16, y + top + (h - top) / 2 + 2);
      }
      break;
    }
    case "flag": {
      // 체커 깃발 폴
      ctx.fillStyle = "#4b5563";
      ctx.fillRect(x + 14, y - 14, 3, 42);
      const wave = Math.sin(t / 250) * 2;
      for (let iy = 0; iy < 3; iy++) {
        for (let ix = 0; ix < 4; ix++) {
          ctx.fillStyle = (ix + iy) % 2 === 0 ? "#f9fafb" : "#111827";
          ctx.fillRect(x + 17 + ix * 4, y - 13 + iy * 4 + (ix > 1 ? wave : 0), 4, 4);
        }
      }
      break;
    }
    case "grandstand": {
      // 계단식 관중석
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 2, y + h - 5, w - 4, 5);
      const rows = ["#3b82c4", "#2f6da8", "#25588c"];
      for (let i = 0; i < 3; i++) {
        const ry = y + 4 + i * 16;
        ctx.fillStyle = rows[i];
        ctx.fillRect(x + 2, ry, w - 4, 14);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(x + 2, ry, w - 4, 3);
        // 관중 (색점)
        for (let s2 = 0; s2 < 5; s2++) {
          const px2 = x + 8 + s2 * 18 + ((i * 7) % 6);
          ctx.fillStyle = ["#fbbf24", "#f472b6", "#4ade80", "#f87171", "#a78bfa"][(s2 + i) % 5];
          ctx.beginPath();
          ctx.arc(px2, ry + 8, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#f1c27d";
          ctx.beginPath();
          ctx.arc(px2, ry + 3.5, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "exhibit": {
      // 명예의전당 전시대 — 작품 이미지 + 민트 발광 프레임.
      const cx = x + w / 2;
      // 바닥 그림자
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(cx, y + h - 4, w * 0.28, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // 스포트라이트 콘 (위에서 내리쬐는 빛)
      const glow = 0.10 + Math.sin(t / 600 + o.x) * 0.03;
      const grd = ctx.createLinearGradient(cx, y - 6, cx, y + h - 10);
      grd.addColorStop(0, `rgba(255,236,170,${glow + 0.12})`);
      grd.addColorStop(1, "rgba(255,236,170,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(cx - 6, y - 6);
      ctx.lineTo(cx + 6, y - 6);
      ctx.lineTo(cx + 26, y + h - 12);
      ctx.lineTo(cx - 26, y + h - 12);
      ctx.closePath();
      ctx.fill();
      // 석재 받침
      const pedTop = y + h - 26;
      ctx.fillStyle = "#c9a46d";
      roundRect(ctx, cx - 27, pedTop, 54, 22, 3);
      ctx.fill();
      ctx.fillStyle = "#ead7aa";
      ctx.fillRect(cx - 27, pedTop, 54, 5);
      ctx.fillStyle = "#8f6840";
      ctx.fillRect(cx - 27, pedTop + 18, 54, 4);
      // 민트 발광 액자
      const frSize = Math.min(w - 16, h - 42, 80);
      const frTop = y + 8;
      const frLeft = cx - frSize / 2;
      ctx.shadowColor = "rgba(125,255,212,0.65)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#dffdf2";
      roundRect(ctx, frLeft - 3, frTop - 3, frSize + 6, frSize + 6, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#42c99a";
      roundRect(ctx, frLeft, frTop, frSize, frSize, 4);
      ctx.fill();
      ctx.fillStyle = "#f8fff9";
      roundRect(ctx, frLeft + 2, frTop + 2, frSize - 4, 5, 2);
      ctx.fill();
      // 작품 이미지 영역
      const inX = frLeft + 5;
      const inY = frTop + 5;
      const inW = frSize - 10;
      const inH = frSize - 10;
      ctx.fillStyle = "#16312e";
      ctx.fillRect(inX, inY, inW, inH);
      const art = o.props?.image ? getImage(o.props.image) : null;
      const head = o.props?.head;
      const img = art ?? (head ? getImage(headImgUrl(head)) : null);
      if (img) {
        const iw = img.naturalWidth || img.width || 1;
        const ih = img.naturalHeight || img.height || 1;
        const scale = Math.min(inW / iw, inH / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.fillStyle = "#0b1f1d";
        ctx.fillRect(inX, inY, inW, inH);
        ctx.drawImage(img, inX + (inW - dw) / 2, inY + (inH - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = "#475569";
        ctx.font = "20px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🖼️", cx, inY + inH / 2);
        ctx.textBaseline = "alphabetic";
      }
      // 명판(이름)
      if (o.name) {
        ctx.font = "bold 9px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        const tw = ctx.measureText(o.name).width;
        ctx.fillStyle = "#4d3216";
        roundRect(ctx, cx - tw / 2 - 5, pedTop + 5, tw + 10, 12, 3);
        ctx.fill();
        ctx.fillStyle = "#fff2c2";
        ctx.fillText(o.name, cx, pedTop + 14);
      }
      break;
    }
    case "shopdisplay": {
      const item = o.props?.itemKey ? SHOP_MAP[o.props.itemKey] : undefined;
      const icon = o.props?.icon ?? item?.icon ?? "✦";
      const cx = x + w / 2;
      const floatY = Math.sin(t / 420 + o.x) * 3;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(cx, y + h - 5, 24, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      const base = item?.color && item.color !== "rainbow" ? item.color : "#22d3ee";
      const grd = ctx.createLinearGradient(x, y + 16, x, y + h);
      grd.addColorStop(0, lighten(base, 0.32));
      grd.addColorStop(1, darken(base, 0.35));
      ctx.fillStyle = grd;
      roundRect(ctx, x + 8, y + 26, w - 16, h - 30, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      ctx.strokeRect(x + 11.5, y + 29.5, w - 23, h - 37);
      ctx.shadowColor = item?.currency === "coin" ? "rgba(250,204,21,0.72)" : "rgba(34,211,238,0.72)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.arc(cx, y + 17 + floatY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = "24px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon, cx, y + 17 + floatY);
      if (item) {
        ctx.fillStyle = "rgba(18,24,32,0.88)";
        roundRect(ctx, x + 5, y + h - 17, w - 10, 13, 4);
        ctx.fill();
        ctx.fillStyle = "#e8fff7";
        ctx.font = "bold 8px ui-sans-serif";
        const price = `${item.currency === "heart" ? "H" : "C"} ${item.price}`;
        ctx.fillText(price, cx, y + h - 10);
      }
      ctx.textBaseline = "alphabetic";
      break;
    }
    case "balloon": {
      const cx = x + w / 2;
      const bob = Math.sin(t / 650 + o.x) * 4;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(cx, y + h - 5, 24, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      const grd = ctx.createRadialGradient(cx - 10, y + 8 + bob, 6, cx, y + 18 + bob, 34);
      grd.addColorStop(0, "#fff7ed");
      grd.addColorStop(0.55, "#f97316");
      grd.addColorStop(1, "#7c2d12");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(cx, y + 20 + bob, 25, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.38)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, y - 8 + bob);
      ctx.quadraticCurveTo(cx - 14, y + 18 + bob, cx - 7, y + 47 + bob);
      ctx.moveTo(cx, y - 8 + bob);
      ctx.quadraticCurveTo(cx + 14, y + 18 + bob, cx + 7, y + 47 + bob);
      ctx.stroke();
      ctx.strokeStyle = "#6b3f1d";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 13, y + 47 + bob);
      ctx.lineTo(cx - 9, y + 65);
      ctx.moveTo(cx + 13, y + 47 + bob);
      ctx.lineTo(cx + 9, y + 65);
      ctx.stroke();
      ctx.fillStyle = "#8b5a2b";
      roundRect(ctx, cx - 13, y + 63, 26, 16, 4);
      ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 9px ui-sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(o.props?.tour ? "TOUR" : "AIR", cx, y + 74);
      break;
    }
    case "portalhub": {
      // 워프 포탈 패드 — 회전하는 빛의 소용돌이
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      // 바닥 링
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(0, 8, 26, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const rr = 24 - i * 6;
        ctx.strokeStyle = `hsla(${(t / 12 + i * 40) % 360}, 90%, 65%, ${0.8 - i * 0.15})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 6, rr, rr * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 중앙 소용돌이
      ctx.rotate((t / 400) % (Math.PI * 2));
      const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
      grd.addColorStop(0, "rgba(255,255,255,0.95)");
      grd.addColorStop(0.5, "rgba(124,140,255,0.7)");
      grd.addColorStop(1, "rgba(59,7,100,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(0, 4, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "minigame": {
      // 미니게임 기기 — 알록달록 아케이드 캐비닛 2칸
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 2, y + h - 4, w - 4, 4);
      ctx.fillStyle = "#1e293b";
      roundRect(ctx, x + 2, y - 18, w - 4, h + 16, 5);
      ctx.fill();
      // 화면
      const hue = Math.floor(t / 20) % 360;
      ctx.fillStyle = `hsl(${hue},70%,55%)`;
      roundRect(ctx, x + 5, y - 14, w - 10, 14, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "10px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🎣🎵🌱", x + w / 2, y - 7);
      // 버튼
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(x + 10, y + 6, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(x + 18, y + 6, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.textBaseline = "alphabetic";
      break;
    }
    case "atm": {
      // ATM 기기 — 금색 캐비닛 + 화면 + 하트 로고
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x + 3, y + h - 4, w - 6, 4);
      ctx.fillStyle = "#0f766e";
      roundRect(ctx, x + 3, y, w - 6, h - 2, 5);
      ctx.fill();
      ctx.fillStyle = "#134e4a";
      roundRect(ctx, x + 3, y, w - 6, 6, 5);
      ctx.fill();
      // 화면
      ctx.fillStyle = "#a7f3d0";
      roundRect(ctx, x + 6, y + 8, w - 12, 12, 3);
      ctx.fill();
      ctx.font = "9px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("💗", x + w / 2, y + 14);
      // 키패드
      ctx.fillStyle = "#0b3b36";
      roundRect(ctx, x + 7, y + 24, w - 14, 20, 3);
      ctx.fill();
      ctx.fillStyle = "#5eead4";
      ctx.font = "bold 7px ui-sans-serif";
      ctx.fillText("ATM", x + w / 2, y + 34);
      ctx.textBaseline = "alphabetic";
      break;
    }
    case "npc": {
      // 안내/전시 NPC — 단정한 도슨트 스타일.
      const cx = x + w / 2;
      const footY = y + h;
      const suit = o.props?.color ?? "#334155";
      const head = o.props?.head;
      const headImg = head ? getImage(headImgUrl(head)) : null;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(cx, footY - 2, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // 재킷
      ctx.fillStyle = suit;
      roundRect(ctx, cx - 9, y + 25, 18, 23, 4);
      ctx.fill();
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.moveTo(cx - 6, y + 26);
      ctx.lineTo(cx, y + 39);
      ctx.lineTo(cx + 6, y + 26);
      ctx.closePath();
      ctx.fill();
      // 팔
      ctx.fillStyle = darken(suit, 0.12);
      ctx.fillRect(cx - 13, y + 29, 4, 15);
      ctx.fillRect(cx + 9, y + 29, 4, 15);
      ctx.fillStyle = "#f1c27d";
      ctx.fillRect(cx - 13, y + 43, 4, 4);
      ctx.fillRect(cx + 9, y + 43, 4, 4);
      if (headImg) {
        const s = 40;
        ctx.drawImage(headImg, cx - s / 2, y - 5, s, s);
      } else {
        // 얼굴
        ctx.fillStyle = "#f1c27d";
        ctx.beginPath();
        ctx.arc(cx, y + 14, 8, 0, Math.PI * 2);
        ctx.fill();
        // 단정한 머리
        ctx.fillStyle = "#2f2419";
        ctx.beginPath();
        ctx.arc(cx, y + 9, 8, Math.PI, Math.PI * 2);
        ctx.fill();
        // 눈
        ctx.fillStyle = "#111827";
        ctx.fillRect(cx - 3, y + 13, 1.6, 2);
        ctx.fillRect(cx + 1.5, y + 13, 1.6, 2);
      }
      // 정보 배지
      const by = y - 18 + Math.sin(t / 300) * 2;
      ctx.fillStyle = "rgba(216,255,241,0.95)";
      roundRect(ctx, cx + 6, by, 14, 13, 5);
      ctx.fill();
      ctx.fillStyle = "#0f766e";
      ctx.font = "bold 11px ui-sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(o.props?.text ? "i" : "!", cx + 13, by + 7);
      ctx.textBaseline = "alphabetic";
      break;
    }
    case "bed": {
      // 침대 — 프레임 + 매트리스 + 베개 + 이불
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 2, y + h - 4, w - 4, 4);
      ctx.fillStyle = "#6b4b2f"; // 원목 프레임
      roundRect(ctx, x + 1, y + 2, w - 2, h - 4, 5);
      ctx.fill();
      ctx.fillStyle = "#eef2ff"; // 매트리스/시트
      roundRect(ctx, x + 4, y + 5, w - 8, h - 10, 4);
      ctx.fill();
      // 이불 (아래쪽 2/3)
      ctx.fillStyle = o.props?.color ?? "#6c8cff";
      roundRect(ctx, x + 4, y + Math.floor(h * 0.42), w - 8, Math.floor(h * 0.5), 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x + 4, y + Math.floor(h * 0.42), w - 8, 3);
      // 베개 (상단)
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, x + 6, y + 7, w - 12, 10, 4);
      ctx.fill();
      break;
    }
    case "crate": {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 2, y + h - 4, w - 4, 4);
      ctx.fillStyle = "#a3722e";
      roundRect(ctx, x + 3, y + 4, w - 6, h - 7, 3);
      ctx.fill();
      ctx.fillStyle = "#c68a3e";
      ctx.fillRect(x + 3, y + 4, w - 6, 4);
      ctx.strokeStyle = "#6b4a1e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 5);
      ctx.lineTo(x + w - 4, y + h - 4);
      ctx.moveTo(x + w - 4, y + 5);
      ctx.lineTo(x + 4, y + h - 4);
      ctx.stroke();
      break;
    }
    case "barrel": {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(x + 16, y + h - 3, 10, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = o.props?.color ?? "#b91c1c";
      roundRect(ctx, x + 6, y + 3, 20, h - 6, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x + 6, y + 9, 20, 2);
      ctx.fillRect(x + 6, y + h - 12, 20, 2);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 6, y + 6, 20, 1.5);
      break;
    }
    case "sandbag": {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(x + 2, y + h - 3, w - 4, 3);
      for (let row = 0; row < 2; row++) {
        for (let cc = 0; cc < 3; cc++) {
          ctx.fillStyle = row % 2 === cc % 2 ? "#9a8c5a" : "#847a4e";
          roundRect(ctx, x + 2 + cc * 20 + (row ? 10 : 0), y + 6 + row * 10, 20, 11, 5);
          ctx.fill();
        }
      }
      break;
    }
    case "statue": {
      // 대형 석상 (사람보다 큰 조형물) — 받침 + 로브를 두른 인물
      const cx = x + w / 2;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(cx, y + h - 3, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // 받침
      ctx.fillStyle = "#9ca3af";
      roundRect(ctx, cx - 20, y + h - 16, 40, 14, 3);
      ctx.fill();
      ctx.fillStyle = "#b6bcc6";
      ctx.fillRect(cx - 20, y + h - 16, 40, 4);
      // 몸통(로브)
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.moveTo(cx - 14, y + h - 16);
      ctx.lineTo(cx + 14, y + h - 16);
      ctx.lineTo(cx + 9, y + 20);
      ctx.lineTo(cx - 9, y + 20);
      ctx.closePath();
      ctx.fill();
      // 머리
      ctx.fillStyle = "#dbe2ea";
      ctx.beginPath();
      ctx.arc(cx, y + 14, 10, 0, Math.PI * 2);
      ctx.fill();
      // 들어올린 팔
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx + 6, y + 26);
      ctx.lineTo(cx + 18, y + 8);
      ctx.stroke();
      // 이끼/음영
      ctx.fillStyle = "rgba(52,120,80,0.25)";
      ctx.fillRect(cx - 14, y + h - 22, 28, 5);
      break;
    }
    case "chess": {
      // 대형 체스말(나이트/킹 느낌)
      const cx = x + w / 2;
      const dark = o.props?.color === "dark";
      const body = dark ? "#1f2937" : "#e5e7eb";
      const shade = dark ? "#111827" : "#c7ccd6";
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(cx, y + h - 3, 20, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // 받침
      ctx.fillStyle = body;
      roundRect(ctx, cx - 16, y + h - 14, 32, 12, 4);
      ctx.fill();
      // 기둥
      ctx.fillStyle = body;
      roundRect(ctx, cx - 9, y + 20, 18, h - 32, 5);
      ctx.fill();
      ctx.fillStyle = shade;
      roundRect(ctx, cx - 9, y + 20, 6, h - 32, 5);
      ctx.fill();
      // 머리(왕관)
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, y + 18, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade;
      ctx.fillRect(cx - 2, y + 2, 4, 12); // 십자 세로
      ctx.fillRect(cx - 6, y + 5, 12, 4); // 십자 가로
      break;
    }
    case "window": {
      // 벽에 난 창문 — 프레임 + 유리 + 하늘/빛
      ctx.fillStyle = "#5b4632";
      roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 3);
      ctx.fill();
      const sky = ctx.createLinearGradient(x, y, x, y + h);
      sky.addColorStop(0, "#7dd3fc");
      sky.addColorStop(1, "#bae6fd");
      ctx.fillStyle = sky;
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      ctx.strokeStyle = "#5b4632";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + 6);
      ctx.lineTo(x + w / 2, y + h - 6);
      ctx.moveTo(x + 6, y + h / 2);
      ctx.lineTo(x + w - 6, y + h / 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 7);
      ctx.lineTo(x + 13, y + 7);
      ctx.lineTo(x + 7, y + 13);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "stairs": {
      // 계단 — 원근감 있는 3단
      for (let i = 0; i < 3; i++) {
        const sh = (h / 3) * i;
        ctx.fillStyle = i % 2 ? "#9aa0ab" : "#b4bac4";
        ctx.fillRect(x + 2 + i * 3, y + 4 + sh, w - 4 - i * 6, h / 3 - 1);
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(x + 2 + i * 3, y + 4 + sh, w - 4 - i * 6, 2);
      }
      break;
    }
    case "custom": {
      const url = o.props?.url;
      const img = url ? getImage(url) : null;
      if (img) {
        ctx.drawImage(img, x, y - (img.height / img.width) * w + h, w, (img.height / img.width) * w);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 4);
        ctx.fill();
        ctx.font = "14px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🖼️", x + w / 2, y + h / 2);
      }
      break;
    }
  }
}

// 캐릭터 위에 그려지는 전경(캐노피/글로우) 레이어.
export function drawObjectTop(
  ctx: CanvasRenderingContext2D,
  o: MapObject,
  t: number
) {
  const x = o.x * TILE;
  const y = o.y * TILE;
  if (o.type === "tree") {
    const cx = x + TILE;
    ctx.fillStyle = "#2e7d49";
    ctx.beginPath();
    ctx.arc(cx, y + 8, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3c9b5d";
    ctx.beginPath();
    ctx.arc(cx - 8, y + 2, 13, 0, Math.PI * 2);
    ctx.arc(cx + 9, y + 6, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4fb872";
    ctx.beginPath();
    ctx.arc(cx - 4, y - 2, 7, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.type === "lamp") {
    const glow = 0.12 + Math.sin(t / 600) * 0.04;
    ctx.fillStyle = `rgba(253,230,138,${glow})`;
    ctx.beginPath();
    ctx.arc(x + 16, y - 14, 26, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.type === "shopdisplay") {
    const glow = 0.12 + Math.sin(t / 500 + o.x) * 0.04;
    ctx.fillStyle = `rgba(125,255,212,${glow})`;
    ctx.beginPath();
    ctx.arc(x + TILE, y + 18, 34, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.type === "balloon") {
    const glow = 0.1 + Math.sin(t / 700 + o.x) * 0.04;
    ctx.fillStyle = `rgba(251,191,36,${glow})`;
    ctx.beginPath();
    ctx.arc(x + TILE, y + 26, 44, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.type === "campfire") {
    const glow = 0.1 + Math.sin(t / 200) * 0.04;
    ctx.fillStyle = `rgba(251,146,60,${glow})`;
    ctx.beginPath();
    ctx.arc(x + 16, y + 14, 34, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.type === "portalhub") {
    // 위로 솟는 빛 기둥
    const cx = x + TILE;
    const grd = ctx.createLinearGradient(cx, y - 40, cx, y + 20);
    grd.addColorStop(0, "rgba(124,140,255,0)");
    grd.addColorStop(1, `rgba(167,180,255,${0.14 + Math.sin(t / 300) * 0.05})`);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(cx - 14, y + 16);
    ctx.lineTo(cx + 14, y + 16);
    ctx.lineTo(cx + 8, y - 40);
    ctx.lineTo(cx - 8, y - 40);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------- 캐릭터 (픽셀아트) ----------

// 고카트 (발 좌표 기준) — 그랑프리용, 플레이어 상의 색으로 도색.
function drawKart(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  dir: Direction,
  t: number,
  color: string
) {
  const spin = (t / 50) % (Math.PI * 2);
  ctx.save();
  ctx.translate(fx, fy);
  const sideways = dir === "left" || dir === "right";
  if (dir === "left") ctx.scale(-1, 1);

  const wheel = (wx: number, wy: number, r: number) => {
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(wx, wy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx + Math.cos(spin) * (r - 2), wy + Math.sin(spin) * (r - 2));
    ctx.lineTo(wx - Math.cos(spin) * (r - 2), wy - Math.sin(spin) * (r - 2));
    ctx.stroke();
  };

  if (sideways) {
    // 옆모습: 낮고 긴 카트 + 앞뒤 바퀴
    ctx.fillStyle = darken(color, 0.15);
    roundRect(ctx, -18, -13, 36, 10, 4); // 차체
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -18, -13, 36, 5, 4);
    ctx.fill();
    ctx.fillStyle = "#374151";
    ctx.fillRect(-4, -20, 3, 9); // 핸들 축
    ctx.fillRect(-8, -21, 10, 3); // 핸들
    ctx.fillStyle = darken(color, 0.35);
    ctx.fillRect(12, -18, 6, 6); // 앞 스포일러
    ctx.fillRect(-20, -16, 5, 8); // 뒤 스포일러
    wheel(-12, -2, 7);
    wheel(12, -2, 7);
    // 번호 원
    ctx.fillStyle = "#f9fafb";
    ctx.beginPath();
    ctx.arc(2, -9, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 정면/후면: 넓은 카트 + 양쪽 바퀴
    wheel(-13, -3, 6);
    wheel(13, -3, 6);
    ctx.fillStyle = darken(color, 0.15);
    roundRect(ctx, -11, -16, 22, 15, 5);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -11, -16, 22, 7, 5);
    ctx.fill();
    ctx.fillStyle = "#374151";
    ctx.fillRect(-7, -19, 14, 4); // 범퍼/핸들
    ctx.fillStyle = "#f9fafb";
    ctx.beginPath();
    ctx.arc(0, -8, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 모터보트 (발 좌표 기준) — 바다 요트 서킷용. 플레이어 상의 색으로 도색.
function drawBoat(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  dir: Direction,
  t: number,
  color: string,
  moving: boolean
) {
  ctx.save();
  ctx.translate(fx, fy - 2);
  const bobY = Math.sin(t / 260) * 1.5;
  ctx.translate(0, bobY);
  const sideways = dir === "left" || dir === "right";
  if (dir === "left") ctx.scale(-1, 1);

  // 물 튀김(항적) — 뒤쪽
  if (moving) {
    ctx.fillStyle = "rgba(224,242,254,0.7)";
    for (let i = 0; i < 3; i++) {
      const off = ((t / 60 + i * 30) % 90) / 90;
      const wx = (sideways ? -18 : 0) - (sideways ? off * 10 : 0);
      const wy = (sideways ? 2 : 14) + (sideways ? 0 : off * 8);
      ctx.beginPath();
      ctx.arc(wx, wy, 3 - off * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (sideways) {
    // 옆모습 선체
    ctx.fillStyle = darken(color, 0.2);
    ctx.beginPath();
    ctx.moveTo(-18, -2);
    ctx.lineTo(16, -2);
    ctx.lineTo(20, 4);
    ctx.lineTo(-14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -16, -8, 24, 7, 3);
    ctx.fill();
    ctx.fillStyle = "#e0f2fe";
    ctx.fillRect(-6, -13, 10, 6); // 조종석 캐빈
    ctx.fillStyle = "#1e3a5f";
    ctx.fillRect(14, -10, 2, 9); // 뒷선
  } else {
    // 정면/후면 선체
    ctx.fillStyle = darken(color, 0.2);
    ctx.beginPath();
    ctx.moveTo(-13, -2);
    ctx.lineTo(13, -2);
    ctx.lineTo(10, 6);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -12, -9, 24, 8, 4);
    ctx.fill();
    ctx.fillStyle = "#e0f2fe";
    roundRect(ctx, -7, -14, 14, 7, 3);
    ctx.fill();
  }
  ctx.restore();
}

// 프로펠러 비행기 (발 좌표 기준) — 하늘 서킷용. 플레이어 상의 색으로 도색.
function drawPlane(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  dir: Direction,
  t: number,
  color: string
) {
  ctx.save();
  ctx.translate(fx, fy - 4);
  const bobY = Math.sin(t / 220) * 2;
  ctx.translate(0, bobY);
  const spin = (t / 22) % (Math.PI * 2);
  const sideways = dir === "left" || dir === "right";
  if (dir === "left") ctx.scale(-1, 1);

  if (sideways) {
    // 날개(뒤로)
    ctx.fillStyle = darken(color, 0.28);
    ctx.beginPath();
    ctx.moveTo(-6, -1);
    ctx.lineTo(-20, 8);
    ctx.lineTo(-2, 3);
    ctx.closePath();
    ctx.fill();
    // 동체
    ctx.fillStyle = color;
    roundRect(ctx, -18, -6, 34, 11, 6);
    ctx.fill();
    // 캐노피
    ctx.fillStyle = "#bae6fd";
    roundRect(ctx, -2, -9, 11, 6, 3);
    ctx.fill();
    // 꼬리날개
    ctx.fillStyle = darken(color, 0.28);
    ctx.beginPath();
    ctx.moveTo(-18, -5);
    ctx.lineTo(-24, -12);
    ctx.lineTo(-16, -4);
    ctx.closePath();
    ctx.fill();
    // 프로펠러(앞)
    ctx.strokeStyle = "rgba(226,232,240,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, -6 + Math.cos(spin) * 8);
    ctx.lineTo(16, 4 - Math.cos(spin) * 8);
    ctx.stroke();
  } else {
    // 정면/후면: 양 날개
    ctx.fillStyle = darken(color, 0.28);
    roundRect(ctx, -20, -2, 40, 6, 3);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -8, -12, 16, 18, 7);
    ctx.fill();
    ctx.fillStyle = "#bae6fd";
    roundRect(ctx, -5, -10, 10, 7, 3);
    ctx.fill();
    // 프로펠러 회전
    ctx.strokeStyle = "rgba(226,232,240,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-Math.cos(spin) * 12, -12);
    ctx.lineTo(Math.cos(spin) * 12, -12);
    ctx.stroke();
  }
  ctx.restore();
}

// 오토바이 (발 좌표 기준)
function drawBike(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  dir: Direction,
  t: number
) {
  const spin = (t / 60) % (Math.PI * 2);
  ctx.save();
  ctx.translate(fx, fy);
  const sideways = dir === "left" || dir === "right";
  if (dir === "left") ctx.scale(-1, 1);

  const wheel = (wx: number) => {
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(wx, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx + Math.cos(spin) * 6, Math.sin(spin) * 6);
    ctx.lineTo(wx - Math.cos(spin) * 6, -Math.sin(spin) * 6);
    ctx.stroke();
  };

  if (sideways) {
    wheel(-13);
    wheel(13);
    ctx.fillStyle = "#ef4444";
    roundRect(ctx, -16, -12, 32, 9, 4);
    ctx.fill();
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(11, -22, 3, 12);
  } else {
    wheel(0);
    ctx.fillStyle = "#ef4444";
    roundRect(ctx, -9, -16, 18, 14, 5);
    ctx.fill();
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(-11, -16, 4, 4);
    ctx.fillRect(7, -16, 4, 4);
  }
  ctx.restore();
}

export interface CharacterExtras {
  status?: UserStatus;
  hand?: boolean;
  dancing?: boolean;
  sitting?: boolean;
  vehicle?: "bike" | "kart" | "boat" | "plane";
  ghost?: boolean; // 고스트 모드 — 반투명 렌더
  cosmetics?: PlayerCosmetics; // 날개/펫/탈것 등
  mounted?: boolean; // 상점 탈것 탑승
  lying?: boolean; // 침대에 누움
}

// ---------- 코스메틱(날개/펫/탈것) ----------

function drawWings(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, t: number, key: string) {
  const flap = Math.sin(t / 220) * 0.12;
  const angel = key === "wings-angel";
  const phoenix = key.includes("phoenix");
  const top = cy - 36;
  ctx.save();
  ctx.translate(cx, top);
  ctx.globalAlpha = 0.96;
  for (const sgn of [-1, 1]) {
    ctx.save();
    ctx.scale(sgn, 1);
    ctx.rotate(-0.12 - flap);
    if (angel) {
      const grd = ctx.createLinearGradient(0, -46, 74, 30);
      grd.addColorStop(0, "#ffffff");
      grd.addColorStop(0.55, color);
      grd.addColorStop(1, "#cbd5e1");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(2, -4);
      ctx.bezierCurveTo(24, -48, 62, -48, 78, -10);
      ctx.bezierCurveTo(62, -12, 50, 2, 40, 20);
      ctx.bezierCurveTo(28, 12, 18, 14, 7, 26);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,0.42)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      const featherYs = [-18, -9, 0, 9, 17];
      featherYs.forEach((fy, i) => {
        const len = 48 - i * 6;
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.82)" : "rgba(226,232,240,0.82)";
        ctx.beginPath();
        ctx.moveTo(9, fy);
        ctx.quadraticCurveTo(24 + i * 3, fy + 4, len, fy + 15 + i * 2);
        ctx.quadraticCurveTo(25 + i * 2, fy + 15, 9, fy + 6);
        ctx.closePath();
        ctx.fill();
      });
    } else if (phoenix) {
      const grd = ctx.createLinearGradient(0, -44, 72, 30);
      grd.addColorStop(0, "#fef3c7");
      grd.addColorStop(0.38, color);
      grd.addColorStop(1, "#991b1b");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(28, -42);
      ctx.lineTo(34, -10);
      ctx.lineTo(62, -30);
      ctx.lineTo(48, 4);
      ctx.lineTo(72, 8);
      ctx.lineTo(38, 28);
      ctx.lineTo(12, 22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(254,202,202,0.56)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else {
      const grd = ctx.createLinearGradient(0, -42, 62, 30);
      grd.addColorStop(0, lighten(color, 0.28));
      grd.addColorStop(1, darken(color, 0.18));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.bezierCurveTo(20, -42, 60, -36, 66, -2);
      ctx.bezierCurveTo(50, 3, 40, 18, 20, 22);
      ctx.quadraticCurveTo(8, 15, 0, 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.58;
      ctx.beginPath();
      ctx.moveTo(7, 3);
      ctx.bezierCurveTo(22, -8, 48, -4, 58, 20);
      ctx.bezierCurveTo(38, 26, 19, 22, 7, 9);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.96;
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(8, -1);
      ctx.quadraticCurveTo(28, -10, 58, -4);
      ctx.moveTo(9, 7);
      ctx.quadraticCurveTo(28, 15, 54, 18);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = "rgba(15,23,42,0.38)";
  roundRect(ctx, -5, -7, 10, 22, 5);
  ctx.fill();
  ctx.restore();
}

function drawPet(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, t: number) {
  // 캐릭터 옆에서 따라다니는 작은 고양이
  const px = cx - 20;
  const py = cy - 2 + Math.sin(t / 300) * 1.5;
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(px, cy + 1, 6, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  // 몸통
  roundRect(ctx, px - 5, py - 8, 10, 9, 3);
  ctx.fill();
  // 머리
  ctx.beginPath();
  ctx.arc(px, py - 10, 5, 0, Math.PI * 2);
  ctx.fill();
  // 귀
  ctx.beginPath();
  ctx.moveTo(px - 5, py - 13);
  ctx.lineTo(px - 2, py - 16);
  ctx.lineTo(px - 1, py - 12);
  ctx.moveTo(px + 5, py - 13);
  ctx.lineTo(px + 2, py - 16);
  ctx.lineTo(px + 1, py - 12);
  ctx.fill();
  // 꼬리
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(px + 5, py - 2);
  ctx.quadraticCurveTo(px + 12, py - 4, px + 10, py - 10 + Math.sin(t / 200) * 2);
  ctx.stroke();
  // 눈
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(px - 2, py - 10, 1, 0, Math.PI * 2);
  ctx.arc(px + 2, py - 10, 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawMount(ctx: CanvasRenderingContext2D, cx: number, cy: number, key: string, color: string, t: number, dir: Direction, seats = 1) {
  const side = dir === "left" || dir === "right";
  const flip = dir === "left" ? -1 : 1;
  const bob = Math.sin(t / 320 + cx) * 1.8;
  const large = seats > 1 || key === "mount-carpet" || key.includes("dragon") || key.includes("phoenix");
  const w = large ? 84 : 62;
  const h = large ? 32 : 26;
  const scale =
    key === "mount-balloon"
      ? 1.34
      : key === "mount-carpet"
        ? 1.52
        : key === "mount-sportscar" || key.includes("cruiser")
          ? 1.42
          : large
            ? 1.46
            : 1.32;
  ctx.save();
  ctx.translate(cx, cy + bob);
  if (side) ctx.scale(flip * scale, scale);
  else ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 4, w * 0.48, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  if (key === "mount-balloon") {
    const grd = ctx.createRadialGradient(-10, -86, 8, 4, -68, 46);
    grd.addColorStop(0, lighten(color, 0.36));
    grd.addColorStop(0.46, color);
    grd.addColorStop(1, darken(color, 0.28));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, -68, 36, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(254,243,199,0.85)";
    ctx.lineWidth = 2;
    for (const x of [-18, 0, 18]) {
      ctx.beginPath();
      ctx.moveTo(x * 0.5, -108);
      ctx.quadraticCurveTo(x, -68, x * 0.45, -28);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(-11, -82, 10, 24, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-23, -30);
    ctx.lineTo(-15, -13);
    ctx.moveTo(23, -30);
    ctx.lineTo(15, -13);
    ctx.stroke();
    ctx.fillStyle = "#92400e";
    roundRect(ctx, -22, -15, 44, 24, 6);
    ctx.fill();
    ctx.fillStyle = "#f59e0b";
    roundRect(ctx, -18, -18, 36, 8, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(254,243,199,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.lineTo(14, -8);
    ctx.stroke();
  } else if (key === "mount-sportscar" || key.includes("cruiser")) {
    const body = color;
    const glow = key === "mount-sportscar" ? "#60a5fa" : "#67e8f9";
    ctx.fillStyle = "rgba(96,165,250,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, -5, w * 0.48, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darken(body, 0.2);
    roundRect(ctx, -w / 2, -18, w, 20, 8);
    ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, -w / 2 + 4, -22, w - 8, 15, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(219,234,254,0.9)";
    roundRect(ctx, -9, -28, 24, 10, 5);
    ctx.fill();
    ctx.fillStyle = glow;
    ctx.fillRect(w / 2 - 8, -13, 7, 3);
    ctx.fillStyle = "#fef3c7";
    ctx.fillRect(-w / 2 + 2, -13, 7, 3);
    for (const wx of [-w * 0.31, w * 0.31]) {
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(wx, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else if (key === "mount-carpet") {
    const wave = Math.sin(t / 180) * 4;
    const grd = ctx.createLinearGradient(-w / 2, -22, w / 2, 0);
    grd.addColorStop(0, darken(color, 0.25));
    grd.addColorStop(0.5, lighten(color, 0.22));
    grd.addColorStop(1, darken(color, 0.15));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -18);
    ctx.quadraticCurveTo(-w / 4, -28 - wave, 0, -18);
    ctx.quadraticCurveTo(w / 4, -8 + wave, w / 2, -18);
    ctx.lineTo(w / 2 - 6, 4);
    ctx.quadraticCurveTo(w / 4, 12 + wave, 0, 4);
    ctx.quadraticCurveTo(-w / 4, -4 - wave, -w / 2 + 6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3;
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i % 2 ? "#fef3c7" : "#67e8f9";
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 10 + i * 14, -17);
      ctx.lineTo(-w / 2 + 4 + i * 14, 5);
      ctx.stroke();
    }
  } else if (key === "mount-phoenix") {
    const wing = Math.sin(t / 170) * 6;
    const grd = ctx.createLinearGradient(-48, -30, 52, 6);
    grd.addColorStop(0, "#fef3c7");
    grd.addColorStop(0.45, color);
    grd.addColorStop(1, "#b91c1c");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(4, -13, 38, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-2, -18);
      ctx.lineTo(sgn * 52, -36 - wing);
      ctx.lineTo(sgn * 34, -10);
      ctx.lineTo(sgn * 60, -2 + wing);
      ctx.lineTo(sgn * 18, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(-32, -22, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(-37, -24, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.moveTo(-45, -23);
    ctx.lineTo(-58, -18);
    ctx.lineTo(-45, -14);
    ctx.closePath();
    ctx.fill();
  } else if (key === "mount-robot") {
    ctx.fillStyle = "#1f2937";
    roundRect(ctx, -30, -20, 60, 22, 8);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -22, -28, 44, 16, 6);
    ctx.fill();
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(-12, -23, 8, 4);
    ctx.fillRect(5, -23, 8, 4);
    ctx.fillStyle = "rgba(34,211,238,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 8, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const animal = key === "mount-bear" || key === "mount-wolf" || key === "mount-tiger" || key === "mount-rabbit" || key === "mount-rudolph";
    if (animal) {
      const bodyW = key === "mount-bear" ? 58 : key === "mount-rabbit" ? 46 : 54;
      const bodyH = key === "mount-bear" ? 26 : 22;
      ctx.fillStyle = darken(color, 0.12);
      ctx.beginPath();
      ctx.ellipse(0, -12, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(-bodyW * 0.32, -18, 15, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = darken(color, 0.35);
      for (const lx of [-16, -2, 13, 25]) {
        roundRect(ctx, lx, -5, 6, 11, 3);
        ctx.fill();
      }
      ctx.fillStyle = color;
      if (key === "mount-rabbit") {
        roundRect(ctx, -34, -44, 7, 24, 4);
        ctx.fill();
        roundRect(ctx, -24, -43, 7, 23, 4);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(-43, -31);
        ctx.lineTo(-33, -43);
        ctx.lineTo(-29, -27);
        ctx.moveTo(-23, -30);
        ctx.lineTo(-13, -42);
        ctx.lineTo(-10, -26);
        ctx.fill();
      }
      if (key === "mount-rudolph") {
        ctx.strokeStyle = "#92400e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-36, -34);
        ctx.lineTo(-46, -48);
        ctx.moveTo(-28, -35);
        ctx.lineTo(-20, -49);
        ctx.stroke();
      }
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.arc(-37, -19, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grd = ctx.createLinearGradient(-w / 2, -24, w / 2, 4);
      grd.addColorStop(0, lighten(color, 0.2));
      grd.addColorStop(1, darken(color, 0.32));
      ctx.fillStyle = grd;
      roundRect(ctx, -w / 2, -20, w, h, 12);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      roundRect(ctx, -w / 2 + 8, -24, w - 16, 7, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(103,232,249,0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.43, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

const OUTLINE = "rgba(18,22,34,0.55)";

// 메인 캐릭터 렌더. (cx, cy) = 발(바닥 접점) 좌표. 픽셀 유닛 2px.
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  app: CharacterAppearance,
  dir: Direction,
  moving: boolean,
  onBike: boolean,
  t: number,
  name: string,
  isSelf: boolean,
  extras?: CharacterExtras
) {
  const u = 2; // 픽셀 유닛
  const lying = !!extras?.lying && !onBike;
  const sitting = (!!extras?.sitting || lying) && !onBike;
  const dancing = !!extras?.dancing && !moving && !onBike && !sitting;
  const step = moving && !sitting ? Math.floor(t / 130) % 4 : 0; // 걷기 프레임 0..3
  const danceBeat = Math.floor(t / 200) % 2; // 춤 비트
  const bob = sitting
    ? 0
    : moving
      ? step % 2 === 1
        ? -1
        : 0
      : dancing
        ? danceBeat === 0
          ? -1.5
          : 0
        : Math.sin(t / 500) > 0.6
          ? -0.5
          : 0;
  // "ghost" 는 삭제된 레거시 코스튬 값 — 로봇으로 정규화.
  const special = (app.special as string) === "ghost" ? "robot" : app.special;
  const robot = special === "robot";

  // 그림자
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, onBike ? 18 : 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 고스트 모드 — 캐릭터 몸체를 반투명하게 (이름표는 이후 100%로 복원)
  const ghost = !!extras?.ghost;
  if (ghost) ctx.globalAlpha = 0.4;

  // 상점 탈것(마운트) — 캐릭터 아래
  const cos = extras?.cosmetics;
  if (extras?.mounted && cos?.mount) {
    const mi = SHOP_MAP[cos.mount];
    if (mi) drawMount(ctx, cx, cy - 2, cos.mount, mi.color ?? "#94a3b8", t, dir, mi.seats ?? 1);
  }
  // 날개 — 몸통 뒤
  if (cos?.wings && !onBike) {
    const wi = SHOP_MAP[cos.wings];
    if (wi) drawWings(ctx, cx, cy, wi.color ?? "#f8fafc", t, cos.wings);
  }

  if (onBike) {
    const kartColor = cos?.kart ? (SHOP_MAP[cos.kart]?.color ?? app.color) : app.color;
    if (extras?.vehicle === "boat") drawBoat(ctx, cx, cy - 2, dir, t, kartColor, moving);
    else if (extras?.vehicle === "plane") drawPlane(ctx, cx, cy - 2, dir, t, kartColor);
    else if (extras?.vehicle === "kart") drawKart(ctx, cx, cy - 2, dir, moving ? t : 0, kartColor);
    else drawBike(ctx, cx, cy - 2, dir, moving ? t : 0);
  }

  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy + bob * u - (onBike ? 8 : 0)));
  if (lying) {
    // 침대에 누운 자세 — 몸 전체를 눕힘
    ctx.rotate(-1.35);
    ctx.translate(6, 4);
  }
  if (dancing && danceBeat === 1) {
    ctx.rotate(0.06); // 좌우 리듬
  } else if (dancing) {
    ctx.rotate(-0.06);
  }

  const skin = robot ? "#c2cad8" : app.skin;
  const top = robot ? "#8e99ac" : app.color;
  const pants = robot ? "#5b6472" : app.pants ?? "#1f2937";
  const shoesC = robot ? "#3f4753" : app.shoes ?? "#292524";
  const hairC = app.hairColor ?? "#4b3621";
  const side = dir === "left" ? -1 : dir === "right" ? 1 : 0;
  // 앉으면 다리가 접히므로 몸 전체가 3유닛 내려온다
  const bodyTop = (sitting ? -11 : -14) * u;
  const flap = moving || dancing ? Math.sin(t / 120) * 2 : Math.sin(t / 600) * 1;

  // ----- 망토 (몸 뒤) — 방향별로 올바른 자세 -----
  if (special === "cape" && !robot) {
    ctx.fillStyle = "#dc2626";
    if (dir === "left" || dir === "right") {
      // 옆모습: 등 뒤(진행 반대 방향)로 흘러내리는 망토
      const back = -side; // 등 쪽 방향
      ctx.beginPath();
      ctx.moveTo(back * 1.5 * u, bodyTop + 0.5 * u); // 목 뒤
      ctx.lineTo(back * 5 * u, bodyTop + u); // 어깨 끝
      ctx.lineTo(back * (7 * u + Math.abs(flap)), 0.5 * u); // 밑단 바깥(펄럭)
      ctx.lineTo(back * 2 * u, 0.5 * u); // 밑단 안쪽
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#991b1b";
      ctx.fillRect(back * 1.5 * u - (back < 0 ? 3.5 * u : 0), bodyTop + 0.5 * u, 3.5 * u, 1.2 * u);
    } else if (dir === "down") {
      // 정면: 어깨 뒤로 살짝 보이는 자락
      ctx.beginPath();
      ctx.moveTo(-5 * u, bodyTop + u);
      ctx.lineTo(5 * u, bodyTop + u);
      ctx.lineTo(6.5 * u + flap, 0.5 * u);
      ctx.lineTo(-6.5 * u - flap, 0.5 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#991b1b";
      ctx.fillRect(-5 * u, bodyTop + u, 10 * u, 1.2 * u);
    }
    // dir === "up"(뒷모습)은 몸을 그린 뒤에 등 전체를 덮도록 아래에서 그린다.
  }

  // ----- 다리 + 신발 (앉으면 접힌 짧은 다리) -----
  {
    const legLift = [0, 2, 0, 2];
    const lA = sitting ? 0 : moving ? legLift[step] : dancing ? danceBeat * 2 : 0;
    const lB = sitting ? 0 : moving ? legLift[(step + 2) % 4] : dancing ? (1 - danceBeat) * 2 : 0;
    const legH = sitting ? 3 * u : 6 * u;
    ctx.fillStyle = pants;
    if (dir === "left" || dir === "right") {
      ctx.fillRect(-3 * u + side * u, -legH - lA, 3 * u, legH);
      ctx.fillRect(0 * u + side * u, -legH - lB, 3 * u, legH);
      if (sitting) {
        // 옆모습: 허벅지가 앞으로 나온다
        ctx.fillRect(side * 2 * u, -legH, 3 * u, 1.6 * u);
      }
    } else {
      ctx.fillRect(-4 * u, -legH - lA, 3.5 * u, legH + lA);
      ctx.fillRect(0.5 * u, -legH - lB, 3.5 * u, legH + lB);
    }
    ctx.fillStyle = shoesC;
    if (dir === "left" || dir === "right") {
      ctx.fillRect(-3 * u + side * u, -1.5 * u - lA, 3.5 * u, 1.5 * u);
      ctx.fillRect(0 * u + side * u, -1.5 * u - lB, 3.5 * u, 1.5 * u);
    } else {
      ctx.fillRect(-4 * u, -1.5 * u - lA, 3.5 * u, 1.5 * u);
      ctx.fillRect(0.5 * u, -1.5 * u - lB, 3.5 * u, 1.5 * u);
    }
  }

  // ----- 몸통(상의) — 스타일별 (로봇은 금속 몸통) -----
  drawTop(ctx, u, bodyTop, top, robot ? "tshirt" : app.topStyle ?? "tshirt", dir, robot);
  if (robot && dir !== "up") {
    // 가슴 패널 + 상태등
    ctx.fillStyle = "#4b5563";
    roundRect(ctx, -2.5 * u, bodyTop + 2 * u, 5 * u, 3.5 * u, 2);
    ctx.fill();
    const blink = Math.floor(t / 600) % 2 === 0;
    ctx.fillStyle = blink ? "#34d399" : "#166e51";
    ctx.fillRect(-1.5 * u, bodyTop + 2.8 * u, 1.2 * u, 1.2 * u);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(0.5 * u, bodyTop + 2.8 * u, 1.2 * u, 1.2 * u);
  }

  // ----- 팔 (스윙/춤/손들기) -----
  const armSwing = moving ? (step === 1 ? 2 : step === 3 ? -2 : 0) : 0;
  const armC = app.topStyle === "suit" && !robot ? darken("#2b3040", 0.05) : darken(top, 0.1);
  ctx.fillStyle = armC;
  const handRaised = extras?.hand;
  if (dancing && dir !== "left" && dir !== "right") {
    // 춤: 양팔 번갈아 번쩍
    const upL = danceBeat === 0;
    if (upL) {
      ctx.fillRect(-7 * u, bodyTop - 5 * u, 2.5 * u, 7 * u);
      ctx.fillRect(4.5 * u, bodyTop + u, 2.5 * u, 6 * u);
    } else {
      ctx.fillRect(-7 * u, bodyTop + u, 2.5 * u, 6 * u);
      ctx.fillRect(4.5 * u, bodyTop - 5 * u, 2.5 * u, 7 * u);
    }
    ctx.fillStyle = skin;
    if (upL) ctx.fillRect(-7 * u, bodyTop - 7 * u, 2.5 * u, 2.5 * u);
    else ctx.fillRect(4.5 * u, bodyTop - 7 * u, 2.5 * u, 2.5 * u);
  } else if (dir === "left" || dir === "right") {
    ctx.fillRect(side * 4 * u - u, bodyTop + 1.5 * u + armSwing, 2.5 * u, 6 * u);
    ctx.fillStyle = skin;
    ctx.fillRect(side * 4 * u - u, bodyTop + 7 * u + armSwing, 2.5 * u, 2 * u);
  } else {
    ctx.fillRect(-7 * u, bodyTop + u + armSwing, 2.5 * u, 6 * u);
    if (handRaised) {
      ctx.fillRect(4.5 * u, bodyTop - 6 * u, 2.5 * u, 7 * u);
      ctx.fillStyle = skin;
      ctx.fillRect(4.5 * u, bodyTop - 8 * u, 2.5 * u, 2.5 * u);
      ctx.fillRect(-7 * u, bodyTop + 6.5 * u + armSwing, 2.5 * u, 2 * u);
    } else {
      ctx.fillRect(4.5 * u, bodyTop + u - armSwing, 2.5 * u, 6 * u);
      ctx.fillStyle = skin;
      ctx.fillRect(-7 * u, bodyTop + 6.5 * u + armSwing, 2.5 * u, 2 * u);
      ctx.fillRect(4.5 * u, bodyTop + 6.5 * u - armSwing, 2.5 * u, 2 * u);
    }
  }

  // ----- 뒷모습 망토: 등 전체를 덮는다 (몸/팔 위, 머리 아래) -----
  if (special === "cape" && !robot && dir === "up") {
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.moveTo(-5 * u, bodyTop - 0.5 * u);
    ctx.lineTo(5 * u, bodyTop - 0.5 * u);
    ctx.lineTo(6.5 * u + flap, 1 * u);
    ctx.lineTo(-6.5 * u - flap, 1 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b91c1c";
    ctx.fillRect(-5 * u, bodyTop - 0.5 * u, 10 * u, 1.4 * u); // 목깃
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-5 * u, bodyTop - 0.5 * u);
    ctx.lineTo(-6.5 * u - flap, 1 * u);
    ctx.moveTo(5 * u, bodyTop - 0.5 * u);
    ctx.lineTo(6.5 * u + flap, 1 * u);
    ctx.stroke();
  }

  // ----- 머리 -----
  const headTop = bodyTop - 9.5 * u;

  // 특별 헤어 스타일: 얼굴+헤어 일체형 이미지가 픽셀 머리를 통째로 대체.
  // (이미지 로딩 전에는 기존 픽셀 머리로 폴백)
  const headImg =
    !robot && app.headImg && app.headImg !== "none"
      ? getImage(headImgUrl(app.headImg))
      : null;

  if (headImg) {
    // 이미지 얼굴 중심(약 540,640/1080)이 픽셀 머리 중심에 오도록 앵커링
    const S = 72;
    ctx.save();
    if (dir === "left") ctx.scale(-1, 1);
    ctx.drawImage(headImg, -S / 2, headTop - 33, S, S);
    ctx.restore();
  } else {
  ctx.fillStyle = skin;
  roundRect(ctx, -5.5 * u, headTop, 11 * u, 10 * u, robot ? 3 : 6);
  ctx.fill();
  // 외곽선 (게더 스타일의 또렷한 실루엣)
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  roundRect(ctx, -5.5 * u, headTop, 11 * u, 10 * u, robot ? 3 : 6);
  ctx.stroke();

  if (robot) {
    // 안테나
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, headTop);
    ctx.lineTo(0, headTop - 3 * u);
    ctx.stroke();
    const pulse = Math.floor(t / 400) % 2 === 0;
    ctx.fillStyle = pulse ? "#f87171" : "#7f1d1d";
    ctx.beginPath();
    ctx.arc(0, headTop - 3.5 * u, 1.2 * u, 0, Math.PI * 2);
    ctx.fill();
    // 측면 볼트
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(-6.2 * u, headTop + 4 * u, 1.4 * u, 2 * u);
    ctx.fillRect(4.8 * u, headTop + 4 * u, 1.4 * u, 2 * u);
    if (dir !== "up") {
      // 바이저 + 발광 눈
      const off = dir === "left" ? -1.5 * u : dir === "right" ? 1.5 * u : 0;
      ctx.fillStyle = "#1f2430";
      roundRect(ctx, -4.5 * u + off * 0.4, headTop + 3 * u, 9 * u, 3.2 * u, 2);
      ctx.fill();
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(off - 2.8 * u, headTop + 4 * u, 1.6 * u, 1.4 * u);
      ctx.fillRect(off + 1.2 * u, headTop + 4 * u, 1.6 * u, 1.4 * u);
      // 입(스피커 그릴)
      ctx.fillStyle = "#4b5563";
      ctx.fillRect(off - 1.5 * u, headTop + 7.6 * u, 3 * u, 0.6 * u);
      ctx.fillRect(off - 1.5 * u, headTop + 8.6 * u, 3 * u, 0.6 * u);
    }
  } else {
    // ----- 머리카락 -----
    drawHair(ctx, u, headTop, app.hair ?? "short", hairC, dir);

    // ----- 얼굴/수염/안경 -----
    if (dir !== "up") {
      drawFacePixel(ctx, u, headTop, dir, app.face, skin);
      drawFacialHair(ctx, u, headTop, dir, app.facialHair ?? "none", hairC);
      drawGlasses(ctx, u, headTop, dir, app.glasses ?? "none");
    }

    // ----- 모자 -----
    drawHatPixel(ctx, u, headTop, app.hat, top);
  }
  } // end: 픽셀 머리 (headImg 없을 때)

  // 춤 음표
  if (dancing) {
    const di = cos?.dance ? SHOP_MAP[cos.dance] : undefined;
    ctx.globalAlpha = 0.9;
    ctx.font = "11px serif";
    ctx.textAlign = "center";
    ctx.fillStyle = di?.color ?? "#a5b4fc";
    ctx.fillText(di?.icon ?? (danceBeat === 0 ? "♪" : "♫"), 8 * u, headTop - 4 * u);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // 펫 — 캐릭터 옆 (반투명 영향 후 원복 전에 그려 고스트 시 함께 흐려짐)
  if (cos?.pet && !onBike) {
    const pi = SHOP_MAP[cos.pet];
    if (pi) drawPet(ctx, cx, cy, pi.color ?? "#9ca3af", t);
  }
  if (ghost) ctx.globalAlpha = 1;

  if (lying) {
    ctx.font = "13px serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#a5b4fc";
    ctx.fillText("💤", cx + 14, cy - 24 + Math.sin(t / 500) * 2);
  }

  // ----- 이름표 + 상태 -----
  // nameAbove: 긴 머리 스타일이 가려지지 않도록 이름표를 더 위로 올린다.
  const labelY = cy - (app.nameAbove ? 62 : 46) - (onBike ? 8 : 0);
  ctx.font = "bold 11px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const label = name.length > 14 ? name.slice(0, 13) + "…" : name;
  const tw = ctx.measureText(label).width;
  const statusColor = STATUS_META[extras?.status ?? "available"]?.color ?? "#34d399";
  const boxW = tw + 20;
  ctx.fillStyle = isSelf ? "rgba(35,48,84,0.92)" : "rgba(10,14,25,0.72)";
  roundRect(ctx, cx - boxW / 2, labelY - 12, boxW, 15, 5);
  ctx.fill();
  if (isSelf) {
    ctx.strokeStyle = "rgba(124,140,255,0.8)";
    ctx.lineWidth = 1;
    roundRect(ctx, cx - boxW / 2, labelY - 12, boxW, 15, 5);
    ctx.stroke();
  }
  ctx.fillStyle = statusColor;
  ctx.beginPath();
  ctx.arc(cx - boxW / 2 + 8, labelY - 4.5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(label, cx + 5, labelY - 1);

  // 손들기 아이콘
  if (extras?.hand) {
    ctx.font = "14px serif";
    ctx.fillText("✋", cx + boxW / 2 + 10, labelY - 1);
  }
}

// 상의 스타일별 몸통 렌더 (티셔츠/후디/정장/줄무늬). robot 이면 금속 몸통 취급.
function drawTop(
  ctx: CanvasRenderingContext2D,
  u: number,
  bodyTop: number,
  color: string,
  style: string,
  dir: Direction,
  robot: boolean
) {
  const H = 8.5 * u;
  if (style === "suit" && !robot) {
    // 정장: 짙은 자켓 + 셔츠 + 넥타이
    ctx.fillStyle = "#2b3040";
    roundRect(ctx, -5 * u, bodyTop, 10 * u, H, 3);
    ctx.fill();
    if (dir !== "up") {
      ctx.fillStyle = "#f3f4f6";
      ctx.beginPath();
      ctx.moveTo(-1.5 * u, bodyTop);
      ctx.lineTo(1.5 * u, bodyTop);
      ctx.lineTo(0, bodyTop + 3.5 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(-0.6 * u, bodyTop + 0.5 * u, 1.2 * u, 3.5 * u); // 넥타이
    }
  } else {
    ctx.fillStyle = color;
    roundRect(ctx, -5 * u, bodyTop, 10 * u, H, 3);
    ctx.fill();
    if (style === "stripe") {
      ctx.fillStyle = robot ? "rgba(255,255,255,0.5)" : lighten(color, 0.45);
      ctx.fillRect(-5 * u, bodyTop + 1.5 * u, 10 * u, 1.2 * u);
      ctx.fillRect(-5 * u, bodyTop + 4.2 * u, 10 * u, 1.2 * u);
    } else if (style === "hoodie") {
      // 후드 라인 + 주머니 + 끈
      ctx.fillStyle = darken(color, 0.2);
      roundRect(ctx, -5 * u, bodyTop - 0.8 * u, 10 * u, 2.2 * u, 3); // 후드 뭉치
      ctx.fill();
      if (dir !== "up") {
        ctx.fillStyle = darken(color, 0.25);
        roundRect(ctx, -2.5 * u, bodyTop + 4.5 * u, 5 * u, 2.5 * u, 2); // 주머니
        ctx.fill();
        ctx.fillStyle = "#f3f4f6";
        ctx.fillRect(-1.2 * u, bodyTop + 1 * u, 0.7 * u, 2.2 * u); // 끈
        ctx.fillRect(0.5 * u, bodyTop + 1 * u, 0.7 * u, 2.2 * u);
      }
    } else if (dir !== "up") {
      ctx.fillStyle = lighten(color, 0.1);
      ctx.fillRect(-5 * u + u, bodyTop + u, 3 * u, 1.5 * u);
    }
    ctx.fillStyle = darken(color, 0.18);
    ctx.fillRect(-5 * u, bodyTop + 6.5 * u, 10 * u, 2 * u);
  }
  // 외곽선
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.2;
  roundRect(ctx, -5 * u, bodyTop, 10 * u, H, 3);
  ctx.stroke();
}

// 수염
function drawFacialHair(
  ctx: CanvasRenderingContext2D,
  u: number,
  headTop: number,
  dir: Direction,
  kind: string,
  color: string
) {
  if (kind === "none") return;
  const off = dir === "left" ? -1.5 * u : dir === "right" ? 1.5 * u : 0;
  const mouthY = headTop + 7.5 * u;
  ctx.fillStyle = color;
  if (kind === "mustache") {
    ctx.fillRect(off - 2.2 * u, mouthY - 1.2 * u, 4.4 * u, 1.1 * u);
  } else if (kind === "beard") {
    ctx.fillRect(off - 3.5 * u, mouthY - 0.5 * u, 7 * u, 2.5 * u);
    ctx.fillRect(off - 2.2 * u, mouthY - 1.4 * u, 4.4 * u, 1 * u);
  } else if (kind === "goatee") {
    ctx.fillRect(off - 1.2 * u, mouthY + 0.4 * u, 2.4 * u, 1.6 * u);
  }
}

// 안경
function drawGlasses(
  ctx: CanvasRenderingContext2D,
  u: number,
  headTop: number,
  dir: Direction,
  kind: string
) {
  if (kind === "none") return;
  const off = dir === "left" ? -1.5 * u : dir === "right" ? 1.5 * u : 0;
  const eyeY = headTop + 4.5 * u;
  const ex = 2.5 * u;
  if (kind === "sunglasses") {
    ctx.fillStyle = "#111827";
    ctx.fillRect(off - ex - 1.6 * u, eyeY - 1.1 * u, (ex + 1.6 * u) * 2, 1 * u);
    ctx.fillRect(off - ex - 1.4 * u, eyeY - 1.1 * u, 2.8 * u, 2.6 * u);
    ctx.fillRect(off + ex - 1.4 * u, eyeY - 1.1 * u, 2.8 * u, 2.6 * u);
    return;
  }
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1;
  if (kind === "round") {
    ctx.beginPath();
    ctx.arc(off - ex, eyeY, 1.6 * u, 0, Math.PI * 2);
    ctx.arc(off + ex, eyeY, 1.6 * u, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(off - ex - 1.4 * u, eyeY - 1.2 * u, 2.8 * u, 2.4 * u);
    ctx.strokeRect(off + ex - 1.4 * u, eyeY - 1.2 * u, 2.8 * u, 2.4 * u);
  }
  ctx.beginPath();
  ctx.moveTo(off - ex + 1.4 * u, eyeY - 0.2 * u);
  ctx.lineTo(off + ex - 1.4 * u, eyeY - 0.2 * u);
  ctx.stroke();
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  u: number,
  headTop: number,
  hair: string,
  color: string,
  dir: Direction
) {
  if (hair === "none") return;
  ctx.fillStyle = color;
  const back = dir === "up";

  switch (hair) {
    case "short":
      roundRect(ctx, -5.5 * u, headTop - 0.5 * u, 11 * u, 4 * u, 5);
      ctx.fill();
      if (back) {
        ctx.fillRect(-5.5 * u, headTop + 3 * u, 11 * u, 3 * u);
      } else {
        ctx.fillRect(-5.5 * u, headTop + 2 * u, 1.5 * u, 3 * u);
        ctx.fillRect(4 * u, headTop + 2 * u, 1.5 * u, 3 * u);
      }
      break;
    case "bob":
      roundRect(ctx, -6 * u, headTop - 0.5 * u, 12 * u, 5 * u, 5);
      ctx.fill();
      ctx.fillRect(-6 * u, headTop + 2 * u, 2 * u, 6 * u);
      ctx.fillRect(4 * u, headTop + 2 * u, 2 * u, 6 * u);
      if (back) ctx.fillRect(-6 * u, headTop + 2 * u, 12 * u, 6 * u);
      break;
    case "long":
      roundRect(ctx, -6 * u, headTop - 0.5 * u, 12 * u, 4.5 * u, 5);
      ctx.fill();
      ctx.fillRect(-6 * u, headTop + 2 * u, 2.5 * u, 12 * u);
      ctx.fillRect(3.5 * u, headTop + 2 * u, 2.5 * u, 12 * u);
      if (back) ctx.fillRect(-6 * u, headTop + 2 * u, 12 * u, 10 * u);
      break;
    case "ponytail": {
      roundRect(ctx, -5.5 * u, headTop - 0.5 * u, 11 * u, 4 * u, 5);
      ctx.fill();
      if (dir === "left") ctx.fillRect(4 * u, headTop + u, 3 * u, 8 * u);
      else if (dir === "right") ctx.fillRect(-7 * u, headTop + u, 3 * u, 8 * u);
      else ctx.fillRect(-1.5 * u, headTop - 2.5 * u, 3 * u, 3 * u);
      if (back) ctx.fillRect(-1.5 * u, headTop + 2 * u, 3 * u, 9 * u);
      break;
    }
    case "spiky":
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const sx = (-5 + i * 2.4) * u;
        ctx.moveTo(sx, headTop + 1.5 * u);
        ctx.lineTo(sx + 1.2 * u, headTop - 2.5 * u);
        ctx.lineTo(sx + 2.4 * u, headTop + 1.5 * u);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillRect(-5.5 * u, headTop + 0.5 * u, 11 * u, 2 * u);
      break;
    case "curly":
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc((-4 + i * 2.7) * u, headTop + 0.5 * u, 2.2 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(-5 * u, headTop + 3 * u, 1.8 * u, 0, Math.PI * 2);
      ctx.arc(5 * u, headTop + 3 * u, 1.8 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function drawFacePixel(
  ctx: CanvasRenderingContext2D,
  u: number,
  headTop: number,
  dir: Direction,
  face: string,
  skin: string
) {
  const off = dir === "left" ? -1.5 * u : dir === "right" ? 1.5 * u : 0;
  const eyeY = headTop + 4.5 * u;
  const ex = 2.5 * u;

  ctx.fillStyle = "#1f2937";
  if (face === "cool") {
    // 무표정: 일자 눈 + 일자 입
    ctx.fillRect(off - ex - u, eyeY - u * 0.4, 2 * u, u * 0.9);
    ctx.fillRect(off + ex - u, eyeY - u * 0.4, 2 * u, u * 0.9);
    ctx.fillStyle = darken(skin, 0.45);
    ctx.fillRect(off - 1.2 * u, eyeY + 3 * u, 2.4 * u, u * 0.7);
    return;
  }
  if (face === "wink") {
    ctx.fillRect(off - ex - u, eyeY - u / 2, 1.5 * u, 1.5 * u);
    ctx.fillRect(off + ex - 1.5 * u, eyeY, 2.5 * u, u * 0.7);
  } else if (face === "star") {
    ctx.fillStyle = "#fbbf24";
    star(ctx, off - ex, eyeY, 2.2 * u);
    star(ctx, off + ex, eyeY, 2.2 * u);
    ctx.fillStyle = "#1f2937";
  } else if (face === "sleepy") {
    ctx.fillRect(off - ex - u, eyeY, 2 * u, u * 0.7);
    ctx.fillRect(off + ex - u, eyeY, 2 * u, u * 0.7);
  } else if (face === "surprised") {
    ctx.beginPath();
    ctx.arc(off - ex, eyeY, u, 0, Math.PI * 2);
    ctx.arc(off + ex, eyeY, u, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(off - ex - u, eyeY - u / 2, 1.5 * u, 1.7 * u);
    ctx.fillRect(off + ex - u / 2, eyeY - u / 2, 1.5 * u, 1.7 * u);
  }

  // 볼터치
  ctx.fillStyle = "rgba(244,114,182,0.35)";
  ctx.fillRect(off - ex - 1.5 * u, eyeY + 1.5 * u, 1.5 * u, u);
  ctx.fillRect(off + ex + 0.2 * u, eyeY + 1.5 * u, 1.5 * u, u);

  // 입
  ctx.fillStyle = darken(skin, 0.45);
  if (face === "surprised") {
    ctx.beginPath();
    ctx.arc(off, eyeY + 3 * u, u, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(off - u, eyeY + 3 * u, 2 * u, u * 0.8);
  }
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawHatPixel(
  ctx: CanvasRenderingContext2D,
  u: number,
  headTop: number,
  hat: string,
  color: string
) {
  switch (hat) {
    case "cap":
      ctx.fillStyle = darken(color, 0.1);
      roundRect(ctx, -5.5 * u, headTop - 1.5 * u, 11 * u, 3.5 * u, 4);
      ctx.fill();
      ctx.fillRect(0, headTop, 7.5 * u, 1.8 * u);
      break;
    case "crown":
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(-4.5 * u, headTop + 0.5 * u);
      ctx.lineTo(-4.5 * u, headTop - 3 * u);
      ctx.lineTo(-2.2 * u, headTop - 0.8 * u);
      ctx.lineTo(0, headTop - 4 * u);
      ctx.lineTo(2.2 * u, headTop - 0.8 * u);
      ctx.lineTo(4.5 * u, headTop - 3 * u);
      ctx.lineTo(4.5 * u, headTop + 0.5 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-u * 0.7, headTop - 1.8 * u, 1.4 * u, 1.4 * u);
      break;
    case "band":
      ctx.fillStyle = "#f472b6";
      ctx.fillRect(-5.5 * u, headTop + 0.5 * u, 11 * u, 1.5 * u);
      ctx.beginPath();
      ctx.arc(4 * u, headTop + u, 1.6 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "cat":
      ctx.fillStyle = darken(color, 0.05);
      for (const exx of [-3.5 * u, 3.5 * u]) {
        ctx.beginPath();
        ctx.moveTo(exx - 2 * u, headTop + u);
        ctx.lineTo(exx, headTop - 3.5 * u);
        ctx.lineTo(exx + 2 * u, headTop + u);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#f9a8d4";
      for (const exx of [-3.5 * u, 3.5 * u]) {
        ctx.beginPath();
        ctx.moveTo(exx - u, headTop + 0.3 * u);
        ctx.lineTo(exx, headTop - 1.8 * u);
        ctx.lineTo(exx + u, headTop + 0.3 * u);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case "beanie":
      ctx.fillStyle = "#0d9488";
      roundRect(ctx, -5.5 * u, headTop - 2 * u, 11 * u, 4.5 * u, 5);
      ctx.fill();
      ctx.fillStyle = "#134e4a";
      ctx.fillRect(-5.5 * u, headTop + 1.5 * u, 11 * u, u);
      ctx.fillStyle = "#f4f4f5";
      ctx.beginPath();
      ctx.arc(0, headTop - 2.5 * u, 1.5 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "flower":
      ctx.fillStyle = "#f472b6";
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.arc(3.5 * u + Math.cos(a) * 1.3 * u, headTop + Math.sin(a) * 1.3 * u, u, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(3.5 * u, headTop, u * 0.9, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}
