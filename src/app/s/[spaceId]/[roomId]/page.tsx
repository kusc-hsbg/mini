import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { checkAccess, loadSpace } from "@/lib/spaces";
import { getSupabaseServer } from "@/lib/supabase/server";
import { MAP_LIST, getPreset } from "@/lib/game/maps";
import GameClient from "@/components/game/GameClient";
import type { RoomRecord, SpaceRecord } from "@/lib/game/types";

export const dynamic = "force-dynamic";

function demoSpace(): { space: SpaceRecord; rooms: RoomRecord[] } {
  const space: SpaceRecord = {
    id: "demo",
    slug: "demo",
    name: "PixelTown 데모",
    description: "Supabase 미설정 싱글플레이 데모",
    owner_id: "demo",
    is_public: true,
    has_password: false,
    require_login: false,
    allowed_domains: null,
    guest_checkin: false,
    created_at: "",
  };
  const rooms: RoomRecord[] = MAP_LIST.map((m, i) => ({
    id: m.key,
    space_id: "demo",
    name: m.name,
    template_key: m.key,
    map_data: null,
    sort_order: i,
    created_at: "",
  }));
  return { space, rooms };
}

export default async function RoomPage({
  params,
}: {
  params: { spaceId: string; roomId: string };
}) {
  const { configured, userId, email, profile } = await getSessionContext();

  // ---------- 데모 모드 ----------
  if (!configured || params.spaceId === "demo") {
    const { space, rooms } = demoSpace();
    const room = rooms.find((r) => r.id === params.roomId) ?? rooms[0];
    if (!getPreset(room.template_key)) redirect("/spaces");
    return (
      <GameClient
        space={space}
        room={room}
        rooms={rooms}
        profile={configured ? profile : null}
        isMember={false}
        role={null}
        configured={false}
        initialBlocks={[]}
        initialSpawn={null}
      />
    );
  }

  // ---------- 실제 스페이스 ----------
  const ctx = await loadSpace(params.spaceId, userId);
  if (!ctx) redirect("/spaces");

  const gate = checkAccess(ctx, userId, email);
  if (!gate.ok) redirect(`/s/${ctx.space.id}`);

  const room = ctx.rooms.find((r) => r.id === params.roomId);
  if (!room) redirect(`/s/${ctx.space.id}`);

  // 방문 닫힘: 멤버/관리자만 입장
  const isAdminUser =
    ctx.space.owner_id === userId || ctx.role === "admin" || ctx.role === "moderator";
  if (room.closed && !ctx.isMember && !isAdminUser) redirect(`/s/${ctx.space.id}`);

  // 차단 목록 (로그인 유저)
  let blocks: string[] = [];
  if (userId) {
    const supabase = getSupabaseServer()!;
    const { data } = await supabase.from("blocks").select("blocked_key").eq("user_id", userId);
    blocks = (data ?? []).map((b) => b.blocked_key as string);
  }

  return (
    <GameClient
      space={ctx.space}
      room={room}
      rooms={ctx.rooms}
      profile={profile}
      isMember={ctx.isMember}
      role={ctx.role}
      configured
      initialBlocks={blocks}
      initialSpawn={null}
    />
  );
}
