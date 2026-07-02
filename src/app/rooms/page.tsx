import { redirect } from "next/navigation";

// 구버전 경로 호환 — 스페이스 로비로 이동.
export default function LegacyRoomsPage() {
  redirect("/spaces");
}
