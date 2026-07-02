import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { loadSpace } from "@/lib/spaces";
import { getSupabaseServer } from "@/lib/supabase/server";
import SettingsClient, {
  type BanRow,
  type GuestLogRow,
  type MemberRow,
} from "@/components/settings/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SpaceSettingsPage({
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

  const { data: memberRows } = await supabase
    .from("space_members")
    .select("space_id, user_id, role, created_at")
    .eq("space_id", ctx.space.id)
    .order("created_at", { ascending: true });

  const userIds = (memberRows ?? []).map((m) => m.user_id as string);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] as { id: string; display_name: string }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const members: MemberRow[] = (memberRows ?? []).map((m) => ({
    user_id: m.user_id as string,
    role: m.role as MemberRow["role"],
    display_name: nameById.get(m.user_id as string) ?? "(이름 없음)",
    is_owner: m.user_id === ctx.space.owner_id,
  }));

  const { data: bans } = await supabase
    .from("space_bans")
    .select("id, target_key, target_name, reason, created_at")
    .eq("space_id", ctx.space.id)
    .order("created_at", { ascending: false });

  const { data: guestLogs } = await supabase
    .from("guest_logs")
    .select("id, guest_name, approved_by, entered_at")
    .eq("space_id", ctx.space.id)
    .order("entered_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/s/${ctx.space.id}`} className="text-sm text-slate-400 hover:text-white">
            ← {ctx.space.name}
          </Link>
          <h1 className="text-2xl font-bold text-white">스페이스 설정</h1>
        </div>
        <Link href={`/s/${ctx.space.id}/insights`} className="btn-ghost">
          📊 인사이트
        </Link>
      </header>
      <SettingsClient
        space={ctx.space}
        rooms={ctx.rooms}
        members={members}
        bans={(bans as BanRow[]) ?? []}
        guestLogs={(guestLogs as GuestLogRow[]) ?? []}
        myId={userId}
      />
    </main>
  );
}
