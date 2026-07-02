import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

// Google OAuth 후 Supabase 가 리다이렉트하는 콜백.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/spaces";

  if (code) {
    const supabase = getSupabaseServer();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
