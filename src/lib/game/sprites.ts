// 캐릭터/타일/오브젝트를 코드로 그리는 픽셀아트 렌더러 (외부 이미지 에셋 0개).
import type { CharacterAppearance, Direction, UserStatus } from "./types";
import { TILE_INFO, type MapObject } from "./maps";
import { OBJECT_DEFS } from "./objects";
import { STATUS_META, TILE } from "./constants";

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
    case "B": {
      ctx.fillStyle = "rgba(251,191,36,0.16)";
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.strokeStyle = "rgba(251,191,36,0.7)";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
      ctx.setLineDash([]);
      ctx.font = "14px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🏍️", x + TILE / 2, y + TILE / 2);
      break;
    }
  }
}

// ---------- 오브젝트 ----------

const BOOK_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#f97316"];

export function drawObject(
  ctx: CanvasRenderingContext2D,
  o: MapObject,
  t: number
) {
  const def = OBJECT_DEFS[o.type];
  if (!def) return;
  const x = o.x * TILE;
  const y = o.y * TILE;
  const w = def.w * TILE;
  const h = def.h * TILE;

  switch (o.type) {
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
      ctx.fillStyle = "rgba(124,140,255,0.18)";
      roundRect(ctx, x + 2, y + 2, TILE - 4, TILE - 4, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(124,140,255,0.8)";
      ctx.setLineDash([5, 4]);
      roundRect(ctx, x + 2.5, y + 2.5, TILE - 5, TILE - 5, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      const pulse = 0.6 + Math.sin(t / 350) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.font = "14px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🌀", x + TILE / 2, y + TILE / 2);
      ctx.globalAlpha = 1;
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
  } else if (o.type === "campfire") {
    const glow = 0.1 + Math.sin(t / 200) * 0.04;
    ctx.fillStyle = `rgba(251,146,60,${glow})`;
    ctx.beginPath();
    ctx.arc(x + 16, y + 14, 34, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- 캐릭터 (픽셀아트) ----------

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
  speaking?: boolean;
  atDesk?: boolean;
}

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
  const step = moving ? Math.floor(t / 130) % 4 : 0; // 걷기 프레임 0..3
  const bob = moving ? (step % 2 === 1 ? -1 : 0) : Math.sin(t / 500) > 0.6 ? -0.5 : 0;

  // 그림자
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, onBike ? 18 : 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (onBike) drawBike(ctx, cx, cy - 2, dir, moving ? t : 0);

  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy + bob * u - (onBike ? 8 : 0)));

  const skin = app.skin;
  const top = app.color;
  const pants = app.pants ?? "#1f2937";
  const hairC = app.hairColor ?? "#4b3621";
  const side = dir === "left" ? -1 : dir === "right" ? 1 : 0;

  // ----- 다리 (걷기 애니메이션) -----
  const legLift = [0, 2, 0, 2];
  const lA = moving ? legLift[step] : 0;
  const lB = moving ? legLift[(step + 2) % 4] : 0;
  ctx.fillStyle = pants;
  if (dir === "left" || dir === "right") {
    ctx.fillRect(-3 * u + side * u, -6 * u - lA, 3 * u, 6 * u - lA * 0 + lA * 0);
    ctx.fillRect(0 * u + side * u, -6 * u - lB, 3 * u, 6 * u);
    ctx.fillRect(-3 * u + side * u, -6 * u - lA, 3 * u, 6 * u);
  } else {
    ctx.fillRect(-4 * u, -6 * u - lA, 3.5 * u, 6 * u + lA);
    ctx.fillRect(0.5 * u, -6 * u - lB, 3.5 * u, 6 * u + lB);
  }
  // 신발
  ctx.fillStyle = "#292524";
  if (dir === "left" || dir === "right") {
    ctx.fillRect(-3 * u + side * u, -1.5 * u - lA, 3 * u, 1.5 * u);
    ctx.fillRect(0 * u + side * u, -1.5 * u - lB, 3 * u, 1.5 * u);
  } else {
    ctx.fillRect(-4 * u, -1.5 * u - lA, 3.5 * u, 1.5 * u);
    ctx.fillRect(0.5 * u, -1.5 * u - lB, 3.5 * u, 1.5 * u);
  }

  // ----- 몸통(상의) -----
  const bodyTop = -14 * u;
  ctx.fillStyle = top;
  roundRect(ctx, -5 * u, bodyTop, 10 * u, 8.5 * u, 3);
  ctx.fill();
  ctx.fillStyle = darken(top, 0.18);
  ctx.fillRect(-5 * u, bodyTop + 6.5 * u, 10 * u, 2 * u);
  if (dir !== "up") {
    ctx.fillStyle = lighten(top, 0.1);
    ctx.fillRect(-5 * u + u, bodyTop + u, 3 * u, 1.5 * u);
  }

  // ----- 팔 (스윙) -----
  const armSwing = moving ? (step === 1 ? 2 : step === 3 ? -2 : 0) : 0;
  ctx.fillStyle = darken(top, 0.1);
  const handRaised = extras?.hand;
  if (dir === "left" || dir === "right") {
    ctx.fillRect(side * 4 * u - u, bodyTop + 1.5 * u + armSwing, 2.5 * u, 6 * u);
  } else {
    ctx.fillRect(-7 * u, bodyTop + u + armSwing, 2.5 * u, 6 * u);
    if (handRaised) {
      // 오른팔 번쩍
      ctx.fillRect(4.5 * u, bodyTop - 6 * u, 2.5 * u, 7 * u);
      ctx.fillStyle = skin;
      ctx.fillRect(4.5 * u, bodyTop - 8 * u, 2.5 * u, 2.5 * u);
      ctx.fillStyle = darken(top, 0.1);
    } else {
      ctx.fillRect(4.5 * u, bodyTop + u - armSwing, 2.5 * u, 6 * u);
    }
  }
  // 손
  if (!handRaised) {
    ctx.fillStyle = skin;
    if (dir === "left" || dir === "right") {
      ctx.fillRect(side * 4 * u - u, bodyTop + 7 * u + armSwing, 2.5 * u, 2 * u);
    } else {
      ctx.fillRect(-7 * u, bodyTop + 6.5 * u + armSwing, 2.5 * u, 2 * u);
      ctx.fillRect(4.5 * u, bodyTop + 6.5 * u - armSwing, 2.5 * u, 2 * u);
    }
  }

  // ----- 머리 -----
  const headTop = bodyTop - 9.5 * u;
  ctx.fillStyle = skin;
  roundRect(ctx, -5.5 * u, headTop, 11 * u, 10 * u, 6);
  ctx.fill();

  // ----- 머리카락 -----
  drawHair(ctx, u, headTop, app.hair ?? "short", hairC, dir);

  // ----- 얼굴 -----
  if (dir !== "up") drawFacePixel(ctx, u, headTop, dir, app.face, skin);

  // ----- 모자 -----
  drawHatPixel(ctx, u, headTop, app.hat, top);

  ctx.restore();

  // ----- 이름표 + 상태 -----
  const labelY = cy - 46 - (onBike ? 8 : 0);
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

  // 말하는 중 표시(초록 링)
  if (extras?.speaking) {
    ctx.strokeStyle = "rgba(52,211,153,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 13, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 손들기 아이콘
  if (extras?.hand) {
    ctx.font = "14px serif";
    ctx.fillText("✋", cx + boxW / 2 + 10, labelY - 1);
  }
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

  if (face === "cool") {
    ctx.fillStyle = "#111827";
    ctx.fillRect(off - ex - 1.5 * u, eyeY - u, (ex + 1.5 * u) * 2, u);
    ctx.fillRect(off - ex - u, eyeY - u, 2.5 * u, 2.5 * u);
    ctx.fillRect(off + ex - 1.5 * u, eyeY - u, 2.5 * u, 2.5 * u);
    return;
  }

  ctx.fillStyle = "#1f2937";
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
