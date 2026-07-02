"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSpace, joinSpace } from "@/app/actions";
import type { SpaceRecord } from "@/lib/game/types";

export default function SpaceCard({
  space,
  isOwner,
  isMember,
  loggedIn,
  badge,
}: {
  space: SpaceRecord;
  isOwner?: boolean;
  isMember?: boolean;
  loggedIn?: boolean;
  badge?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="card flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">{space.name}</h3>
          {badge && (
            <span className="rounded-full bg-accent2/15 px-2 py-0.5 text-xs text-accent2">
              {badge}
            </span>
          )}
          {space.has_password && <span title="비밀번호 보호">🔑</span>}
          {space.guest_checkin && <span title="게스트 체크인">🚪</span>}
          {!space.is_public && <span title="비공개">🔒</span>}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-slate-400">
          {space.description || "광장 · 오피스 · 파크 3개 맵"}
        </p>
        <p className="mt-1 text-xs text-slate-600">/s/{space.slug}</p>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Link href={`/s/${space.id}`} className="btn-primary flex-1">
          입장 →
        </Link>
        {loggedIn && !isMember && space.is_public && (
          <button
            onClick={() =>
              startTransition(async () => {
                await joinSpace(space.id);
                router.refresh();
              })
            }
            disabled={pending}
            className="btn-ghost px-3 text-sm"
            title="멤버로 가입 (데스크/회의/멤버 전용 문 이용)"
          >
            + 멤버
          </button>
        )}
        {isOwner && (
          <button
            onClick={() =>
              startTransition(async () => {
                if (confirm(`"${space.name}" 스페이스를 삭제할까요? 모든 방/데이터가 삭제됩니다.`)) {
                  await deleteSpace(space.id);
                  router.refresh();
                }
              })
            }
            disabled={pending}
            className="btn-ghost px-3"
            title="스페이스 삭제"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}
