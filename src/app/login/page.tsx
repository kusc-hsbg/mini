import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import LoginButtons from "@/components/LoginButtons";

export default async function LoginPage() {
  const { configured, userId } = await getSessionContext();
  if (userId) redirect("/spaces");

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card w-full max-w-sm">
        <Link href="/" className="text-sm text-slate-400 hover:text-white">
          ← 홈
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-white">로그인</h1>
        <p className="mt-1 mb-6 text-sm text-slate-400">
          내 캐릭터를 저장하고 어디서든 이어서 즐기세요.
        </p>
        <LoginButtons configured={configured} />
      </div>
    </main>
  );
}
