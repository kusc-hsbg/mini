"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { filterProfanity } from "@/lib/game/moderation";
import { SHOP_MAP, HEARTS_PER_COIN } from "@/lib/game/shop";
import { WEAPON_MAP, titleForKills } from "@/lib/game/weapons";
import type { SpaceRole, UserStatus } from "@/lib/game/types";

type Result<T = object> = ({ ok: true } & T) | { error: string };

const PROFILE_COMPAT_COLUMNS = new Set([
  "top_style",
  "shoes",
  "facial_hair",
  "glasses",
  "special",
  "head_img",
  "bio",
  "name_above",
  "hearts",
  "coins",
  "inventory",
  "equipped",
  "bank",
  "bank_at",
  "last_attendance",
  "attendance_streak",
  "titles",
  "kills",
  "race_wins",
]);

function missingSchemaColumn(message: string): string | null {
  if (!message.toLowerCase().includes("schema cache")) return null;
  return message.match(/'([^']+)'\s+column/)?.[1] ?? null;
}

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
  name_above?: boolean;
}): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };

  const patch: Record<string, unknown> = {
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
    name_above: form.name_above ?? false,
    updated_at: new Date().toISOString(),
  };

  let err: { message: string } | null = null;
  for (let i = 0; i <= PROFILE_COMPAT_COLUMNS.size; i++) {
    const res = await supabase.from("profiles").upsert(patch);
    err = res.error;
    if (!err) break;
    const col = missingSchemaColumn(err.message);
    if (!col || !(col in patch) || !PROFILE_COMPAT_COLUMNS.has(col)) break;
    delete patch[col];
  }
  if (err) return { error: err.message };
  revalidatePath("/spaces");
  return { ok: true };
}

export async function saveBio(bio: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase
    .from("profiles")
    .update({ bio: filterProfanity(bio.slice(0, 200)) || null })
    .eq("id", user.id);
  const col = err ? missingSchemaColumn(err.message) : null;
  if (col === "bio") return { ok: true };
  if (err) return { error: err.message };
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

// ============ 경제 / 인벤토리 (하트·코인·상점) ============

interface Wallet {
  hearts: number;
  coins: number;
  inventory: string[];
  equipped: Record<string, string>;
}

async function loadWallet(supabase: NonNullable<ReturnType<typeof getSupabaseServer>>, userId: string): Promise<Wallet | null> {
  const { data } = await supabase
    .from("profiles")
    .select("hearts, coins, inventory, equipped")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    hearts: Number(data.hearts ?? 0),
    coins: Number(data.coins ?? 0),
    inventory: Array.isArray(data.inventory) ? (data.inventory as string[]) : [],
    equipped: (data.equipped as Record<string, string>) ?? {},
  };
}

export async function buyItem(
  itemKey: string
): Promise<Result<{ hearts: number; coins: number; inventory: string[] }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const item = SHOP_MAP[itemKey];
  if (!item) return { error: "존재하지 않는 아이템입니다." };
  const w = await loadWallet(supabase, user.id);
  if (!w) return { error: "프로필을 찾을 수 없습니다." };
  if (w.inventory.includes(itemKey)) return { error: "이미 보유한 아이템입니다." };
  const bal = item.currency === "heart" ? w.hearts : w.coins;
  if (bal < item.price) {
    return { error: item.currency === "heart" ? "하트가 부족합니다." : "코인이 부족합니다." };
  }
  const inventory = [...w.inventory, itemKey];
  const patch: Record<string, unknown> = { inventory };
  if (item.currency === "heart") patch.hearts = w.hearts - item.price;
  else patch.coins = w.coins - item.price;
  const { error: err } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (err) return { error: err.message };
  return {
    ok: true,
    hearts: (patch.hearts as number) ?? w.hearts,
    coins: (patch.coins as number) ?? w.coins,
    inventory,
  };
}

export async function equipItem(slot: string, itemKey: string | null): Promise<Result<{ equipped: Record<string, string> }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const w = await loadWallet(supabase, user.id);
  if (!w) return { error: "프로필을 찾을 수 없습니다." };
  const equipped = { ...w.equipped };
  if (itemKey === null) {
    delete equipped[slot];
  } else {
    if (!w.inventory.includes(itemKey)) return { error: "보유하지 않은 아이템입니다." };
    equipped[slot] = itemKey;
  }
  const { error: err } = await supabase.from("profiles").update({ equipped }).eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, equipped };
}

// 소모품 사용(휴대용 피아노 등) — 인벤토리에서 제거.
export async function consumeItem(itemKey: string): Promise<Result<{ inventory: string[] }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const w = await loadWallet(supabase, user.id);
  if (!w) return { error: "프로필을 찾을 수 없습니다." };
  if (!w.inventory.includes(itemKey)) return { error: "보유하지 않은 아이템입니다." };
  const inventory = w.inventory.filter((k) => k !== itemKey);
  const { error: err } = await supabase.from("profiles").update({ inventory }).eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, inventory };
}

// 하트 → 코인 환전
export async function exchangeToCoins(
  coinAmount: number
): Promise<Result<{ hearts: number; coins: number }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const n = Math.floor(coinAmount);
  if (n < 1) return { error: "1코인 이상 환전하세요." };
  const w = await loadWallet(supabase, user.id);
  if (!w) return { error: "프로필을 찾을 수 없습니다." };
  const cost = n * HEARTS_PER_COIN;
  if (w.hearts < cost) return { error: `하트가 부족합니다. (${cost} 하트 필요)` };
  const hearts = w.hearts - cost;
  const coins = w.coins + n;
  const { error: err } = await supabase.from("profiles").update({ hearts, coins }).eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, hearts, coins };
}

// 출석 보상 — 하루 1회 하트 지급, 7일 연속마다 코인 지급.
export async function claimAttendance(): Promise<
  Result<{ already?: boolean; hearts: number; coins: number; streak: number; rewardHearts: number; rewardCoins: number }>
> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { data } = await supabase
    .from("profiles")
    .select("hearts, coins, last_attendance, attendance_streak")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return { error: "프로필을 찾을 수 없습니다." };
  const hearts0 = Number(data.hearts ?? 0);
  const coins0 = Number(data.coins ?? 0);
  const today = new Date().toISOString().slice(0, 10);
  const last = (data.last_attendance as string | null)?.slice(0, 10) ?? null;
  if (last === today) {
    return { ok: true, already: true, hearts: hearts0, coins: coins0, streak: Number(data.attendance_streak ?? 0), rewardHearts: 0, rewardCoins: 0 };
  }
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = last === yesterday ? Number(data.attendance_streak ?? 0) + 1 : 1;
  const rewardHearts = 50 + Math.min(streak, 7) * 10;
  const rewardCoins = streak % 7 === 0 ? 1 : 0;
  const hearts = hearts0 + rewardHearts;
  const coins = coins0 + rewardCoins;
  const { error: err } = await supabase
    .from("profiles")
    .update({ hearts, coins, last_attendance: today, attendance_streak: streak })
    .eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, hearts, coins, streak, rewardHearts, rewardCoins };
}

// 미니게임 보상 하트 지급 (호출당 최대 30하트로 제한 — 남용 방지)
export async function grantHearts(amount: number): Promise<Result<{ hearts: number }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const add = Math.max(0, Math.min(30, Math.floor(amount)));
  const { data, error: loadErr } = await supabase.from("profiles").select("hearts").eq("id", user.id).maybeSingle();
  if (loadErr) return { error: loadErr.message };
  if (!data) return { error: "프로필을 찾을 수 없습니다." };
  const hearts = Number(data.hearts ?? 0) + add;
  const { error: err } = await supabase.from("profiles").update({ hearts }).eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, hearts };
}

export async function spendHearts(amount: number): Promise<Result<{ hearts: number }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const n = Math.floor(amount);
  if (n < 1) return { error: "1하트 이상 사용하세요." };
  const { data, error: loadErr } = await supabase.from("profiles").select("hearts").eq("id", user.id).maybeSingle();
  if (loadErr) return { error: loadErr.message };
  if (!data) return { error: "프로필을 찾을 수 없습니다." };
  const hearts0 = Number(data.hearts ?? 0);
  if (hearts0 < n) return { error: "하트가 부족합니다." };
  const hearts = hearts0 - n;
  const { error: err } = await supabase.from("profiles").update({ hearts }).eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, hearts };
}

// ---- PK 무기 구매 + 킬 기록 ----

export async function buyWeapon(
  weaponKey: string
): Promise<Result<{ hearts: number; coins: number; inventory: string[] }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const wp = WEAPON_MAP[weaponKey];
  if (!wp) return { error: "존재하지 않는 무기입니다." };
  const invKey = `weapon-${weaponKey}`;
  const w = await loadWallet(supabase, user.id);
  if (!w) return { error: "프로필을 찾을 수 없습니다." };
  if (w.inventory.includes(invKey)) return { error: "이미 보유한 무기입니다." };
  const bal = wp.currency === "heart" ? w.hearts : w.coins;
  if (bal < wp.price) return { error: wp.currency === "heart" ? "하트가 부족합니다." : "코인이 부족합니다." };
  const inventory = [...w.inventory, invKey];
  const patch: Record<string, unknown> = { inventory };
  if (wp.currency === "heart") patch.hearts = w.hearts - wp.price;
  else patch.coins = w.coins - wp.price;
  const { error: err } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (err) return { error: err.message };
  return {
    ok: true,
    hearts: (patch.hearts as number) ?? w.hearts,
    coins: (patch.coins as number) ?? w.coins,
    inventory,
  };
}

export async function addKill(): Promise<Result<{ kills: number; newTitle: string | null }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { data } = await supabase.from("profiles").select("kills, titles").eq("id", user.id).maybeSingle();
  if (!data) return { error: "프로필을 찾을 수 없습니다." };
  const kills = Number(data.kills ?? 0) + 1;
  const titles = Array.isArray(data.titles) ? (data.titles as string[]) : [];
  const earned = titleForKills(kills);
  let newTitle: string | null = null;
  const patch: Record<string, unknown> = { kills };
  if (earned && !titles.includes(earned.title)) {
    newTitle = earned.label;
    patch.titles = [...titles, earned.title];
  }
  const { error: err } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, kills, newTitle };
}

// ---- ATM (예치/이자/출금) + 송금 ----

// 복리 이자 계산: 하루 1% 복리. 경과 일수만큼 bank 에 적용.
function accrueInterest(bank: number, bankAtIso: string | null): number {
  if (bank <= 0 || !bankAtIso) return bank;
  const elapsedMs = Date.now() - new Date(bankAtIso).getTime();
  if (elapsedMs <= 0) return bank;
  const days = Math.min(365, elapsedMs / 86400000); // 과도한 지수 방지 상한
  return Math.floor(bank * Math.pow(1.01, days));
}

export async function refreshBank(): Promise<Result<{ hearts: number; bank: number; gained: number }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { data } = await supabase.from("profiles").select("hearts, bank, bank_at").eq("id", user.id).maybeSingle();
  if (!data) return { error: "프로필을 찾을 수 없습니다." };
  const bank0 = Number(data.bank ?? 0);
  const bank = accrueInterest(bank0, data.bank_at as string | null);
  const gained = bank - bank0;
  if (gained > 0) {
    await supabase.from("profiles").update({ bank, bank_at: new Date().toISOString() }).eq("id", user.id);
  }
  return { ok: true, hearts: Number(data.hearts ?? 0), bank, gained };
}

export async function depositBank(amount: number): Promise<Result<{ hearts: number; bank: number }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const n = Math.floor(amount);
  if (n < 1) return { error: "1하트 이상 예치하세요." };
  const { data } = await supabase.from("profiles").select("hearts, bank, bank_at").eq("id", user.id).maybeSingle();
  if (!data) return { error: "프로필을 찾을 수 없습니다." };
  const hearts0 = Number(data.hearts ?? 0);
  if (hearts0 < n) return { error: "하트가 부족합니다." };
  const bank = accrueInterest(Number(data.bank ?? 0), data.bank_at as string | null) + n;
  const hearts = hearts0 - n;
  const { error: err } = await supabase
    .from("profiles")
    .update({ hearts, bank, bank_at: new Date().toISOString() })
    .eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, hearts, bank };
}

export async function withdrawBank(amount: number): Promise<Result<{ hearts: number; bank: number }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const n = Math.floor(amount);
  if (n < 1) return { error: "1하트 이상 출금하세요." };
  const { data } = await supabase.from("profiles").select("hearts, bank, bank_at").eq("id", user.id).maybeSingle();
  if (!data) return { error: "프로필을 찾을 수 없습니다." };
  const bank0 = accrueInterest(Number(data.bank ?? 0), data.bank_at as string | null);
  if (bank0 < n) return { error: "예치금이 부족합니다." };
  const bank = bank0 - n;
  const hearts = Number(data.hearts ?? 0) + n;
  const { error: err } = await supabase
    .from("profiles")
    .update({ hearts, bank, bank_at: new Date().toISOString() })
    .eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, hearts, bank };
}

export async function transferHearts(toId: string, amount: number): Promise<Result<{ hearts: number }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const n = Math.floor(amount);
  if (n < 1) return { error: "1하트 이상 송금하세요." };
  if (toId === user.id) return { error: "자신에게는 송금할 수 없어요." };
  const { error: err } = await supabase.rpc("transfer_hearts", { p_to: toId, p_amount: n });
  if (err) return { error: err.message.includes("insufficient") ? "하트가 부족합니다." : err.message };
  const { data } = await supabase.from("profiles").select("hearts").eq("id", user.id).maybeSingle();
  return { ok: true, hearts: Number(data?.hearts ?? 0) };
}

// 레이스 완주(우승) 기록 — race_wins 증가 (도감)
export async function incrementRaceWin(): Promise<Result<{ raceWins: number }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { data } = await supabase.from("profiles").select("race_wins").eq("id", user.id).maybeSingle();
  if (!data) return { error: "프로필을 찾을 수 없습니다." };
  const raceWins = Number(data.race_wins ?? 0) + 1;
  const { error: err } = await supabase.from("profiles").update({ race_wins: raceWins }).eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, raceWins };
}

// 온보딩 퀘스트 완료 보상 (계정당 1회) — 100하트 + 'tutorial' 칭호
export async function claimQuest(): Promise<Result<{ hearts: number; already?: boolean }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { data } = await supabase
    .from("profiles")
    .select("hearts, titles")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return { error: "프로필을 찾을 수 없습니다." };
  const titles = Array.isArray(data.titles) ? (data.titles as string[]) : [];
  const hearts0 = Number(data.hearts ?? 0);
  if (titles.includes("tutorial")) return { ok: true, hearts: hearts0, already: true };
  const hearts = hearts0 + 100;
  const { error: err } = await supabase
    .from("profiles")
    .update({ hearts, titles: [...titles, "tutorial"] })
    .eq("id", user.id);
  if (err) return { error: err.message };
  return { ok: true, hearts };
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

// 방문 닫기/열기 (관리자/방장) — 닫힌 방은 멤버/관리자만 입장
export async function setRoomClosed(roomId: string, closed: boolean): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("rooms").update({ closed }).eq("id", roomId);
  if (err) return { error: err.message };
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
    message: filterProfanity(form.message.slice(0, 300)),
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
    content: filterProfanity(form.content.slice(0, 500)),
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
    body: filterProfanity(form.body.slice(0, 500)),
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

// ============ 경매장 (feature #15) ============

export interface AuctionEntry {
  id: string;
  sellerId: string;
  sellerName: string;
  itemKey: string;
  price: number;
  mine: boolean;
}

// 아이템의 하트 환산 기준가 (코인가는 환율로 환산).
function baseHeartPrice(itemKey: string): number | null {
  const it = SHOP_MAP[itemKey];
  if (!it) return null;
  return it.currency === "heart" ? it.price : it.price * HEARTS_PER_COIN;
}

export async function getAuctions(): Promise<{ listings: AuctionEntry[] } | { error: string }> {
  const supabase = getSupabaseServer();
  if (!supabase) return { error: "Supabase 미설정" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error: err } = await supabase
    .from("auction_listings")
    .select("id, seller_id, seller_name, item_key, price")
    .order("created_at", { ascending: false })
    .limit(100);
  if (err) return { error: err.message };
  const listings: AuctionEntry[] = (data ?? []).map((r) => ({
    id: r.id as string,
    sellerId: r.seller_id as string,
    sellerName: (r.seller_name as string) ?? "",
    itemKey: r.item_key as string,
    price: Number(r.price),
    mine: user?.id === r.seller_id,
  }));
  return { listings };
}

export async function listAuction(
  itemKey: string,
  price: number
): Promise<Result<{ inventory: string[]; equipped: Record<string, string> }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const item = SHOP_MAP[itemKey];
  if (!item) return { error: "존재하지 않는 아이템입니다." };
  if (item.slot === "none" || item.consumable) return { error: "판매할 수 없는 아이템입니다." };
  const base = baseHeartPrice(itemKey)!;
  const min = Math.floor(base * 0.9);
  const p = Math.floor(price);
  if (p < min || p > base) return { error: `가격은 ${min}~${base} 하트 범위여야 해요(시중가 최대 10% 할인).` };
  const w = await loadWallet(supabase, user.id);
  if (!w) return { error: "프로필을 찾을 수 없습니다." };
  if (!w.inventory.includes(itemKey)) return { error: "보유하지 않은 아이템입니다." };
  const { count } = await supabase
    .from("auction_listings")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id);
  if ((count ?? 0) >= 3) return { error: "판매는 개인당 최대 3개까지 가능해요." };
  // 인벤토리에서 제거(에스크로) + 장착 해제
  const inventory = w.inventory.filter((k) => k !== itemKey);
  const equipped = { ...w.equipped };
  for (const slot of Object.keys(equipped)) if (equipped[slot] === itemKey) delete equipped[slot];
  const { error: upErr } = await supabase.from("profiles").update({ inventory, equipped }).eq("id", user.id);
  if (upErr) return { error: upErr.message };
  const { error: insErr } = await supabase.from("auction_listings").insert({
    seller_id: user.id,
    seller_name: (await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()).data?.display_name ?? "판매자",
    item_key: itemKey,
    price: p,
  });
  if (insErr) {
    // 롤백: 아이템 되돌리기
    await supabase.from("profiles").update({ inventory: w.inventory }).eq("id", user.id);
    return { error: insErr.message };
  }
  return { ok: true, inventory, equipped };
}

export async function cancelAuction(listingId: string): Promise<Result<{ inventory: string[] }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { data: listing } = await supabase
    .from("auction_listings")
    .select("item_key, seller_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing || listing.seller_id !== user.id) return { error: "취소할 수 없는 경매입니다." };
  const { error: delErr } = await supabase.from("auction_listings").delete().eq("id", listingId);
  if (delErr) return { error: delErr.message };
  const w = await loadWallet(supabase, user.id);
  const inventory = w ? (w.inventory.includes(listing.item_key as string) ? w.inventory : [...w.inventory, listing.item_key as string]) : [];
  await supabase.from("profiles").update({ inventory }).eq("id", user.id);
  return { ok: true, inventory };
}

export async function buyAuction(
  listingId: string
): Promise<Result<{ hearts: number; inventory: string[] }>> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: rpcErr } = await supabase.rpc("buy_listing", { p_listing: listingId });
  if (rpcErr) {
    const m = rpcErr.message;
    return {
      error: m.includes("insufficient")
        ? "하트가 부족합니다."
        : m.includes("already owned")
          ? "이미 보유한 아이템입니다."
          : m.includes("own listing")
            ? "자신의 경매는 살 수 없어요."
            : "구매에 실패했습니다.",
    };
  }
  const { data } = await supabase.from("profiles").select("hearts, inventory").eq("id", user.id).maybeSingle();
  return {
    ok: true,
    hearts: Number(data?.hearts ?? 0),
    inventory: Array.isArray(data?.inventory) ? (data!.inventory as string[]) : [],
  };
}

// ============ 친구 시스템 ============

export interface FriendEntry {
  id: string; // 상대 user id
  name: string;
  status: "accepted" | "incoming" | "outgoing";
  rowId: string;
}

export async function getFriends(): Promise<{ friends: FriendEntry[] } | { error: string }> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { data, error: err } = await supabase
    .from("friendships")
    .select("id, requester, addressee, status")
    .or(`requester.eq.${user.id},addressee.eq.${user.id}`);
  if (err) return { error: err.message };
  const rows = (data ?? []) as { id: string; requester: string; addressee: string; status: string }[];
  const otherIds = Array.from(
    new Set(rows.map((r) => (r.requester === user.id ? r.addressee : r.requester)))
  );
  const names = new Map<string, string>();
  if (otherIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", otherIds);
    for (const p of (profs ?? []) as { id: string; display_name: string }[]) {
      names.set(p.id, p.display_name);
    }
  }
  const friends: FriendEntry[] = rows
    .filter((r) => r.status !== "blocked")
    .map((r) => {
      const other = r.requester === user.id ? r.addressee : r.requester;
      let status: FriendEntry["status"];
      if (r.status === "accepted") status = "accepted";
      else status = r.requester === user.id ? "outgoing" : "incoming";
      return { id: other, name: names.get(other) ?? "이름없음", status, rowId: r.id };
    });
  return { friends };
}

export async function sendFriendRequest(targetId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  if (targetId === user.id) return { error: "자기 자신에게는 요청할 수 없어요." };
  if (targetId.startsWith("guest_")) return { error: "게스트에게는 친구 요청을 보낼 수 없어요." };
  // 이미 상대가 나에게 보낸 요청이 있으면 수락 처리
  const { data: reverse } = await supabase
    .from("friendships")
    .select("id, status")
    .eq("requester", targetId)
    .eq("addressee", user.id)
    .maybeSingle();
  if (reverse) {
    if (reverse.status === "pending") {
      await supabase.from("friendships").update({ status: "accepted" }).eq("id", reverse.id);
    }
    return { ok: true };
  }
  const { error: err } = await supabase
    .from("friendships")
    .insert({ requester: user.id, addressee: targetId, status: "pending" });
  if (err && !err.message.includes("duplicate")) return { error: err.message };
  return { ok: true };
}

export async function respondFriendRequest(rowId: string, accept: boolean): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  if (accept) {
    const { error: err } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", rowId)
      .eq("addressee", user.id);
    if (err) return { error: err.message };
  } else {
    const { error: err } = await supabase.from("friendships").delete().eq("id", rowId);
    if (err) return { error: err.message };
  }
  return { ok: true };
}

export async function removeFriend(rowId: string): Promise<Result> {
  const { supabase, user, error } = await requireUser();
  if (error || !supabase || !user) return { error: error! };
  const { error: err } = await supabase.from("friendships").delete().eq("id", rowId);
  if (err) return { error: err.message };
  return { ok: true };
}

// ============ 로그아웃 ============

export async function signOut() {
  const supabase = getSupabaseServer();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
