"use client";

// 실시간 공동 화이트보드 캔버스 (스트로크/텍스트/지우개/내보내기).
// 좌표는 0..1 정규화로 저장해 어떤 화면 크기에서도 동일하게 보인다.
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { WbOp, WbStroke } from "@/lib/realtime/protocol";

const COLORS = ["#111827", "#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7"];

export interface WhiteboardHandle {
  applyRemote: (op: WbOp) => void;
  exportPng: () => void;
  getOps: () => WbOp[];
}

const WhiteboardCanvas = forwardRef<
  WhiteboardHandle,
  {
    initialOps: WbOp[];
    onOp: (op: WbOp) => void; // 로컬 발생 오퍼레이션 (브로드캐스트/저장용)
    transparent?: boolean; // 화면 주석 모드
    height?: number;
  }
>(function WhiteboardCanvas({ initialOps, onOp, transparent, height = 520 }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opsRef = useRef<WbOp[]>([...initialOps]);
  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState<"pen" | "eraser" | "text">("pen");
  const drawing = useRef<{ points: number[] } | null>(null);

  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!transparent) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    for (const op of opsRef.current) drawOp(ctx, cv, op, transparent);
  }, [transparent]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const resize = () => {
      const rect = cv.parentElement!.getBoundingClientRect();
      cv.width = rect.width;
      cv.height = rect.height;
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [redraw]);

  useImperativeHandle(ref, () => ({
    applyRemote: (op) => {
      if (op.kind === "clear") opsRef.current = [];
      else opsRef.current.push(op);
      redraw();
    },
    exportPng: () => {
      const cv = canvasRef.current;
      if (!cv) return;
      const a = document.createElement("a");
      a.href = cv.toDataURL("image/png");
      a.download = "whiteboard.png";
      a.click();
    },
    getOps: () => opsRef.current,
  }));

  const localOp = useCallback(
    (op: WbOp) => {
      if (op.kind === "clear") opsRef.current = [];
      else opsRef.current.push(op);
      redraw();
      onOp(op);
    },
    [onOp, redraw]
  );

  function ptFromEvent(e: React.PointerEvent): [number, number] {
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  }

  function onPointerDown(e: React.PointerEvent) {
    const [x, y] = ptFromEvent(e);
    if (tool === "text") {
      const text = window.prompt("텍스트 입력:");
      if (text) localOp({ kind: "text", x, y, text: text.slice(0, 80), color });
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = { points: [x, y] };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    const [x, y] = ptFromEvent(e);
    const pts = drawing.current.points;
    pts.push(x, y);
    // 라이브 미리보기
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    const n = pts.length;
    if (n >= 4) {
      ctx.strokeStyle = tool === "eraser" ? (transparent ? "rgba(0,0,0,1)" : "#ffffff") : color;
      ctx.globalCompositeOperation =
        tool === "eraser" && transparent ? "destination-out" : "source-over";
      ctx.lineWidth = tool === "eraser" ? size * 4 : size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pts[n - 4] * cv.width, pts[n - 3] * cv.height);
      ctx.lineTo(pts[n - 2] * cv.width, pts[n - 1] * cv.height);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function onPointerUp() {
    if (!drawing.current) return;
    const stroke: WbStroke = {
      color,
      size: tool === "eraser" ? size * 4 : size,
      points: drawing.current.points,
      erase: tool === "eraser",
    };
    drawing.current = null;
    localOp({ kind: "stroke", stroke });
  }

  return (
    <div className={`flex flex-col gap-2 ${transparent ? "h-full" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c);
              setTool("pen");
            }}
            className={`h-7 w-7 rounded-full border-2 transition ${
              color === c && tool === "pen" ? "scale-110 border-white" : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button
          onClick={() => setTool("eraser")}
          className={`rounded-lg px-2.5 py-1 text-sm ${
            tool === "eraser" ? "bg-accent text-white" : "bg-panel2 text-slate-300"
          }`}
        >
          🧽 지우개
        </button>
        <button
          onClick={() => setTool("text")}
          className={`rounded-lg px-2.5 py-1 text-sm ${
            tool === "text" ? "bg-accent text-white" : "bg-panel2 text-slate-300"
          }`}
        >
          🔤 텍스트
        </button>
        <select
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="rounded-lg bg-panel2 px-2 py-1 text-sm text-slate-300"
        >
          <option value={2}>가늘게</option>
          <option value={4}>보통</option>
          <option value={8}>굵게</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={() => {
            if (confirm("화이트보드를 모두 지울까요?")) localOp({ kind: "clear" });
          }}
          className="rounded-lg bg-panel2 px-2.5 py-1 text-sm text-red-300 hover:bg-red-500/20"
        >
          전체 지우기
        </button>
      </div>
      <div
        className={`relative w-full overflow-hidden rounded-xl ${
          transparent ? "min-h-0 flex-1" : "border border-white/10"
        }`}
        style={transparent ? undefined : { height }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
    </div>
  );
});

function drawOp(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  op: WbOp,
  transparent?: boolean
) {
  if (op.kind === "stroke") {
    const s = op.stroke;
    ctx.strokeStyle = s.erase ? (transparent ? "rgba(0,0,0,1)" : "#ffffff") : s.color;
    ctx.globalCompositeOperation = s.erase && transparent ? "destination-out" : "source-over";
    ctx.lineWidth = s.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i + 1 < s.points.length; i += 2) {
      const x = s.points[i] * cv.width;
      const y = s.points[i + 1] * cv.height;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  } else if (op.kind === "text") {
    ctx.fillStyle = op.color;
    ctx.font = "16px ui-sans-serif, system-ui";
    ctx.fillText(op.text, op.x * cv.width, op.y * cv.height);
  }
}

export default WhiteboardCanvas;
