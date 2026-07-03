"use client";

// 상단 비디오 독 — 내 카메라 + 근접 연결된 피어들의 카메라.
import { useEffect, useRef } from "react";
import type { RemotePeer } from "@/hooks/useWebRTC";

function VideoTile({
  stream,
  muted,
  label,
  badge,
}: {
  stream: MediaStream;
  muted?: boolean;
  label: string;
  badge?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  const hasVideo = stream.getVideoTracks().length > 0;

  return (
    <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/60">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${hasVideo ? "" : "hidden"}`}
      />
      {!hasVideo && (
        <div className="grid h-full w-full place-items-center text-2xl">📷</div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
        <span className="truncate text-[10px] text-white">{label}</span>
        {badge && <span className="text-[10px]">{badge}</span>}
      </div>
    </div>
  );
}

export default function VideoDock({
  localStream,
  peers,
  nameOf,
  spotlightIds,
  selfName,
}: {
  localStream: MediaStream | null;
  peers: RemotePeer[];
  nameOf: (id: string) => string;
  spotlightIds: Set<string>;
  selfName: string;
}) {
  const tiles: React.ReactNode[] = [];

  if (localStream && localStream.getTracks().length > 0) {
    tiles.push(
      <VideoTile
        key="self"
        stream={localStream}
        muted
        label={`${selfName} (나)`}
        badge={spotlightIds.has("self") ? "🎤" : undefined}
      />
    );
  }
  for (const p of peers) {
    if (p.stream && p.stream.getTracks().length > 0) {
      tiles.push(
        <VideoTile
          key={p.id}
          stream={p.stream}
          label={nameOf(p.id)}
          badge={spotlightIds.has(p.id) ? "🎤" : undefined}
        />
      );
    }
  }

  if (tiles.length === 0) return null;

  return (
    <div className="pointer-events-auto flex max-w-[70vw] gap-2 overflow-x-auto rounded-2xl bg-panel/70 p-2 backdrop-blur">
      {tiles}
    </div>
  );
}
