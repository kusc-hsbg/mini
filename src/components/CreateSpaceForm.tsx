"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSpace } from "@/app/actions";

export default function CreateSpaceForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createSpace({
        name: name.trim() || "새 스페이스",
        description: description.trim(),
        is_public: isPublic,
      });
      if ("error" in res) setError(res.error);
      else router.push(`/s/${res.id}`);
    });
  }

  return (
    <div className="card">
      <h2 className="font-semibold text-white">🏗️ 스페이스 만들기</h2>
      <p className="mb-4 mt-1 text-sm text-slate-400">
        광장·오피스·파크·서킷·비치·스타홀 등 프리셋 맵이 자동 생성됩니다. 생성 후 설정에서 방 추가, 비밀번호,
        멤버 역할, 게스트 체크인 등을 관리할 수 있어요.
      </p>
      <div className="space-y-3">
        <input
          className="input"
          placeholder="스페이스 이름"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          placeholder="설명 (선택)"
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 accent-[#6c8cff]"
          />
          공개 스페이스 (로비 목록에 표시)
        </label>
        <button onClick={submit} disabled={pending} className="btn-primary">
          {pending ? "생성 중..." : "만들고 입장 →"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
