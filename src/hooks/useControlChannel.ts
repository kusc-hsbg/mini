"use client";

// 스페이스 컨트롤 채널 — 게스트 체크인(입장 요청/승인)에 사용.
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { ControlEvents } from "@/lib/realtime/protocol";

export interface ControlChannel {
  ready: boolean;
  send: <K extends keyof ControlEvents>(event: K, payload: ControlEvents[K]) => void;
}

export function useControlChannel(
  spaceId: string,
  enabled: boolean,
  handlers: {
    onCheckinRequest?: (p: ControlEvents["checkin-request"]) => void;
    onCheckinResult?: (p: ControlEvents["checkin-result"]) => void;
  }
): ControlChannel {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const chanRef = useRef<RealtimeChannel | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const channel = supabase.channel(`ctl:${spaceId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "checkin-request" }, ({ payload }) =>
      handlersRef.current.onCheckinRequest?.(payload as ControlEvents["checkin-request"])
    );
    channel.on("broadcast", { event: "checkin-result" }, ({ payload }) =>
      handlersRef.current.onCheckinResult?.(payload as ControlEvents["checkin-result"])
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setReady(true);
    });
    chanRef.current = channel;

    return () => {
      setReady(false);
      supabase.removeChannel(channel);
      chanRef.current = null;
    };
  }, [spaceId, enabled]);

  return {
    ready,
    send: (event, payload) => {
      chanRef.current?.send({ type: "broadcast", event, payload });
    },
  };
}
