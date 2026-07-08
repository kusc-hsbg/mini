"use client";

// 미니게임 허브 (feature #4) — 낚시 / 리듬 / 농사. 점수를 하트로 보상.
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./ui";

type Game = "hub" | "fishing" | "rhythm" | "farming";

export default function MiniGamesModal({
  onReward,
  onClose,
}: {
  onReward: (hearts: number) => void; // 획득 하트 지급(부모가 서버 반영, 최대 30 클램프)
  onClose: () => void;
}) {
  const [game, setGame] = useState<Game>("hub");
  return (
    <Modal title="🎮 미니게임" onClose={onClose}>
      {game === "hub" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">플레이하고 하트를 획득하세요! (게임당 최대 30💗)</p>
          {([
            ["fishing", "🎣 낚시", "물고기가 물면 타이밍 맞춰 낚아채기"],
            ["rhythm", "🎵 리듬", "화면의 방향키를 순서대로 정확히"],
            ["farming", "🌱 농사", "씨앗을 심고 자라면 수확하기"],
          ] as [Game, string, string][]).map(([k, title, desc]) => (
            <button
              key={k}
              onClick={() => setGame(k)}
              className="flex w-full items-center gap-3 rounded-xl bg-panel2 p-3 text-left transition hover:bg-panel2/70"
            >
              <span className="text-2xl">{title.split(" ")[0]}</span>
              <div>
                <div className="text-sm font-medium text-white">{title.split(" ")[1]}</div>
                <div className="text-xs text-slate-400">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {game === "fishing" && <Fishing onReward={onReward} onBack={() => setGame("hub")} />}
      {game === "rhythm" && <Rhythm onReward={onReward} onBack={() => setGame("hub")} />}
      {game === "farming" && <Farming onReward={onReward} onBack={() => setGame("hub")} />}
    </Modal>
  );
}

function BackBar({ onBack, right }: { onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <button onClick={onBack} className="text-sm text-slate-400 hover:text-white">← 목록</button>
      {right}
    </div>
  );
}

// ---------------- 낚시 ----------------
function Fishing({ onReward, onBack }: { onReward: (h: number) => void; onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "waiting" | "bite" | "done">("idle");
  const [msg, setMsg] = useState("낚싯대를 던져보세요!");
  const [caught, setCaught] = useState(0);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    if (biteTimer.current) clearTimeout(biteTimer.current);
  };
  useEffect(() => () => clearTimers(), []);

  function cast() {
    setPhase("waiting");
    setMsg("🎣 입질을 기다리는 중...");
    const delay = 1500 + Math.random() * 3000;
    waitTimer.current = setTimeout(() => {
      setPhase("bite");
      setMsg("❗ 지금 낚아채세요!");
      biteTimer.current = setTimeout(() => {
        setPhase("idle");
        setMsg("놓쳤어요... 다시 던져보세요.");
      }, 900);
    }, delay);
  }

  function pull() {
    if (phase === "waiting") {
      clearTimers();
      setPhase("idle");
      setMsg("너무 빨랐어요! 물고기가 도망갔어요 🐟💨");
      return;
    }
    if (phase === "bite") {
      clearTimers();
      const fishes = ["🐟", "🐠", "🐡", "🦈", "🦞", "🐙"];
      const fish = fishes[Math.floor(Math.random() * fishes.length)];
      const gain = 3 + Math.floor(Math.random() * 8);
      setCaught((c) => c + gain);
      setMsg(`${fish} 잡았다! +${gain}💗`);
      setPhase("idle");
    }
  }

  function finish() {
    setPhase("done");
    onReward(caught);
  }

  return (
    <div>
      <BackBar onBack={onBack} right={<span className="text-sm text-pink-400">획득 {caught}💗</span>} />
      <div className="grid place-items-center gap-4 rounded-xl bg-gradient-to-b from-sky-900/40 to-blue-900/60 py-10">
        <div className={`text-5xl transition ${phase === "bite" ? "animate-bounce" : ""}`}>
          {phase === "bite" ? "❗" : "🎣"}
        </div>
        <p className="text-sm text-slate-200">{msg}</p>
      </div>
      <div className="mt-3 flex gap-2">
        {phase === "idle" && (
          <button onClick={cast} className="btn-primary flex-1">낚싯대 던지기</button>
        )}
        {(phase === "waiting" || phase === "bite") && (
          <button onClick={pull} className="btn-primary flex-1">🎣 낚아채기!</button>
        )}
        {caught > 0 && phase === "idle" && (
          <button onClick={finish} className="btn-ghost">그만하고 보상받기</button>
        )}
      </div>
      {phase === "done" && <p className="mt-2 text-center text-sm text-accent2">{caught}💗 획득 완료!</p>}
    </div>
  );
}

// ---------------- 리듬 ----------------
const ARROWS = ["←", "↑", "↓", "→"] as const;
const KEYMAP: Record<string, number> = {
  ArrowLeft: 0, ArrowUp: 1, ArrowDown: 2, ArrowRight: 3,
  a: 0, w: 1, s: 2, d: 3,
};
function Rhythm({ onReward, onBack }: { onReward: (h: number) => void; onBack: () => void }) {
  const [seq] = useState<number[]>(() =>
    Array.from({ length: 12 }, () => Math.floor(Math.random() * 4))
  );
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<"ok" | "miss" | null>(null);

  const press = useCallback(
    (lane: number) => {
      if (done) return;
      setIdx((i) => {
        if (i >= seq.length) return i;
        if (seq[i] === lane) {
          setScore((s) => s + 1);
          setFlash("ok");
        } else {
          setFlash("miss");
        }
        const next = i + 1;
        if (next >= seq.length) setDone(true);
        return next;
      });
      setTimeout(() => setFlash(null), 120);
    },
    [seq, done]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const lane = KEYMAP[e.key] ?? KEYMAP[e.key.toLowerCase()];
      if (lane !== undefined) {
        e.preventDefault();
        press(lane);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <div>
      <BackBar onBack={onBack} right={<span className="text-sm text-pink-400">{score}/{seq.length}</span>} />
      <div
        className={`rounded-xl p-6 text-center transition ${
          flash === "ok" ? "bg-emerald-500/30" : flash === "miss" ? "bg-red-500/30" : "bg-panel2"
        }`}
      >
        {!done ? (
          <>
            <div className="mb-3 flex justify-center gap-2 text-3xl">
              {seq.slice(idx, idx + 5).map((a, i) => (
                <span key={i} className={i === 0 ? "text-white" : "text-slate-600"}>
                  {ARROWS[a]}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400">방향키 또는 W/A/S/D 로 첫 화살표를 입력하세요</p>
          </>
        ) : (
          <div className="py-4">
            <p className="text-lg font-bold text-white">🎵 완료! {score}/{seq.length}</p>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {ARROWS.map((a, i) => (
          <button
            key={i}
            onClick={() => press(i)}
            disabled={done}
            className="rounded-lg bg-panel2 py-3 text-xl text-white hover:bg-panel2/70 disabled:opacity-40"
          >
            {a}
          </button>
        ))}
      </div>
      {done && (
        <button onClick={() => onReward(score * 2)} className="btn-primary mt-3 w-full">
          보상 받기 (+{Math.min(30, score * 2)}💗)
        </button>
      )}
    </div>
  );
}

// ---------------- 농사 ----------------
type Plot = "empty" | "seed" | "growing" | "ready";
function Farming({ onReward, onBack }: { onReward: (h: number) => void; onBack: () => void }) {
  const [plots, setPlots] = useState<Plot[]>(() => Array(9).fill("empty"));
  const [harvested, setHarvested] = useState(0);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  function click(i: number) {
    setPlots((prev) => {
      const next = [...prev];
      if (next[i] === "empty") {
        next[i] = "seed";
        timers.current[i] = setTimeout(() => {
          setPlots((p) => {
            const n = [...p];
            if (n[i] === "seed") n[i] = "growing";
            return n;
          });
          timers.current[i] = setTimeout(() => {
            setPlots((p) => {
              const n = [...p];
              if (n[i] === "growing") n[i] = "ready";
              return n;
            });
          }, 2500);
        }, 2000);
      } else if (next[i] === "ready") {
        next[i] = "empty";
        setHarvested((h) => h + 2);
      }
      return next;
    });
  }

  const emoji: Record<Plot, string> = { empty: "🟫", seed: "🌰", growing: "🌱", ready: "🌾" };
  return (
    <div>
      <BackBar onBack={onBack} right={<span className="text-sm text-pink-400">수확 {harvested}💗</span>} />
      <p className="mb-2 text-center text-xs text-slate-400">빈 밭을 눌러 심고, 🌾가 되면 눌러 수확하세요!</p>
      <div className="mx-auto grid w-fit grid-cols-3 gap-2">
        {plots.map((p, i) => (
          <button
            key={i}
            onClick={() => click(i)}
            className={`grid h-16 w-16 place-items-center rounded-xl text-3xl transition ${
              p === "ready" ? "bg-amber-500/30 ring-2 ring-amber-400" : "bg-panel2 hover:bg-panel2/70"
            }`}
          >
            {emoji[p]}
          </button>
        ))}
      </div>
      {harvested > 0 && (
        <button onClick={() => onReward(harvested)} className="btn-primary mt-3 w-full">
          보상 받기 (+{Math.min(30, harvested)}💗)
        </button>
      )}
    </div>
  );
}
