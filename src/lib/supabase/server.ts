import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

// 서버 컴포넌트 / 서버 액션 / 라우트 핸들러용 Supabase 인스턴스.
// 미설정 시 null 을 반환합니다.
export function getSupabaseServer() {
  if (!isSupabaseConfigured) return null;

  const cookieStore = cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // 서버 컴포넌트에서 호출되면 set 이 불가능할 수 있음 — 미들웨어가 세션을 갱신함.
        }
      },
    },
  });
}
