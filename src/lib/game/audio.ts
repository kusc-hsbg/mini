"use client";

// 피아노 음 재생 — WebAudio 신디사이저 (외부 오디오 에셋 0개).
// midi 노트 번호(60 = C4)와 볼륨(0..1)을 받아 짧은 피아노풍 톤을 낸다.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function playPianoNote(midi: number, volume = 1) {
  const ctx = getCtx();
  if (!ctx || volume <= 0.01) return;
  const t = ctx.currentTime;
  const freq = midiToFreq(midi);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.28 * volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  gain.connect(ctx.destination);

  // 기음 + 옥타브 배음으로 피아노 비슷한 음색
  const osc1 = ctx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = freq;
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.35;

  osc1.connect(gain);
  osc2.connect(g2);
  g2.connect(gain);

  osc1.start(t);
  osc2.start(t);
  osc1.stop(t + 1.5);
  osc2.stop(t + 1.5);
}
