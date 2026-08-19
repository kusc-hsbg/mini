"use client";

// 게임 내부에서 옷/헤어/코스튬을 바꾸는 모달 — 실시간으로 내 아바타에 반영된다.
import { useState } from "react";
import { Modal } from "./ui";
import CharacterPreview from "../CharacterPreview";
import {
  BODY_COLORS,
  DEFAULT_HEAD_STYLE,
  HEAD_STYLES,
  PANTS_COLORS,
  SHOES_COLORS,
  SPECIALS,
  TOP_STYLES,
  headImgUrl,
  resolveHeadImgKey,
} from "@/lib/game/constants";
import type { CharacterAppearance, Direction, SpecialType, TopStyleType } from "@/lib/game/types";

export default function OutfitModal({
  initial,
  name,
  onChange,
  onSave,
  onClose,
  saving,
  savedMsg,
}: {
  initial: CharacterAppearance;
  name: string;
  onChange: (app: CharacterAppearance) => void;
  onSave: (app: CharacterAppearance) => void;
  onClose: () => void;
  saving?: boolean;
  savedMsg?: string | null;
}) {
  const [app, setApp] = useState<CharacterAppearance>({ ...initial });
  const [dir, setDir] = useState<Direction>("down");

  const patch = (p: Partial<CharacterAppearance>) =>
    setApp((a) => {
      const next = { ...a, ...p };
      onChange(next); // 실시간으로 내 캐릭터에 반영
      return next;
    });

  return (
    <Modal title="👗 옷장 · 캐릭터 꾸미기" onClose={onClose} wide>
      <div className="grid gap-5 sm:grid-cols-[190px_1fr]">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl border-2 border-white bg-gradient-to-b from-sky-50 to-white p-2 shadow-sm">
            <CharacterPreview appearance={app} name={name} dir={dir} />
          </div>
          <div className="flex gap-1.5">
            {(["down", "left", "up", "right"] as Direction[]).map((d) => (
              <button
                key={d}
                onClick={() => setDir(d)}
                className={`rounded-full border-2 px-3 py-1 text-xs font-bold transition ${
                  dir === d
                    ? "border-accent bg-accent text-white"
                    : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
                }`}
              >
                {d === "down" ? "앞" : d === "up" ? "뒤" : d === "left" ? "좌" : "우"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Section label="✨ 특별 헤어 스타일">
            <button
              onClick={() => patch({ headImg: DEFAULT_HEAD_STYLE })}
              className={`grid h-12 w-12 place-items-center rounded-xl border-2 text-[10px] font-bold transition ${
                resolveHeadImgKey(app.headImg) === DEFAULT_HEAD_STYLE
                  ? "border-accent bg-accent text-white"
                  : "border-white bg-white text-stone-500 hover:bg-stone-50"
              }`}
            >
              기본
            </button>
            {HEAD_STYLES.map((h) => (
              <button
                key={h.key}
                onClick={() => patch({ headImg: h.key })}
                title={h.label}
                className={`relative h-12 w-12 overflow-hidden rounded-xl border-2 bg-white transition hover:brightness-105 ${
                  resolveHeadImgKey(app.headImg) === h.key ? "border-accent ring-2 ring-accent" : "border-white"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={headImgUrl(h.key)} alt={h.label} className="h-full w-full scale-[1.7] object-contain" />
              </button>
            ))}
          </Section>

          <Section label="상의 스타일">
            {TOP_STYLES.map((t) => (
              <Chip key={t.key} active={app.topStyle === t.key} onClick={() => patch({ topStyle: t.key as TopStyleType })}>
                {t.label}
              </Chip>
            ))}
          </Section>
          <Section label={app.topStyle === "suit" ? "넥타이 색" : "상의 색"}>
            {BODY_COLORS.map((cc) => (
              <Swatch key={cc} color={cc} active={app.color === cc} onClick={() => patch({ color: cc })} />
            ))}
          </Section>
          <Section label="하의 색">
            {PANTS_COLORS.map((cc) => (
              <Swatch key={cc} color={cc} active={app.pants === cc} onClick={() => patch({ pants: cc })} />
            ))}
          </Section>
          <Section label="신발 색">
            {SHOES_COLORS.map((cc) => (
              <Swatch key={cc} color={cc} active={app.shoes === cc} onClick={() => patch({ shoes: cc })} />
            ))}
          </Section>
          <Section label="스페셜 코스튬">
            {SPECIALS.map((s) => (
              <Chip key={s.key} active={app.special === s.key} onClick={() => patch({ special: s.key as SpecialType })}>
                {s.label}
              </Chip>
            ))}
          </Section>

          <div className="flex items-center gap-3">
            <button onClick={() => onSave(app)} disabled={saving} className="btn-primary">
              {saving ? "저장 중..." : "저장하기"}
            </button>
            {savedMsg && <span className="text-sm font-bold text-emerald-500">{savedMsg}</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border-2 px-3 py-1.5 text-sm font-bold transition ${
        active ? "border-accent bg-accent text-white" : "border-white bg-white text-stone-500 hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}

function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={color}
      className={`h-8 w-8 rounded-full border-2 transition hover:scale-110 ${
        active ? "border-accent ring-2 ring-accent" : "border-white"
      }`}
      style={{ backgroundColor: color }}
    />
  );
}
