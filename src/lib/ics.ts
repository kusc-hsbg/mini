// 회의를 .ics 파일로 내보내기 (Google Calendar / Outlook 에서 가져오기 가능).
import type { MeetingRecord } from "@/lib/game/types";

function fmt(dt: string): string {
  return new Date(dt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function meetingToIcs(m: MeetingRecord, spaceUrl: string): string {
  const uid = `${m.id}@pixeltown`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PixelTown//Meeting//KO",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(m.starts_at)}`,
    `DTEND:${fmt(m.ends_at)}`,
    `SUMMARY:${m.title.replace(/\n/g, " ")}`,
    `LOCATION:PixelTown ${m.location_kind === "area" ? `회의 영역 ${m.location_ref ?? ""}` : m.location_kind === "desk" ? "데스크" : "스폰 위치"}`,
    `DESCRIPTION:PixelTown에서 참여: ${spaceUrl}?meeting=${m.id}`,
    `URL:${spaceUrl}?meeting=${m.id}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(m: MeetingRecord, spaceUrl: string) {
  const blob = new Blob([meetingToIcs(m, spaceUrl)], {
    type: "text/calendar;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${m.title.replace(/[^\w가-힣]/g, "_")}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}
