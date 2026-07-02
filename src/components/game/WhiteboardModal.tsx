"use client";

// 화이트보드 모달 — 실시간 동기화(broadcast) + Supabase 영속화 + PNG/URL 공유.
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./ui";
import WhiteboardCanvas, { type WhiteboardHandle } from "./WhiteboardCanvas";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { saveWhiteboard } from "@/app/actions";
import type { WbOp } from "@/lib/realtime/protocol";

export default function WhiteboardModal({
  boardKey,
  spaceId,
  title,
  canPersist,
  onClose,
  sendOp,
  subscribeRemote,
}: {
  boardKey: string;
  spaceId: string | null;
  title: string;
  canPersist: boolean;
  onClose: () => void;
  sendOp: (board: string, op: WbOp) => void;
  subscribeRemote: (fn: (board: string, op: WbOp) => void) => () => void;
}) {
  const boardRef = useRef<WhiteboardHandle>(null);
  const [initialOps, setInitialOps] = useState<WbOp[] | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 저장된 보드 불러오기
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

  // 원격 오퍼레이션 수신
  useEffect(() => {
    return subscribeRemote((board, op) => {
      if (board === boardKey) boardRef.current?.applyRemote(op);
    });
  }, [boardKey, subscribeRemote]);

  const persist = useCallback(() => {
    if (!canPersist) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const ops = boardRef.current?.getOps() ?? [];
      saveWhiteboard(boardKey, spaceId, ops.slice(-500));
    }, 1500);
  }, [boardKey, spaceId, canPersist]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (canPersist) {
          const ops = boardRef.current?.getOps() ?? [];
          saveWhiteboard(boardKey, spaceId, ops.slice(-500));
        }
      }
    };
  }, [boardKey, spaceId, canPersist]);

  const handleOp = useCallback(
    (op: WbOp) => {
      sendOp(boardKey, op);
      persist();
    },
    [boardKey, sendOp, persist]
  );

  return (
    <Modal title={`🖊️ ${title}`} onClose={onClose} wide>
      {initialOps === null ? (
        <p className="py-10 text-center text-slate-400">보드 불러오는 중...</p>
      ) : (
        <div className="space-y-3">
          <WhiteboardCanvas ref={boardRef} initialOps={initialOps} onOp={handleOp} />
          <div className="flex items-center justify-end gap-2 text-sm">
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/wb/${encodeURIComponent(boardKey)}`
                );
              }}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              🔗 공유 URL 복사
            </button>
            <button
              onClick={() => boardRef.current?.exportPng()}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              💾 PNG 내보내기
            </button>
            {!canPersist && (
              <span className="text-xs text-slate-500">(게스트: 실시간만, 저장 안 됨)</span>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
