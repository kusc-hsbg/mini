"use client";

// 캐릭터 커스터마이즈 — 게더타운식 카테고리:
// Base(피부/헤어/수염) · 의류(상의/하의/신발) · 액세서리(모자/안경) · 표정 · 스페셜
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CharacterPreview from "./CharacterPreview";
import { saveProfile } from "@/app/actions";
import {
  BODY_COLORS,
  DEFAULT_HEAD_STYLE,
  HAIR_COLORS,
  HEAD_STYLES,
  PANTS_COLORS,
  SHOES_COLORS,
  SKIN_TONES,
  SPECIALS,
  TOP_STYLES,
  headImgUrl,
  normalizeSpecial,
  resolveHeadImgKey,
} from "@/lib/game/constants";
import type {
  CharacterAppearance,
  Direction,
  FaceType,
  FacialHairType,
  GlassesType,
  HairType,
  HatType,
  Profile,
  SpecialType,
  TopStyleType,
} from "@/lib/game/types";

const GUEST_KEY = "pixeltown:guest-appearance";

type TabKey = "base" | "clothing" | "special";
const TABS: { key: TabKey; label: string }[] = [
  { key: "base", label: "🧑 베이스" },
  { key: "clothing", label: "👕 의류" },
  { key: "special", label: "✨ 스페셜" },
];

export default function CustomizeForm({
  profile,
  configured,
}: {
  profile: Profile | null;
  configured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dir, setDir] = useState<Direction>("down");
  const [tab, setTab] = useState<TabKey>("base");

  const initial = useMemo<CharacterAppearance & { name: string }>(() => {
    const def: CharacterAppearance & { name: string } = {
      name: "게스트",
      skin: SKIN_TONES[1],
      color: BODY_COLORS[0],
      topStyle: "tshirt",
      pants: PANTS_COLORS[0],
      shoes: SHOES_COLORS[0],
      hair: "short",
      hairColor: HAIR_COLORS[1],
      facialHair: "none",
      hat: "none",
      glasses: "none",
      face: "smile",
      special: "none",
      headImg: DEFAULT_HEAD_STYLE,
      nameAbove: true,
    };
    if (profile) {
      return {
        ...def,
        name: profile.display_name,
        skin: profile.skin,
        color: profile.color,
        topStyle: (profile.top_style as TopStyleType) ?? "tshirt",
        pants: profile.pants ?? def.pants,
        shoes: profile.shoes ?? def.shoes,
        hair: (profile.hair as HairType) ?? "short",
        hairColor: profile.hair_color ?? def.hairColor,
        facialHair: (profile.facial_hair as FacialHairType) ?? "none",
        hat: profile.hat as HatType,
        glasses: (profile.glasses as GlassesType) ?? "none",
        face: profile.face as FaceType,
        special: normalizeSpecial(profile.special),
        headImg: resolveHeadImgKey(profile.head_img),
        // 닉네임은 항상 머리 위로 (토글 제거 — 기본값 고정)
        nameAbove: true,
      };
    }
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        if (raw) {
          const g = { ...def, ...JSON.parse(raw) };
          g.special = normalizeSpecial(g.special);
          g.headImg = resolveHeadImgKey(g.headImg);
          g.nameAbove = true; // 닉네임 머리 위 고정
          return g;
        }
      } catch {}
    }
    return def;
  }, [profile]);

  const [name, setName] = useState(initial.name);
  const [app, setApp] = useState<CharacterAppearance>({ ...initial });

  const patch = (p: Partial<CharacterAppearance>) => setApp((a) => ({ ...a, ...p }));

  function handleSave() {
    setSaved(false);
    setSaveError(null);
    if (configured && profile) {
      startTransition(async () => {
        const res = await saveProfile({
          display_name: name,
          skin: app.skin,
          color: app.color,
          top_style: app.topStyle,
          pants: app.pants,
          shoes: app.shoes,
          hair: app.hair,
          hair_color: app.hairColor,
          facial_hair: app.facialHair,
          hat: app.hat,
          glasses: app.glasses,
          face: app.face,
          special: app.special,
          head_img: resolveHeadImgKey(app.headImg),
          name_above: app.nameAbove ?? false,
        });
        if ("error" in res) {
          // 실패를 조용히 삼키면 "입장 버튼이 안 눌리는" 것처럼 보인다 — 반드시 표시.
          setSaveError(res.error);
          return;
        }
        setSaved(true);
        router.push("/spaces");
        router.refresh();
      });
    } else {
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify({ name, ...app }));
      } catch {}
      setSaved(true);
      router.push("/spaces");
    }
  }

  function randomize() {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    setApp((a) => ({
      ...a,
      color: pick(BODY_COLORS),
      topStyle: pick(TOP_STYLES).key as TopStyleType,
      pants: pick(PANTS_COLORS),
      shoes: pick(SHOES_COLORS),
      facialHair: "none",
      glasses: "none",
      special: "none",
      headImg: pick(HEAD_STYLES).key,
      nameAbove: true,
    }));
  }

  return (
    <div className="grid gap-8 md:grid-cols-[220px,1fr]">
      <div className="flex flex-col items-center gap-3">
        <CharacterPreview appearance={app} name={name} dir={dir} />
        <div className="flex gap-2">
          {(["down", "left", "up", "right"] as Direction[]).map((d) => (
            <button
              key={d}
              onClick={() => setDir(d)}
              className={`btn-ghost px-3 py-1 text-xs ${dir === d ? "ring-1 ring-accent" : ""}`}
            >
              {d === "down" ? "앞" : d === "up" ? "뒤" : d === "left" ? "좌" : "우"}
            </button>
          ))}
        </div>
        <button onClick={randomize} className="btn-ghost w-full text-sm">
          🎲 랜덤
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-stone-600">닉네임</label>
          <input
            className="input"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder="표시될 이름"
          />
        </div>

        {/* 카테고리 탭 */}
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                tab === t.key ? "bg-accent text-white" : "bg-panel2 text-stone-600 hover:bg-panel2/70"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-[280px] space-y-5 rounded-xl bg-panel2/40 p-4">
          {tab === "base" && (
            <>
              <Section label="✨ 특별 헤어 스타일 (이미지)">
                <button
                  onClick={() => patch({ headImg: DEFAULT_HEAD_STYLE })}
                  className={`grid h-14 w-14 place-items-center rounded-xl px-1 text-center text-[10px] leading-tight transition ${
                    resolveHeadImgKey(app.headImg) === DEFAULT_HEAD_STYLE
                      ? "bg-accent text-white ring-2 ring-accent"
                      : "bg-panel2 text-stone-600 hover:bg-panel2/70"
                  }`}
                >
                  기본 캐릭터
                </button>
                {HEAD_STYLES.map((h) => (
                  <button
                    key={h.key}
                    onClick={() => patch({ headImg: h.key })}
                    title={h.label}
                    className={`relative h-14 w-14 overflow-hidden rounded-xl bg-panel2 transition hover:brightness-110 ${
                      resolveHeadImgKey(app.headImg) === h.key ? "ring-2 ring-accent" : ""
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={headImgUrl(h.key)}
                      alt={h.label}
                      className="h-full w-full scale-[1.7] object-contain"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[9px] text-white">
                      {h.label}
                    </span>
                  </button>
                ))}
              </Section>
            </>
          )}

          {tab === "clothing" && (
            <>
              <Section label="상의 스타일">
                {TOP_STYLES.map((t) => (
                  <Chip
                    key={t.key}
                    active={app.topStyle === t.key}
                    onClick={() => patch({ topStyle: t.key as TopStyleType })}
                  >
                    {t.label}
                  </Chip>
                ))}
              </Section>
              <Section label={app.topStyle === "suit" ? "넥타이 색" : "상의 색"}>
                {BODY_COLORS.map((c) => (
                  <Swatch key={c} color={c} active={app.color === c} onClick={() => patch({ color: c })} />
                ))}
              </Section>
              <Section label="하의 색">
                {PANTS_COLORS.map((c) => (
                  <Swatch key={c} color={c} active={app.pants === c} onClick={() => patch({ pants: c })} />
                ))}
              </Section>
              <Section label="신발 색">
                {SHOES_COLORS.map((c) => (
                  <Swatch key={c} color={c} active={app.shoes === c} onClick={() => patch({ shoes: c })} />
                ))}
              </Section>
            </>
          )}

          {tab === "special" && (
            <>
              <Section label="스페셜 코스튬">
                {SPECIALS.map((s) => (
                  <Chip
                    key={s.key}
                    active={app.special === s.key}
                    onClick={() => patch({ special: s.key as SpecialType })}
                  >
                    {s.label}
                  </Chip>
                ))}
              </Section>
              <p className="text-xs text-stone-500">
                💡 게임 안에서 <b>Z 키</b>를 누르면 춤을 출 수 있어요!
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={handleSave} disabled={pending} className="btn-primary">
            {pending ? "저장 중..." : "저장하고 입장 →"}
          </button>
          {saved && <span className="text-sm text-accent2">저장됨!</span>}
          {!profile && <span className="text-xs text-stone-500">(게스트: 이 브라우저에만 저장)</span>}
        </div>
        {saveError && (
          <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
            저장에 실패했습니다: {saveError}
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm text-stone-600">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Swatch({
  color,
  active,
  onClick,
}: {
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`swatch ${active ? "swatch-active" : ""}`}
      style={{ backgroundColor: color }}
      aria-label={color}
    />
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm transition ${
        active ? "bg-accent text-white" : "bg-panel2 text-stone-600 hover:bg-panel2/70"
      }`}
    >
      {children}
    </button>
  );
}
