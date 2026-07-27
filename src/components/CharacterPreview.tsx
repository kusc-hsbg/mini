"use client";

import { useEffect, useRef } from "react";
import { drawCharacter } from "@/lib/game/sprites";
import type { CharacterAppearance, Direction } from "@/lib/game/types";

export default function CharacterPreview({
  appearance,
  name,
  dir = "down",
  onBike = false,
  size = 180,
}: {
  appearance: CharacterAppearance;
  name: string;
  dir?: Direction;
  onBike?: boolean;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let mounted = true;

    const render = (t: number) => {
      if (!mounted) return;
      ctx.clearRect(0, 0, size, size);
      const sky = ctx.createLinearGradient(0, 0, 0, size);
      sky.addColorStop(0, "#dff7ff");
      sky.addColorStop(0.62, "#f8fbff");
      sky.addColorStop(1, "#d8f3d2");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "rgba(90, 190, 128, 0.20)";
      ctx.beginPath();
      ctx.ellipse(size / 2, size - 28, size * 0.38, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      // 걷기 미리보기
      drawCharacter(
        ctx,
        size / 2,
        size / 2 + 44,
        appearance,
        dir,
        true,
        onBike,
        t,
        name || "나",
        true
      );
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
    };
  }, [appearance, name, dir, onBike, size]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="rounded-xl border border-white/10"
    />
  );
}
