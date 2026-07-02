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
  "reaction",
  "wave",
  "knock",
  "knock-result",
  "lock",
  "mod",
  "signal",
  "wb",
  "map-update",
  "desk-update",
];

// 한 방의 실시간 채널 (Supabase Realtime presence + broadcast).
export function useRoomChannel(
  channelKey: string,
  playerId: string,
  enabled: boolean,
  handlers: RoomChannelHandlers
): RoomChannel {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const chanRef = useRef<RealtimeChannel | null>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(1);

  useEffect(() => {
    if (!enabled || playerId === "pending") return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const channel = supabase.channel(`rt:${channelKey}`, {
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
      if (status === "SUBSCRIBED") setReady(true);
    });
    chanRef.current = channel;

    return () => {
      setReady(false);
      supabase.removeChannel(channel);
      chanRef.current = null;
    };
  }, [channelKey, playerId, enabled]);

  return {
    ready,
    online,
    track: (state) => {
      chanRef.current?.track(state);
    },
    send: (event, payload) => {
      chanRef.current?.send({ type: "broadcast", event, payload });
    },
  };
}
