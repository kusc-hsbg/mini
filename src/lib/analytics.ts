"use client";

// 인사이트용 이벤트 로깅 (Supabase 미설정 시 no-op).
import { getSupabaseBrowser } from "@/lib/supabase/client";

export async function logEvent(
  spaceId: string,
  roomId: string | null,
  userKey: string,
  userName: string,
  kind: string,
  value?: number
) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  try {
    await supabase.from("analytics_events").insert({
      space_id: spaceId,
      room_id: roomId,
      user_key: userKey,
      user_name: userName.slice(0, 24),
      kind,
      value: value ?? null,
    });
  } catch {}
}

export async function logGuestEntry(
  spaceId: string,
  guestKey: string,
  guestName: string,
  approvedBy?: string
) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  try {
    await supabase.from("guest_logs").insert({
      space_id: spaceId,
      guest_key: guestKey,
      guest_name: guestName.slice(0, 24),
      approved_by: approvedBy ?? null,
    });
  } catch {}
}
