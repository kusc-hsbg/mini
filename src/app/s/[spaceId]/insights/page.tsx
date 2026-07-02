import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { loadSpace } from "@/lib/spaces";
import { getSupabaseServer } from "@/lib/supabase/server";
import InsightsClient, { type EventRow } from "@/components/settings/InsightsClient";

export const dynamic = "force-dynamic";

export default async function InsightsPage({
  params,
}: {
  params: { spaceId: string };
}) {
  const { configured, userId } = await getSessionContext();
  if (!configured || !userId) redirect("/spaces");

  const ctx = await loadSpace(params.spaceId, userId);
  if (!ctx) redirect("/spaces");
  const isAdmin = ctx.space.owner_id === userId || ctx.role === "admin";
  if (!isAdmin) redirect(`/s/${ctx.space.id}`);

  const supabase = getSupabaseServer()!;
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data } = await supabase
    .from("analytics_events")
    .select("user_key, user_name, kind, value, created_at")
    .eq("space_id", ctx.space.id)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(8000);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <Link href={`/s/${ctx.space.id}/settings`} className="text-sm text-slate-400 hover:text-white">
          ← 설정
        </Link>
        <h1 className="text-2xl font-bold text-white">📊 인사이트 — {ctx.space.name}</h1>
        <p className="mt-1 text-sm text-slate-400">
          최근 30일. 온보딩·협업 패턴 파악용 지표입니다 (개인 감시용이 아니에요).
        </p>
      </header>
      <InsightsClient events={(data as EventRow[]) ?? []} />
    </main>
  );
}
