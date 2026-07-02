import Link from "next/link";
import { getSessionContext } from "@/lib/auth";
import CustomizeForm from "@/components/CustomizeForm";

export default async function CustomizePage() {
  const { configured, profile } = await getSessionContext();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">캐릭터 꾸미기</h1>
        <Link href="/spaces" className="text-sm text-slate-400 hover:text-white">
          건너뛰기 →
        </Link>
      </div>
      <div className="card">
        <CustomizeForm profile={profile} configured={configured} />
      </div>
    </main>
  );
}
