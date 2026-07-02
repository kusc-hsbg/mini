"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

// 브라우저(클라이언트 컴포넌트)용 Supabase 인스턴스.
// 미설정 시 null 을 반환하여 호출부에서 데모 모드로 분기합니다.
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}
