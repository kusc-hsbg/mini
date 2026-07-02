"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CharacterPreview from "./CharacterPreview";
import { saveProfile } from "@/app/actions";
import {
  BODY_COLORS,
  FACES,
  HAIRS,
  HAIR_COLORS,
  HATS,
  PANTS_COLORS,
  SKIN_TONES,
} from "@/lib/game/constants";
import type {
  CharacterAppearance,
  Direction,
  FaceType,
  HairType,
  HatType,
  Profile,
} from "@/lib/game/types";

const GUEST_KEY = "pixeltown:guest-appearance";

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
  const [dir, setDir] = useState<Direction>("down");

  const initial = useMemo<CharacterAppearance & { name: string }>(() => {
    if (profile) {
      return {
        name: profile.display_name,
        skin: profile.skin,
        color: profile.color,
        pants: profile.pants ?? PANTS_COLORS[0],
        hair: (profile.hair as HairType) ?? "short",
        hairColor: profile.hair_color ?? HAIR_COLORS[1],
        hat: profile.hat as HatType,
        face: profile.face as FaceType,
      };
    }
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        if (raw) {
          const g = JSON.parse(raw);
          return {
            name: g.name ?? "게스트",
            skin: g.skin ?? SKIN_TONES[1],
            color: g.color ?? BODY_COLORS[0],
            pants: g.pants ?? PANTS_COLORS[0],
            hair: g.hair ?? "short",
            hairColor: g.hairColor ?? HAIR_COLORS[1],
            hat: g.hat ?? "none",
            face: g.face ?? "smile",
          };
        }
      } catch {}
    }
    return {
      name: "게스트",
      skin: SKIN_TONES[1],
      color: BODY_COLORS[0],
      pants: PANTS_COLORS[0],
      hair: "short" as HairType,
      hairColor: HAIR_COLORS[1],
      hat: "none" as HatType,
      face: "smile" as FaceType,
    };
  }, [profile]);

  const [name, setName] = useState(initial.name);
  const [skin, setSkin] = useState(initial.skin);
  const [color, setColor] = useState(initial.color);
  const [pants, setPants] = useState(initial.pants);
  const [hair, setHair] = useState<HairType>(initial.hair);
  const [hairColor, setHairColor] = useState(initial.hairColor);
  const [hat, setHat] = useState<HatType>(initial.hat);
  const [face, setFace] = useState<FaceType>(initial.face);

  const appearance: CharacterAppearance = { skin, color, pants, hair, hairColor, hat, face };

  function handleSave() {
    setSaved(false);
    if (configured && profile) {
      startTransition(async () => {
        const res = await saveProfile({
          display_name: name,
          skin,
          color,
          pants,
          hair,
          hair_color: hairColor,
          hat,
          face,
        });
        if (!("error" in res)) {
          setSaved(true);
          router.push("/spaces");
        }
      });
    } else {
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify({ name, ...appearance }));
      } catch {}
      setSaved(true);
      router.push("/spaces");
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[220px,1fr]">
      <div className="flex flex-col items-center gap-3">
        <CharacterPreview appearance={appearance} name={name} dir={dir} />
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
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm text-slate-300">닉네임</label>
          <input
            className="input"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder="표시될 이름"
          />
        </div>

        <Section label="피부톤">
          {SKIN_TONES.map((c) => (
            <Swatch key={c} color={c} active={skin === c} onClick={() => setSkin(c)} />
          ))}
        </Section>

        <Section label="헤어스타일">
          {HAIRS.map((h) => (
            <Chip key={h.key} active={hair === h.key} onClick={() => setHair(h.key as HairType)}>
              {h.label}
            </Chip>
          ))}
        </Section>

        <Section label="머리 색">
          {HAIR_COLORS.map((c) => (
            <Swatch key={c} color={c} active={hairColor === c} onClick={() => setHairColor(c)} />
          ))}
        </Section>

        <Section label="상의 색">
          {BODY_COLORS.map((c) => (
            <Swatch key={c} color={c} active={color === c} onClick={() => setColor(c)} />
          ))}
        </Section>

        <Section label="하의 색">
          {PANTS_COLORS.map((c) => (
            <Swatch key={c} color={c} active={pants === c} onClick={() => setPants(c)} />
          ))}
        </Section>

        <Section label="모자·액세서리">
          {HATS.map((h) => (
            <Chip key={h.key} active={hat === h.key} onClick={() => setHat(h.key as HatType)}>
              {h.label}
            </Chip>
          ))}
        </Section>

        <Section label="표정">
          {FACES.map((f) => (
            <Chip key={f.key} active={face === f.key} onClick={() => setFace(f.key as FaceType)}>
              {f.label}
            </Chip>
          ))}
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={pending} className="btn-primary">
            {pending ? "저장 중..." : "저장하고 입장 →"}
          </button>
          {saved && <span className="text-sm text-accent2">저장됨!</span>}
          {!profile && (
            <span className="text-xs text-slate-500">(게스트: 이 브라우저에만 저장)</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm text-slate-300">{label}</div>
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
        active ? "bg-accent text-white" : "bg-panel2 text-slate-300 hover:bg-panel2/70"
      }`}
    >
      {children}
    </button>
  );
}
