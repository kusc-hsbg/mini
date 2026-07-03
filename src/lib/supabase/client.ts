"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

// 브라우저(클라이언트 컴포넌트)용 Supabase 인스턴스.
// 미설정 시 null 을 반환하여 호출부에서 데모 모드로 분기합니다.
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      // 기본값(초당 10회)은 이동 브로드캐스트만으로도 초과되어
      // 이모트/손들기/presence 메시지가 드랍됨 → 여유 있게 상향.
      realtime: { params: { eventsPerSecond: 40 } },
    });
  }
  return browserClient;
}
