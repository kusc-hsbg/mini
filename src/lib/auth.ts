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

  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // 프로필 행이 없으면(트리거 누락 등) 즉시 생성 —
  // 이게 없으면 로그인했는데도 게스트로 취급되는 버그가 생긴다.
  if (!profile) {
    const displayName =
      (user.user_metadata?.full_name as string | undefined) ||
      user.email?.split("@")[0] ||
      "Player";
    const { data: created } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: displayName.slice(0, 24) })
      .select("*")
      .maybeSingle();
    profile = created;
  }

  return {
    configured: true,
    userId: user.id,
    email: user.email ?? null,
    profile: (profile as Profile) ?? null,
  };
}
