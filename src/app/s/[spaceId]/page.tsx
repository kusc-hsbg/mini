import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { checkAccess, loadSpace } from "@/lib/spaces";
import GateClient from "@/components/GateClient";

export const dynamic = "force-dynamic";

// 스페이스 진입점: 접근 제어 통과 시 첫 번째 방으로 이동, 아니면 게이트 표시.
export default async function SpaceEntryPage({
  params,
}: {
  params: { spaceId: string };
}) {
  const { configured, userId, email, profile } = await getSessionContext();

  if (!configured || params.spaceId === "demo") {
    redirect("/s/demo/plaza");
  }

  const ctx = await loadSpace(params.spaceId, userId);
  if (!ctx) redirect("/spaces");

  const gate = checkAccess(ctx, userId, email);
  const firstRoom = ctx.rooms[0];

  if (gate.ok) {
    if (!firstRoom) redirect("/spaces");
    redirect(`/s/${ctx.space.id}/${firstRoom.id}`);
  }

  return (
    <GateClient
      space={ctx.space}
      reason={gate.ok ? null : gate.reason}
      loggedIn={!!userId}
      userKey={userId}
      displayName={profile?.display_name ?? null}
      firstRoomId={firstRoom?.id ?? null}
    />
  );
}
