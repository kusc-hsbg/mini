"use client";

// 내장 게임: 테트리스 (아케이드 오브젝트).
import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";

const COLS = 10;
const ROWS = 20;
const CELL = 24;

const SHAPES: { cells: number[][]; color: string }[] = [
  { cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: "#22d3ee" }, // I
  { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: "#3b82f6" }, // J
  { cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: "#f97316" }, // L
  { cells: [[1, 0], [2, 0], [1, 1], [2, 1]], color: "#facc15" }, // O
  { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: "#22c55e" }, // S
  { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: "#a855f7" }, // T
  { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: "#ef4444" }, // Z
];

interface Piece {
  cells: number[][];
  color: string;
  x: number;
  y: number;
}

function spawn(): Piece {
  const s = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return { cells: s.cells.map((c) => [...c]), color: s.color, x: 3, y: 0 };
}

function rotate(p: Piece): number[][] {
  return p.cells.map(([x, y]) => [1 - (y - 1), x] as number[]).map(([x, y]) => [x + 1, y]);
}

export default function TetrisModal({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [over, setOver] = useState(false);
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const board: (string | null)[][] = Array.from({ length: ROWS }, () =>
      Array(COLS).fill(null)
    );
    let piece = spawn();
    let dropTimer = 0;
    let speed = 700;
    let raf = 0;
    let last = performance.now();
    let dead = false;
    let localScore = 0;
    let localLines = 0;

    const collides = (cells: number[][], px: number, py: number) =>
      cells.some(([cx, cy]) => {
        const x = px + cx;
        const y = py + cy;
        return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x]);
      });

    const lock = () => {
      for (const [cx, cy] of piece.cells) {
        const y = piece.y + cy;
        if (y < 0) {
          dead = true;
          setOver(true);
          return;
        }
        board[y][piece.x + cx] = piece.color;
      }
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every((c) => c)) {
          board.splice(r, 1);
          board.unshift(Array(COLS).fill(null));
          cleared++;
          r++;
        }
      }
      if (cleared) {
        localLines += cleared;
        localScore += [0, 100, 300, 500, 800][cleared] ?? 800;
        speed = Math.max(150, 700 - Math.floor(localLines / 5) * 60);
        setScore(localScore);
        setLines(localLines);
      }
      piece = spawn();
      if (collides(piece.cells, piece.x, piece.y)) {
        dead = true;
        setOver(true);
      }
    };

    const move = (dx: number) => {
      if (!collides(piece.cells, piece.x + dx, piece.y)) piece.x += dx;
    };
    const down = () => {
      if (!collides(piece.cells, piece.x, piece.y + 1)) piece.y++;
      else lock();
    };
    const hardDrop = () => {
      while (!collides(piece.cells, piece.x, piece.y + 1)) piece.y++;
      lock();
    };
    const doRotate = () => {
      const r = rotate(piece);
      if (!collides(r, piece.x, piece.y)) piece.cells = r;
      else if (!collides(r, piece.x - 1, piece.y)) {
        piece.x--;
        piece.cells = r;
      } else if (!collides(r, piece.x + 1, piece.y)) {
        piece.x++;
        piece.cells = r;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (dead) return;
      switch (e.key) {
        case "ArrowLeft": move(-1); break;
        case "ArrowRight": move(1); break;
        case "ArrowDown": down(); break;
        case "ArrowUp": doRotate(); break;
        case " ": hardDrop(); break;
        default: return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);

    const render = () => {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL, 0);
        ctx.lineTo(x * CELL, ROWS * CELL);
        ctx.stroke();
      }
      const cell = (x: number, y: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, 4);
      };
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c]) cell(c, r, board[r][c]!);
      // 고스트
      let gy = piece.y;
      while (!collides(piece.cells, piece.x, gy + 1)) gy++;
      ctx.globalAlpha = 0.2;
      for (const [cx, cy] of piece.cells) cell(piece.x + cx, gy + cy, piece.color);
      ctx.globalAlpha = 1;
      for (const [cx, cy] of piece.cells)
        if (piece.y + cy >= 0) cell(piece.x + cx, piece.y + cy, piece.color);
    };

    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (!dead) {
        dropTimer += dt;
        if (dropTimer > speed) {
          dropTimer = 0;
          down();
        }
      }
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [restartKey]);

  return (
    <Modal title="🕹️ 테트리스" onClose={onClose}>
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full items-center justify-between text-sm text-slate-300">
          <span>
            점수 <b className="text-white">{score}</b> · 줄 <b className="text-white">{lines}</b>
          </span>
          <span className="text-xs text-slate-500">←→ 이동 · ↑ 회전 · ↓ 소프트드롭 · Space 하드드롭</span>
        </div>
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={COLS * CELL}
            height={ROWS * CELL}
            className="rounded-lg border border-white/10"
          />
          {over && (
            <div className="absolute inset-0 grid place-items-center rounded-lg bg-black/70">
              <div className="text-center">
                <p className="text-lg font-bold text-white">게임 오버!</p>
                <p className="mt-1 text-sm text-slate-300">점수: {score}</p>
                <button
                  onClick={() => {
                    setScore(0);
                    setLines(0);
                    setOver(false);
                    setRestartKey((k) => k + 1);
                  }}
                  className="btn-primary mt-3"
                >
                  다시 하기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
