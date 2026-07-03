import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Landing({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  // OAuth 코드가 홈으로 떨어진 경우(리디렉션 허용목록 미설정 등) 콜백으로 전달
  if (searchParams?.code) {
    redirect(`/auth/callback?code=${encodeURIComponent(searchParams.code)}&next=/customize`);
  }

  const { configured, userId } = await getSessionContext();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-16">
      <div className="text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-panel px-4 py-1 text-sm text-slate-300">
          🏙️ 실시간 가상 오피스 · Vercel + Supabase
        </div>
        <h1 className="bg-gradient-to-r from-accent via-sky-300 to-accent2 bg-clip-text text-5xl font-extrabold leading-tight text-transparent md:text-6xl">
          PixelTown
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-300">
          아바타로 돌아다니고, 가까이 가면 영상이 연결되고, 회의실을 잠그고,
          화이트보드에 함께 그리는 맵 기반 온라인 오피스. 게더타운처럼.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {userId ? (
            <Link href="/spaces" className="btn-primary text-lg">
              입장하기 →
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn-primary text-lg">
                {configured ? "로그인하고 시작" : "둘러보기"}
              </Link>
              <Link href="/spaces" className="btn-ghost text-lg">
                게스트로 입장
              </Link>
            </>
          )}
        </div>

        {!configured && (
          <p className="mt-4 text-sm text-amber-300/80">
            ⚙️ 아직 Supabase가 연결되지 않아 <b>싱글플레이 데모 모드</b>로 동작합니다.
            (README의 설정 가이드 참고)
          </p>
        )}
      </div>

      <div className="mt-16 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card">
            <div className="text-3xl">{f.icon}</div>
            <h3 className="mt-2 font-semibold text-white">{f.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{f.desc}</p>
          </div>
        ))}
      </div>

      <footer className="mt-16 text-sm text-slate-500">
        WASD/더블클릭 이동 · X 상호작용 · 1~0 이모지 · F 오토바이 · M 미니맵
      </footer>
    </main>
  );
}

const FEATURES = [
  {
    icon: "📷",
    title: "근접 영상 대화",
    desc: "가까이 가면 자동으로 연결되는 WebRTC 카메라 대화. 프라이빗 영역·스포트라이트 지원.",
  },
  {
    icon: "🚪",
    title: "회의실 & 프라이빗 영역",
    desc: "영역 안 사람끼리만 대화. 최대 인원, 잠금, 노크 승인, 영역 초대 링크.",
  },
  {
    icon: "🛠️",
    title: "맵 에디터",
    desc: "타일·오브젝트·포털·스폰·스포트라이트를 직접 편집하고 모두에게 실시간 적용.",
  },
  {
    icon: "📅",
    title: "회의 예약",
    desc: "회의 영역·데스크 위치로 일정을 잡고 .ics로 Google/Outlook 캘린더에 추가.",
  },
  {
    icon: "🖊️",
    title: "화이트보드 & 게시판",
    desc: "실시간 공동 드로잉, PNG 내보내기, URL 공유. 게시판·노트·임베드 오브젝트.",
  },
  {
    icon: "🛡️",
    title: "권한 · 보안 · 인사이트",
    desc: "역할(Admin/Mod/Mapmaker), 비밀번호·도메인 제한·게스트 체크인, 활동 분석.",
  },
];
