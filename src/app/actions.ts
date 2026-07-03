"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { SpaceRole, UserStatus } from "@/lib/game/types";

type Result<T = object> = ({ ok: true } & T) | { error: string };

async function requireUser() {
  const supabase = getSupabaseServer();
  if (!supabase) return { supabase: null, user: null, error: "Supabase 미설정" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "로그인이 필요합니다." };
  return { supabase, user, error: null };
}

// ============ 프로필 ============

export async function saveProfile(form: {
  display_name: string;
  skin: string;
  color: string;
  top_style: string;
  pants: string;
  shoes: string;
  hair: string;
  hair_color: string;
  facial_hair: string;
  hat: string;
  glasses: string;
  face: string;
  special: string;
  head_img: string;
}): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };

  const { error: err } = await supabase.from("profiles").upsert({
    id: user.id,
    display_name: form.display_name.slice(0, 24) || "Player",
    skin: form.skin,
    color: form.color,
    top_style: form.top_style,
    pants: form.pants,
    shoes: form.shoes,
    hair: form.hair,
    hair_color: form.hair_color,
    facial_hair: form.facial_hair,
    hat: form.hat,
    glasses: form.glasses,
    face: form.face,
    special: form.special,
    head_img: form.head_img,
    updated_at: new Date().toISOString(),
  });
  if (err) return { error: err.message };
  revalidatePath("/spaces");
  return { ok: true };
}

export async function setStatus(status: UserStatus, message: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("profiles")
    .update({ status, status_message: message.slice(0, 60) || null })
    .eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true };
}

// ============ 스페이스 ============

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${rand}` : rand;
}

export async function createSpace(form: {
  name: string;
  description: string;
  is_public: boolean;
}): Promise<Result<{ id: string; slug: string }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };

  const { data, error: err } = await supabase
    .from("spaces")
    .insert({
      name: form.name.slice(0, 40) || "새 스페이스",
      description: form.description.slice(0, 200) || null,
      slug: slugify(form.name),
      is_public: form.is_public,
      owner_id: user.id,
    })
    .select("id, slug")
    .single();
  if (err) return { error: err.message };
  revalidatePath("/spaces");
  return { ok: true, id: data.id, slug: data.slug };
}

export async function updateSpaceSettings(
  spaceId: string,
  form: {
    name?: string;
    description?: string;
    is_public?: boolean;
    require_login?: boolean;
    guest_checkin?: boolean;
    allowed_domains?: string[] | null;
  }
): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("spaces").update(form).eq("id", spaceId);
  if (err) return { error: err.message };
  revalidatePath(`/s/${spaceId}/settings`);
  return { ok: true };
}

export async function setSpacePassword(spaceId: string, password: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.rpc("set_space_password", {
    p_space: spaceId,
    p_password: password,
  });
  if (err) return { error: err.message };
  revalidatePath(`/s/${spaceId}/settings`);
  return { ok: true };
}

export async function verifySpacePassword(spaceId: string, password: string): Promise<Result> {
  const supabase = getSupabaseServer();
  if (!supabase) return { error: "Supabase 미설정" };
  const { data, error: err } = await supabase.rpc("verify_space_password", {
    p_space: spaceId,
    p_password: password,
  });
  if (err) return { error: err.message };
  if (!data) return { error: "비밀번호가 올바르지 않습니다." };
  cookies().set(`sp_ok_${spaceId}`, "1", {
    httpOnly: true,
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return { ok: true };
}

export async function deleteSpace(spaceId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("spaces").delete().eq("id", spaceId);
  if (err) return { error: err.message };
  revalidatePath("/spaces");
  return { ok: true };
}

export async function joinSpace(spaceId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("space_members")
    .insert({ space_id: spaceId, user_id: user.id, role: "member" });
  if (err && !err.message.includes("duplicate")) return { error: err.message };
  return { ok: true };
}

// ============ 멤버/역할 ============

export async function setMemberRole(
  spaceId: string,
  userId: string,
  role: SpaceRole
): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("space_members")
    .update({ role })
    .eq("space_id", spaceId)
    .eq("user_id", userId);
  if (err) return { error: err.message };
  revalidatePath(`/s/${spaceId}/settings`);
  return { ok: true };
}

export async function removeMember(spaceId: string, userId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("space_members")
    .delete()
    .eq("space_id", spaceId)
    .eq("user_id", userId);
  if (err) return { error: err.message };
  revalidatePath(`/s/${spaceId}/settings`);
  return { ok: true };
}

// ============ 밴 ============

export async function banTarget(
  spaceId: string,
  targetKey: string,
  targetName: string,
  reason: string
): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("space_bans").insert({
    space_id: spaceId,
    target_key: targetKey,
    target_name: targetName.slice(0, 40),
    reason: reason.slice(0, 200) || null,
    created_by: user.id,
  });
  if (err && !err.message.includes("duplicate")) return { error: err.message };
  return { ok: true };
}

export async function unbanTarget(spaceId: string, banId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("space_bans")
    .delete()
    .eq("id", banId)
    .eq("space_id", spaceId);
  if (err) return { error: err.message };
  revalidatePath(`/s/${spaceId}/settings`);
  return { ok: true };
}

// ============ 방(Room) ============

export async function createRoomInSpace(
  spaceId: string,
  name: string,
  templateKey: string
): Promise<Result<{ id: string }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { data, error: err } = await supabase
    .from("rooms")
    .insert({ space_id: spaceId, name: name.slice(0, 40) || "새 방", template_key: templateKey })
    .select("id")
    .single();
  if (err) return { error: err.message };
  revalidatePath(`/s/${spaceId}/settings`);
  return { ok: true, id: data.id };
}

export async function renameRoom(spaceId: string, roomId: string, name: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("rooms")
    .update({ name: name.slice(0, 40) })
    .eq("id", roomId);
  if (err) return { error: err.message };
  revalidatePath(`/s/${spaceId}/settings`);
  return { ok: true };
}

export async function deleteRoomAction(spaceId: string, roomId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("rooms").delete().eq("id", roomId);
  if (err) return { error: err.message };
  revalidatePath(`/s/${spaceId}/settings`);
  return { ok: true };
}

export async function saveRoomMap(roomId: string, mapData: unknown): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("rooms")
    .update({ map_data: mapData })
    .eq("id", roomId);
  if (err) return { error: err.message };
  return { ok: true };
}

// ============ 데스크 ============

export async function claimDesk(
  spaceId: string,
  roomId: string,
  objectId: string,
  ownerName: string
): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  // 기존 내 데스크 해제 (같은 스페이스 내 1인 1데스크)
  await supabase.from("desks").delete().eq("space_id", spaceId).eq("owner_id", user.id);
  const { error: err } = await supabase.from("desks").insert({
    space_id: spaceId,
    room_id: roomId,
    object_id: objectId,
    owner_id: user.id,
    owner_name: ownerName.slice(0, 24),
  });
  if (err) return { error: err.message };
  return { ok: true };
}

export async function releaseDesk(spaceId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("desks")
    .delete()
    .eq("space_id", spaceId)
    .eq("owner_id", user.id);
  if (err) return { error: err.message };
  return { ok: true };
}

export async function updateDeskDecor(
  spaceId: string,
  decor: { rug?: string; plant?: boolean; monitor?: string }
): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("desks")
    .update({ decor })
    .eq("space_id", spaceId)
    .eq("owner_id", user.id);
  if (err) return { error: err.message };
  return { ok: true };
}

export async function leaveDeskNote(form: {
  spaceId: string;
  deskObjectId: string;
  toUser: string;
  fromName: string;
  message: string;
  gift: string | null;
}): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("desk_notes").insert({
    space_id: form.spaceId,
    desk_object_id: form.deskObjectId,
    to_user: form.toUser,
    from_name: form.fromName.slice(0, 24),
    message: form.message.slice(0, 300),
    gift: form.gift,
  });
  if (err) return { error: err.message };
  return { ok: true };
}

export async function markNoteRead(noteId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("desk_notes")
    .update({ read: true })
    .eq("id", noteId);
  if (err) return { error: err.message };
  return { ok: true };
}

// ============ 회의 ============

export async function createMeeting(form: {
  spaceId: string;
  roomId: string;
  title: string;
  locationKind: "area" | "desk" | "spawn";
  locationRef: string | null;
  startsAt: string;
  endsAt: string;
  creatorName: string;
}): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("meetings").insert({
    space_id: form.spaceId,
    room_id: form.roomId,
    title: form.title.slice(0, 60) || "회의",
    location_kind: form.locationKind,
    location_ref: form.locationRef,
    starts_at: form.startsAt,
    ends_at: form.endsAt,
    created_by: user.id,
    creator_name: form.creatorName.slice(0, 24),
  });
  if (err) return { error: err.message };
  return { ok: true };
}

export async function deleteMeeting(meetingId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("meetings").delete().eq("id", meetingId);
  if (err) return { error: err.message };
  return { ok: true };
}

// ============ 게시판 ============

export async function addBulletinPost(form: {
  spaceId: string;
  roomId: string;
  objectId: string;
  authorName: string;
  content: string;
  url: string | null;
}): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("bulletin_posts").insert({
    space_id: form.spaceId,
    room_id: form.roomId,
    object_id: form.objectId,
    author_id: user.id,
    author_name: form.authorName.slice(0, 24),
    content: form.content.slice(0, 500),
    url: form.url,
  });
  if (err) return { error: err.message };
  return { ok: true };
}

export async function deleteBulletinPost(postId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("bulletin_posts").delete().eq("id", postId);
  if (err) return { error: err.message };
  return { ok: true };
}

// ============ 화이트보드 ============

export async function saveWhiteboard(
  boardKey: string,
  spaceId: string | null,
  ops: unknown[]
): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("whiteboards")
    .upsert(
      { board_key: boardKey, space_id: spaceId, ops },
      { onConflict: "board_key" }
    );
  if (err) return { error: err.message };
  return { ok: true };
}

// ============ DM ============

export async function sendDm(form: {
  spaceId: string;
  toId: string;
  fromName: string;
  body: string;
}): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  // 게스트에게는 저장 불가 (broadcast 전용)
  if (form.toId.startsWith("guest_")) return { ok: true };
  const { error: err } = await supabase.from("dm_messages").insert({
    space_id: form.spaceId,
    from_id: user.id,
    from_name: form.fromName.slice(0, 24),
    to_id: form.toId,
    body: form.body.slice(0, 500),
  });
  if (err) return { error: err.message };
  return { ok: true };
}

// ============ 차단 ============

export async function blockTarget(targetKey: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("blocks")
    .insert({ user_id: user.id, blocked_key: targetKey });
  if (err && !err.message.includes("duplicate")) return { error: err.message };
  return { ok: true };
}

export async function unblockTarget(targetKey: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("blocks")
    .delete()
    .eq("user_id", user.id)
    .eq("blocked_key", targetKey);
  if (err) return { error: err.message };
  return { ok: true };
}

// ============ 로그아웃 ============

export async function signOut() {
  const supabase = getSupabaseServer();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
