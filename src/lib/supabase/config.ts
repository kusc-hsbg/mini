// Supabase 환경변수가 모두 설정됐는지 확인하는 헬퍼.
// 미설정이면 앱은 싱글플레이 데모 모드로 동작합니다.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;

export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}
