"use client";

// 단독 화이트보드 페이지 — 보드 전용 Realtime 채널로 실시간 협업 + 영속화.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import WhiteboardCanvas, { type WhiteboardHandle } from "./WhiteboardCanvas";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { saveWhiteboard } from "@/app/actions";
import type { WbOp } from "@/lib/realtime/protocol";

export default function WbPageClient({
  boardKey,
  configured,
  loggedIn,
}: {
  boardKey: string;
  configured: boolean;
  loggedIn: boolean;
}) {
  const boardRef = useRef<WhiteboardHandle>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const [initialOps, setInitialOps] = useState<WbOp[] | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setInitialOps([]);
        return;
      }
      const { data } = await supabase
        .from("whiteboards")
        .select("ops")
        .eq("board_key", boardKey)
        .maybeSingle();
      if (alive) setInitialOps(((data?.ops as WbOp[]) ?? []) as WbOp[]);
    })();
    return () => {
      alive = false;
    };
  }, [boardKey]);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const channel = supabase.channel(`wbpage:${boardKey}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "op" }, ({ payload }) =>
      boardRef.current?.applyRemote(payload as WbOp)
    );
    channel.subscribe();
    chanRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      chanRef.current = null;
    };
  }, [boardKey, configured]);

  const handleOp = useCallback(
    (op: WbOp) => {
      chanRef.current?.send({ type: "broadcast", event: "op", payload: op });
      if (!loggedIn) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveWhiteboard(boardKey, null, boardRef.current?.getOps().slice(-500) ?? []);
      }, 1500);
    },
    [boardKey, loggedIn]
  );

  if (initialOps === null) {
    return <p className="py-16 text-center text-slate-400">보드 불러오는 중...</p>;
  }

  return (
    <div className="card">
      <WhiteboardCanvas ref={boardRef} initialOps={initialOps} onOp={handleOp} height={560} />
      <div className="mt-3 flex items-center justify-end gap-2">
        {!loggedIn && (
          <span className="text-xs text-slate-500">게스트: 그리기는 가능하지만 저장되지 않아요</span>
        )}
        <button onClick={() => boardRef.current?.exportPng()} className="btn-ghost text-xs">
          💾 PNG 내보내기
        </button>
      </div>
    </div>
  );
}
