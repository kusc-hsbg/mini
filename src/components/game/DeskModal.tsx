"use client";

// 데스크 상호작용: 자리 지정 / 해제 / 꾸미기 / 쪽지·선물 남기기.
import { useState, useTransition } from "react";
import { Modal } from "./ui";
import { claimDesk, leaveDeskNote, releaseDesk, updateDeskDecor } from "@/app/actions";
import { GIFT_EMOJIS } from "@/lib/game/constants";
import type { MapObject } from "@/lib/game/maps";
import type { DeskRecord } from "@/lib/game/types";

const RUGS = ["#7c5cd6", "#0d9488", "#b45309", "#9f1239"];

export default function DeskModal({
  obj,
  desk,
  spaceId,
  roomId,
  myId,
  myName,
  loggedIn,
  onChanged,
  onClose,
}: {
  obj: MapObject;
  desk: DeskRecord | null;
  spaceId: string;
  roomId: string;
  myId: string;
  myName: string;
  loggedIn: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [gift, setGift] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMine = desk?.owner_id === myId;
  const title = obj.name ?? "데스크";

  function run(fn: () => Promise<{ error?: string } | { ok: true }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ("error" in res && res.error) setError(res.error);
      else {
        onChanged();
      }
    });
  }

  return (
    <Modal title={`💻 ${title}`} onClose={onClose}>
      <div className="space-y-4">
        {desk ? (
          <p className="text-sm text-slate-300">
            <b className="text-white">{desk.owner_name}</b> 님의 데스크입니다.
          </p>
        ) : (
          <p className="text-sm text-slate-400">아직 주인이 없는 자리입니다.</p>
        )}

        {/* 자리 지정 */}
        {!desk && loggedIn && (
          <button
            disabled={pending}
            onClick={() => run(() => claimDesk(spaceId, roomId, obj.id, myName))}
            className="btn-primary w-full"
          >
            📍 내 자리로 지정하기
          </button>
        )}
        {!desk && !loggedIn && (
          <p className="text-xs text-slate-500">로그인하면 자리를 지정할 수 있습니다.</p>
        )}

        {/* 내 데스크 관리 */}
        {isMine && (
          <div className="space-y-3 rounded-xl bg-panel2 p-3">
            <div>
              <div className="mb-1.5 text-xs text-slate-400">러그 색 (자리 꾸미기)</div>
              <div className="flex gap-2">
                {RUGS.map((c) => (
                  <button
                    key={c}
                    onClick={() =>
                      run(() => updateDeskDecor(spaceId, { ...(desk?.decor ?? {}), rug: c }))
                    }
                    className={`h-7 w-7 rounded-full border-2 ${
                      desk?.decor?.rug === c ? "border-white" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={!!desk?.decor?.plant}
                onChange={(e) =>
                  run(() =>
                    updateDeskDecor(spaceId, { ...(desk?.decor ?? {}), plant: e.target.checked })
                  )
                }
                className="h-4 w-4 accent-[#6c8cff]"
              />
              🌿 화분 놓기
            </label>
            <button
              disabled={pending}
              onClick={() => run(() => releaseDesk(spaceId))}
              className="btn-ghost w-full text-sm text-red-300"
            >
              자리 해제하기
            </button>
          </div>
        )}

        {/* 남의 데스크: 쪽지/선물 */}
        {desk && !isMine && loggedIn && (
          <div className="space-y-2 rounded-xl bg-panel2 p-3">
            <div className="text-sm font-medium text-slate-200">💌 쪽지/선물 남기기 (비동기)</div>
            <textarea
              className="input min-h-[60px] resize-none bg-panel"
              placeholder={`${desk.owner_name}님에게 메시지를 남겨보세요`}
              value={message}
              maxLength={300}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {GIFT_EMOJIS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGift(gift === g ? null : g)}
                  className={`rounded-lg px-2 py-1 text-lg transition ${
                    gift === g ? "bg-accent/30 ring-1 ring-accent" : "hover:bg-white/10"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <button
              disabled={pending || !message.trim()}
              onClick={() => {
                startTransition(async () => {
                  const res = await leaveDeskNote({
                    spaceId,
                    deskObjectId: obj.id,
                    toUser: desk.owner_id,
                    fromName: myName,
                    message: message.trim(),
                    gift,
                  });
                  if ("error" in res && res.error) setError(res.error);
                  else {
                    setSent(true);
                    setMessage("");
                    setGift(null);
                  }
                });
              }}
              className="btn-primary w-full"
            >
              남기기
            </button>
            {sent && <p className="text-xs text-accent2">전달되었습니다! 주인이 접속하면 확인해요.</p>}
          </div>
        )}
        {desk && !isMine && !loggedIn && (
          <p className="text-xs text-slate-500">로그인하면 쪽지를 남길 수 있습니다.</p>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
