"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { RtEventName, RtEvents } from "@/lib/realtime/protocol";
import type { PlayerState } from "@/lib/game/types";

export interface RoomChannelHandlers {
  onRosterSync: (players: PlayerState[]) => void;
  onEvent: <K extends RtEventName>(event: K, payload: RtEvents[K]) => void;
}

export interface RoomChannel {
  ready: boolean;
  online: number;
  track: (state: PlayerState) => void;
  send: <K extends RtEventName>(event: K, payload: RtEvents[K]) => void;
}

const EVENTS: RtEventName[] = [
  "move",
  "emote",
  "chat",
  "wave",
  "knock",
  "knock-result",
  "lock",
  "mod",
  "wb",
  "map-update",
  "desk-update",
  "race",
  "piano",
  "shot",
  "kill",
  "obj-place",
  "obj-remove",
  "quiz",
  "boss",
  "boss-dmg",
  "ride-req",
  "ride-ok",
  "ride-end",
  "party-warp",
];

// 한 방의 실시간 채널 (Supabase Realtime presence + broadcast).
// 방 이동/재마운트 시 같은 토픽의 잔여 채널을 정리하고,
// 구독 실패(CHANNEL_ERROR/TIMED_OUT) 시 자동으로 재접속한다.
export function useRoomChannel(
  channelKey: string,
  playerId: string,
  enabled: boolean,
  handlers: RoomChannelHandlers
): RoomChannel {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const chanRef = useRef<RealtimeChannel | null>(null);
  const lastStateRef = useRef<PlayerState | null>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(1);

  useEffect(() => {
    if (!enabled || playerId === "pending") return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const topic = `rt:${channelKey}`;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;

      // 같은 토픽의 이전 채널이 남아 있으면(빠른 방 이동/재마운트) 먼저 제거 —
      // 정리 전에 재구독하면 조인이 실패해 "상대가 멈춰 보이는" 채널이 된다.
      for (const ch of supabase.getChannels()) {
        if (ch.topic === `realtime:${topic}`) supabase.removeChannel(ch);
      }

      const channel = supabase.channel(topic, {
        config: { presence: { key: playerId }, broadcast: { self: false } },
      });

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PlayerState>();
        const players: PlayerState[] = [];
        for (const key of Object.keys(state)) {
          const metas = state[key];
          if (metas && metas.length) players.push(metas[0] as PlayerState);
        }
        setOnline(players.length || 1);
        handlersRef.current.onRosterSync(players);
      });

      for (const ev of EVENTS) {
        channel.on("broadcast", { event: ev }, ({ payload }) =>
          handlersRef.current.onEvent(ev, payload as never)
        );
      }

      channel.subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          setReady(true);
          // 구독(재구독 포함) 즉시 내 presence 를 등록해야
          // 다른 클라이언트의 접속 인원/명단이 바로 갱신된다.
          const last = lastStateRef.current;
          if (last) channel.track(last);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          // 조인 실패/유실 — 채널을 새로 만들어 재접속
          setReady(false);
          if (!retryTimer) {
            retryTimer = setTimeout(() => {
              retryTimer = null;
              connect();
            }, 1200);
          }
        }
      });
      chanRef.current = channel;
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      setReady(false);
      const ch = chanRef.current;
      if (ch) supabase.removeChannel(ch);
      chanRef.current = null;
    };
  }, [channelKey, playerId, enabled]);

  return {
    ready,
    online,
    track: (state) => {
      lastStateRef.current = state;
      chanRef.current?.track(state);
    },
    send: (event, payload) => {
      chanRef.current?.send({ type: "broadcast", event, payload });
    },
  };
}
