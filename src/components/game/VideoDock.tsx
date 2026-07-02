"use client";

// 상단 비디오 독 — 내 카메라 + 연결된 피어들의 카메라/화면공유.
// 화면공유 타일 클릭 → 전체 보기 + 화면 주석(공동 드로잉).
import { useEffect, useRef, useState } from "react";
import WhiteboardCanvas, { type WhiteboardHandle } from "./WhiteboardCanvas";
import type { RemotePeer } from "@/hooks/useWebRTC";
import type { WbOp } from "@/lib/realtime/protocol";

function VideoTile({
  stream,
  muted,
  label,
  badge,
  onClick,
  big,
}: {
  stream: MediaStream;
  muted?: boolean;
  label: string;
  badge?: string;
  onClick?: () => void;
  big?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  const hasVideo = stream.getVideoTracks().length > 0;

  return (
    <button
      onClick={onClick}
      className={`group relative shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/60 ${
        big ? "h-full w-full" : "h-24 w-32"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${hasVideo ? "" : "hidden"}`}
      />
      {!hasVideo && (
        <div className="grid h-full w-full place-items-center text-2xl">🎙️</div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
        <span className="truncate text-[10px] text-white">{label}</span>
        {badge && <span className="text-[10px]">{badge}</span>}
      </div>
    </button>
  );
}

export default function VideoDock({
  localStream,
  localScreen,
  peers,
  nameOf,
  spotlightIds,
  selfName,
  sendAnnot,
  subscribeAnnot,
}: {
  localStream: MediaStream | null;
  localScreen: MediaStream | null;
  peers: RemotePeer[];
  nameOf: (id: string) => string;
  spotlightIds: Set<string>;
  selfName: string;
  sendAnnot: (board: string, op: WbOp) => void;
  subscribeAnnot: (fn: (board: string, op: WbOp) => void) => () => void;
}) {
  const [focus, setFocus] = useState<{ stream: MediaStream; label: string; ownerId: string } | null>(null);
  const [annotOn, setAnnotOn] = useState(false);
  const annotRef = useRef<WhiteboardHandle>(null);

  // 포커스 스트림이 사라지면 닫기
  useEffect(() => {
    if (!focus) return;
    const still =
      (localScreen && focus.stream.id === localScreen.id) ||
      peers.some((p) => p.screen?.id === focus.stream.id || p.stream?.id === focus.stream.id);
    if (!still) setFocus(null);
  }, [peers, localScreen, focus]);

  // 주석 원격 수신
  useEffect(() => {
    if (!focus || !annotOn) return;
    return subscribeAnnot((board, op) => {
      if (board === `annot:${focus.ownerId}`) annotRef.current?.applyRemote(op);
    });
  }, [focus, annotOn, subscribeAnnot]);

  const hasLocal = localStream && localStream.getTracks().length > 0;
  const tiles: React.ReactNode[] = [];

  if (hasLocal) {
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
  if (localScreen) {
    tiles.push(
      <VideoTile
        key="self-screen"
        stream={localScreen}
        muted
        label="내 화면 공유"
        badge="🖥️"
        onClick={() => setFocus({ stream: localScreen, label: "내 화면", ownerId: "self" })}
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
    if (p.screen) {
      tiles.push(
        <VideoTile
          key={`${p.id}-screen`}
          stream={p.screen}
          label={`${nameOf(p.id)}의 화면`}
          badge="🖥️"
          onClick={() => setFocus({ stream: p.screen!, label: `${nameOf(p.id)}의 화면`, ownerId: p.id })}
        />
      );
    }
  }

  if (tiles.length === 0 && !focus) return null;

  return (
    <>
      <div className="pointer-events-auto flex max-w-[70vw] gap-2 overflow-x-auto rounded-2xl bg-panel/70 p-2 backdrop-blur">
        {tiles}
      </div>

      {focus && (
        <div className="absolute inset-0 z-40 flex flex-col bg-black/85 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-white">🖥️ {focus.label}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setAnnotOn((v) => !v)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  annotOn ? "bg-accent text-white" : "bg-panel2 text-slate-300"
                }`}
              >
                ✏️ 주석 {annotOn ? "켜짐" : "끄기"}
              </button>
              <button
                onClick={() => {
                  setFocus(null);
                  setAnnotOn(false);
                }}
                className="rounded-lg bg-panel2 px-3 py-1.5 text-sm text-slate-300 hover:text-white"
              >
                ✕ 닫기
              </button>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl">
            <VideoTile stream={focus.stream} muted label={focus.label} big />
            {annotOn && (
              <div className="absolute inset-0">
                <WhiteboardCanvas
                  ref={annotRef}
                  initialOps={[]}
                  transparent
                  height={9999}
                  onOp={(op) => sendAnnot(`annot:${focus.ownerId}`, op)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
