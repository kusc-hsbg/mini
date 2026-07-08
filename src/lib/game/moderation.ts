// 금칙어 필터 — 채팅/소개/게시글/쪽지 등 사용자 입력 텍스트를 정화한다.
// 완벽한 차단이 아니라 "명백한 욕설/비속어"를 마스킹하는 1차 방어선.

// 소문자/공백제거 후 비교할 기본 금칙어(부분일치). 한국어 + 영어.
const BANNED = [
  // 한국어 비속어(대표적인 것 위주)
  "시발", "씨발", "시팔", "씨팔", "쓰발", "ㅆㅂ", "ㅅㅂ", "시바", "씨바",
  "병신", "빙신", "ㅄ", "ㅂㅅ", "지랄", "ㅈㄹ", "존나", "존만", "좆", "좃",
  "개새끼", "개새", "새끼", "썅", "썅년", "년놈", "creep",
  "미친놈", "미친년", "닥쳐", "꺼져", "엿먹", "느금", "니미", "애미", "애비",
  "보지", "자지", "섹스", "야동", "걸레", "창녀", "쌍놈", "쌍년",
  // 영어 비속어
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "pussy", "cunt",
  "motherfucker", "nigger", "faggot", "slut", "whore",
];

// 성능을 위해 정규식 하나로 합침(부분일치, 대소문자 무시).
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RE = new RegExp("(" + BANNED.map(escape).join("|") + ")", "gi");

// 금칙어를 별표(*)로 치환한 텍스트를 반환.
export function filterProfanity(text: string): string {
  if (!text) return text;
  return text.replace(RE, (m) => "*".repeat(Math.max(2, m.length)));
}

// 금칙어 포함 여부.
export function hasProfanity(text: string): boolean {
  if (!text) return false;
  RE.lastIndex = 0;
  return RE.test(text);
}
