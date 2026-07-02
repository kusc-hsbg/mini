import Link from "next/link";
import { getSessionContext } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { MAP_LIST } from "@/lib/game/maps";
import { signOut } from "@/app/actions";
import SpaceCard from "@/components/SpaceCard";
import CreateSpaceForm from "@/components/CreateSpaceForm";
import type { SpaceRecord } from "@/lib/game/types";

export const dynamic = "force-dynamic";

export default async function SpacesPage() {
  const { configured, userId, email, profile } = await getSessionContext();

  let spaces: SpaceRecord[] = [];
  let memberSpaceIds = new Set<string>();
  if (configured) {
    const supabase = getSupabaseServer()!;
    const { data } = await supabase
      .from("spaces")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60);
    spaces = (data as SpaceRecord[]) ?? [];
    if (userId) {
      const { data: mem } = await supabase
        .from("space_members")
        .select("space_id")
        .eq("user_id", userId);
      memberSpaceIds = new Set((mem ?? []).map((m) => m.space_id as string));
    }
  }

  const mySpaces = spaces.filter((s) => s.owner_id === userId || memberSpaceIds.has(s.id));
  const publicSpaces = spaces.filter(
    (s) => s.is_public && s.owner_id !== userId && !memberSpaceIds.has(s.id)
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-slate-400 hover:text-white">
            PixelTown
          </Link>
          <h1 className="text-2xl font-bold text-white">스페이스 로비</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/customize" className="btn-ghost">
            🧍 캐릭터 꾸미기
          </Link>
          {userId ? (
            <form action={signOut}>
              <button className="btn-ghost" type="submit">
                {(profile?.display_name || email || "나").slice(0, 16)} · 로그아웃
              </button>
            </form>
          ) : (
            <Link href="/login" className="btn-primary">
              로그인
            </Link>
          )}
        </div>
      </header>

      {!configured && (
        <>
          <div className="card mb-6 border-amber-400/20 bg-amber-500/5">
            <p className="text-sm text-amber-200">
              ⚙️ Supabase 미연결 — <b>싱글플레이 데모 모드</b>입니다. 아래 데모 맵에 입장해
              둘러보세요. (멀티플레이/로그인은 README 설정 후 활성화)
            </p>
          </div>
          <section className="mb-10">
            <h2 className="mb-3 text-lg font-semibold text-white">🗺️ 데모 맵</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MAP_LIST.map((m) => (
                <div key={m.key} className="card flex flex-col justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{m.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{m.description}</p>
                  </div>
                  <Link href={`/s/demo/${m.key}`} className="btn-primary mt-4">
                    입장 →
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {configured && (
        <>
          {mySpaces.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-3 text-lg font-semibold text-white">⭐ 내 스페이스</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {mySpaces.map((s) => (
                  <SpaceCard
                    key={s.id}
                    space={s}
                    isOwner={s.owner_id === userId}
                    isMember
                    loggedIn={!!userId}
                    badge={s.owner_id === userId ? "오너" : "멤버"}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mb-10">
            <h2 className="mb-3 text-lg font-semibold text-white">🌐 공개 스페이스</h2>
            {publicSpaces.length === 0 ? (
              <p className="text-sm text-slate-400">
                아직 공개 스페이스가 없습니다.{" "}
                {userId ? "아래에서 첫 스페이스를 만들어보세요!" : "로그인하면 만들 수 있어요."}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {publicSpaces.map((s) => (
                  <SpaceCard key={s.id} space={s} loggedIn={!!userId} />
                ))}
              </div>
            )}
          </section>

          {userId ? (
            <CreateSpaceForm />
          ) : (
            <div className="card text-center">
              <p className="text-slate-300">나만의 스페이스를 만들려면 로그인하세요.</p>
              <Link href="/login" className="btn-primary mt-3 inline-flex">
                로그인하고 호스트 되기
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
