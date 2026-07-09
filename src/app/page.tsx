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
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center overflow-hidden px-6 py-16">
      {/* 배경 레이어: 오브 + 격자 */}
      <div className="orb" style={{ width: 520, height: 520, top: -160, left: -120, background: "#6c8cff" }} />
      <div className="orb" style={{ width: 460, height: 460, bottom: -180, right: -120, background: "#34d399" }} />
      <div className="orb" style={{ width: 320, height: 320, top: 120, right: 40, background: "#7c5cff", opacity: 0.35 }} />
      <div className="pointer-events-none absolute inset-0 grid-bg" />

      {/* ---------- 히어로 ---------- */}
      <section className="relative z-10 flex flex-col items-center text-center">
        <div className="fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs tracking-wide text-slate-300 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent2" />
          실시간 메타버스 · 레이싱 · PK · 소셜
        </div>

        <h1
          className="brand-title fade-up select-none text-[16vw] leading-none sm:text-[9rem] lg:text-[11rem]"
          style={{ animationDelay: "0.05s" }}
        >
          AFFINITY
        </h1>

        <p className="fade-up mx-auto mt-6 max-w-2xl text-lg text-slate-300/90 sm:text-xl" style={{ animationDelay: "0.15s" }}>
          아바타로 만나 서로에게 <span className="text-white">닿고(Affinity)</span>, 함께 달리고, 꾸미고, 겨루는
          <br className="hidden sm:block" /> 세련된 실시간 가상 세계.
        </p>

        <div className="fade-up mt-9 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "0.25s" }}>
          {userId ? (
            <Link href="/spaces" className="btn-primary px-7 py-3 text-lg">
              입장하기 <span aria-hidden>→</span>
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn-primary px-7 py-3 text-lg">
                {configured ? "로그인하고 시작" : "둘러보기"} <span aria-hidden>→</span>
              </Link>
              <Link href="/spaces" className="btn-ghost px-7 py-3 text-lg">
                게스트로 입장
              </Link>
            </>
          )}
        </div>

        {!configured && (
          <p className="fade-up mt-5 text-sm text-amber-300/80" style={{ animationDelay: "0.3s" }}>
            ⚙️ Supabase 미연결 — <b>싱글플레이 데모 모드</b>로 동작합니다.
          </p>
        )}
      </section>

      {/* ---------- 기능 카드 ---------- */}
      <section className="relative z-10 mt-24 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="glass fade-up group rounded-2xl p-5 shadow-xl transition hover:-translate-y-1 hover:border-accent/40"
            style={{ animationDelay: `${0.35 + i * 0.06}s` }}
          >
            <div className="text-3xl transition group-hover:scale-110">{f.icon}</div>
            <h3 className="mt-3 font-semibold text-white">{f.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="relative z-10 mt-20 text-center text-sm text-slate-500">
        <div className="mb-1 font-semibold tracking-widest text-slate-400">AFFINITY</div>
        WASD/더블클릭 이동 · X 상호작용 · F 탈것 · 워프 포탈로 순간이동 · M 미니맵
      </footer>
    </main>
  );
}

const FEATURES = [
  {
    icon: "🏁",
    title: "테마 레이싱 & 보스 레이드",
    desc: "지상·바다 요트·하늘 비행기 서킷. 부스트·로켓·먹물 아이템, 3랩 타임어택, 크라켄·치킨 보스 협동전.",
  },
  {
    icon: "🔫",
    title: "배틀 아레나 (PK)",
    desc: "무기 9종 상점, 실시간 총격·폭발·연막, 부활과 킬 칭호(킬러). 엄폐물 뒤 교전.",
  },
  {
    icon: "🛍️",
    title: "상점 · 인벤토리 · 경매장",
    desc: "액자·펫·날개·탈것(양탄자 5인 동승)·카트 스킨. 하트·코인 경제, ATM 복리, 유저 간 경매.",
  },
  {
    icon: "💗",
    title: "하이파이브 & 소셜",
    desc: "가까이 닿으면 하트와 프로필 카드. 친구·DM·따라가기, OX 파티 퀴즈, 출석 보상.",
  },
  {
    icon: "🌀",
    title: "세련된 워프 포탈",
    desc: "전체 미니맵에서 목적지를 고르고 게이지가 차오르면 순간이동. 파티원과 동시 워프.",
  },
  {
    icon: "🎨",
    title: "깊은 커스터마이즈",
    desc: "헤어·의상·표정·날개·펫·프로필 카드. 닉네임 위치, 고스트 모드, 미니게임까지.",
  },
];
