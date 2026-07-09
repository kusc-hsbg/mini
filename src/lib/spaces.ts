// 스페이스 로드 + 접근 제어 (서버 전용).
import { cookies } from "next/headers";
import { getSupabaseServer } from "./supabase/server";
import { MAP_LIST } from "./game/maps";
import type { RoomRecord, SpaceRecord, SpaceRole } from "./game/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SpaceContext {
  space: SpaceRecord;
  rooms: RoomRecord[];
  role: SpaceRole | null;
  isMember: boolean;
  isBanned: boolean;
}

// id 또는 slug 로 스페이스 + 방 목록 + 내 멤버십 조회.
export async function loadSpace(
  idOrSlug: string,
  userId: string | null
): Promise<SpaceContext | null> {
  const supabase = getSupabaseServer();
  if (!supabase) return null;

  const col = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data: space } = await supabase
    .from("spaces")
    .select("*")
    .eq(col, idOrSlug)
    .maybeSingle();
  if (!space) return null;

  const loadRooms = async () =>
    (
      await supabase
        .from("rooms")
        .select("*")
        .eq("space_id", space.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    ).data as RoomRecord[] | null;

  let rooms = (await loadRooms()) ?? [];

  let role: SpaceRole | null = null;
  let isBanned = false;
  if (userId) {
    const { data: member } = await supabase
      .from("space_members")
      .select("role")
      .eq("space_id", space.id)
      .eq("user_id", userId)
      .maybeSingle();
    role = (member?.role as SpaceRole) ?? null;

    const { data: ban } = await supabase
      .from("space_bans")
      .select("id")
      .eq("space_id", space.id)
      .eq("target_key", userId)
      .maybeSingle();
    isBanned = !!ban;
  }

  // 누락된 프리셋 맵을 방으로 자동 생성 (관리자/오너 접속 시) —
  // 오래된 스페이스에도 신규 맵(카페/아레나/테마서킷 등)이 항상 존재하도록 보정.
  const isAdmin = space.owner_id === userId || role === "admin" || role === "mapmaker";
  if (isAdmin && userId) {
    const existing = new Set(rooms.map((r) => r.template_key));
    const missing = MAP_LIST.filter((m) => !existing.has(m.key));
    if (missing.length > 0) {
      const rows = missing.map((m) => ({
        space_id: space.id,
        name: m.name,
        template_key: m.key,
        sort_order: MAP_LIST.findIndex((x) => x.key === m.key),
      }));
      const { error } = await supabase.from("rooms").insert(rows);
      if (!error) rooms = (await loadRooms()) ?? rooms;
    }
  }

  return {
    space: space as SpaceRecord,
    rooms,
    role,
    isMember: role !== null || space.owner_id === userId,
    isBanned,
  };
}

export type AccessGate =
  | { ok: true }
  | { ok: false; reason: "banned" | "login" | "domain" | "password" | "checkin" };

// 보안 정책 검사. 멤버/오너는 비밀번호·체크인 면제.
export function checkAccess(
  ctx: SpaceContext,
  userId: string | null,
  email: string | null
): AccessGate {
  const { space, isMember, isBanned } = ctx;
  if (isBanned) return { ok: false, reason: "banned" };
  if (isMember) return { ok: true };

  if (space.require_login && !userId) return { ok: false, reason: "login" };

  if (space.allowed_domains && space.allowed_domains.length > 0) {
    const domain = email?.split("@")[1]?.toLowerCase();
    if (!domain || !space.allowed_domains.map((d) => d.toLowerCase()).includes(domain)) {
      return { ok: false, reason: "domain" };
    }
  }

  const jar = cookies();
  if (space.has_password && jar.get(`sp_ok_${space.id}`)?.value !== "1") {
    return { ok: false, reason: "password" };
  }
  if (space.guest_checkin && jar.get(`sp_ci_${space.id}`)?.value !== "1") {
    return { ok: false, reason: "checkin" };
  }
  return { ok: true };
}
