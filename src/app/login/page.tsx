import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import LoginButtons from "@/components/LoginButtons";

export default async function LoginPage() {
  const { configured, userId } = await getSessionContext();
  if (userId) redirect("/spaces");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="orb" style={{ width: 420, height: 420, top: -120, left: -80, background: "#6c8cff" }} />
      <div className="orb" style={{ width: 360, height: 360, bottom: -140, right: -80, background: "#34d399" }} />
      <div className="pointer-events-none absolute inset-0 grid-bg" />

      <div className="glass fade-up relative z-10 w-full max-w-sm rounded-2xl p-7 shadow-2xl">
        <Link href="/" className="text-sm text-slate-400 transition hover:text-white">
          ← 홈
        </Link>
        <div className="brand-title mt-4 text-3xl">AFFINITY</div>
        <h1 className="mt-3 text-xl font-bold text-white">로그인</h1>
        <p className="mt-1 mb-6 text-sm text-slate-400">
          내 캐릭터와 하트·아이템을 저장하고 어디서든 이어서 즐기세요.
        </p>
        <LoginButtons configured={configured} />
      </div>
    </main>
  );
}
