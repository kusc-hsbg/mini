import { getSupabaseServer } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/config";
import type { Profile } from "./game/types";

// 현재 로그인 유저 + 프로필을 서버에서 조회.
export async function getSessionContext(): Promise<{
  configured: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
}> {
  if (!isSupabaseConfigured) {
    return { configured: false, userId: null, email: null, profile: null };
  }
  const supabase = getSupabaseServer()!;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { configured: true, userId: null, email: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return {
    configured: true,
    userId: user.id,
    email: user.email ?? null,
    profile: (profile as Profile) ?? null,
  };
}
