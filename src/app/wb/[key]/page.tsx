import Link from "next/link";
import { getSessionContext } from "@/lib/auth";
import WbPageClient from "@/components/game/WbPageClient";

export const dynamic = "force-dynamic";

// 화이트보드 단독 페이지 — 공유 URL로 외부 브라우저에서 열람/편집.
export default async function WhiteboardPage({
  params,
}: {
  params: { key: string };
}) {
  const { configured, userId } = await getSessionContext();
  const boardKey = decodeURIComponent(params.key);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <Link href="/spaces" className="text-sm text-slate-400 hover:text-white">
            ← PixelTown
          </Link>
          <h1 className="text-xl font-bold text-white">🖊️ 공유 화이트보드</h1>
        </div>
      </header>
      <WbPageClient boardKey={boardKey} configured={configured} loggedIn={!!userId} />
    </main>
  );
}
