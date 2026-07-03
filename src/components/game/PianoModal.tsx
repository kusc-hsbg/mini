"use client";

// 피아노 연주 모달 — 클릭/키보드로 연주, 근처 사람들에게도 소리가 브로드캐스트된다.
import { useCallback, useEffect, useState } from "react";
import { playPianoNote } from "@/lib/game/audio";
import { Modal } from "./ui";

// C4(60) ~ E5(76) — 흰 건반 10개 + 검은 건반
const WHITE_KEYS = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76];
const BLACK_KEYS: { midi: number; after: number }[] = [
  { midi: 61, after: 0 },
  { midi: 63, after: 1 },
  { midi: 66, after: 3 },
  { midi: 68, after: 4 },
  { midi: 70, after: 5 },
  { midi: 73, after: 7 },
  { midi: 75, after: 8 },
];

// 키보드 매핑 (흰: a s d f g h j k l ; / 검: w e t y u o p)
const KEYMAP: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67,
  y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ";": 76,
};

const NOTE_NAMES = ["도", "도#", "레", "레#", "미", "파", "파#", "솔", "솔#", "라", "라#", "시"];

export default function PianoModal({
  title,
  onNote,
  onClose,
}: {
  title: string;
  onNote: (midi: number) => void; // 브로드캐스트용 (로컬 재생은 여기서)
  onClose: () => void;
}) {
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [lastNote, setLastNote] = useState<string | null>(null);

  const play = useCallback(
    (midi: number) => {
      playPianoNote(midi, 1);
      onNote(midi);
      setLastNote(`${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`);
      setPressed((s) => new Set(s).add(midi));
      setTimeout(() => {
        setPressed((s) => {
          const next = new Set(s);
          next.delete(midi);
          return next;
        });
      }, 180);
    },
    [onNote]
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const midi = KEYMAP[e.key.toLowerCase()];
      if (midi) {
        e.preventDefault();
        play(midi);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [play]);

  const whiteW = 44;

  return (
    <Modal title={`🎹 ${title}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          건반을 클릭하거나 키보드 <b className="text-slate-200">A S D F G H J K L ;</b>(흰건반),{" "}
          <b className="text-slate-200">W E T Y U O P</b>(검은건반)로 연주하세요. 근처에 있는
          사람들에게도 들려요.
        </p>

        <div className="relative mx-auto select-none" style={{ width: WHITE_KEYS.length * whiteW, height: 150 }}>
          {WHITE_KEYS.map((midi, i) => (
            <button
              key={midi}
              onPointerDown={() => play(midi)}
              className={`absolute top-0 rounded-b-md border border-slate-400 transition-colors ${
                pressed.has(midi) ? "bg-amber-200" : "bg-white hover:bg-slate-100"
              }`}
              style={{ left: i * whiteW, width: whiteW - 2, height: 150 }}
            >
              <span className="absolute inset-x-0 bottom-1 text-center text-[10px] text-slate-500">
                {NOTE_NAMES[midi % 12]}
              </span>
            </button>
          ))}
          {BLACK_KEYS.map(({ midi, after }) => (
            <button
              key={midi}
              onPointerDown={() => play(midi)}
              className={`absolute top-0 z-10 rounded-b-md border border-black transition-colors ${
                pressed.has(midi) ? "bg-amber-500" : "bg-slate-900 hover:bg-slate-700"
              }`}
              style={{ left: (after + 1) * whiteW - 14, width: 28, height: 92 }}
            />
          ))}
        </div>

        <div className="h-5 text-center text-sm text-accent2">
          {lastNote ? `♪ ${lastNote}` : ""}
        </div>
      </div>
    </Modal>
  );
}
