import React from "react";

// 일반 텍스트 안의 URL(http/https)을 자동으로 클릭 가능한 링크로 변환한다.
// 채팅·게시판·노트 등 사용자가 입력한 텍스트에서 링크를 눌러 이동할 수 있게 한다.
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;!?)\]}"'])/gi;

export function Linkify({ text, linkClassName }: { text: string; linkClassName?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const href = m[0];
    parts.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => e.stopPropagation()}
        className={
          linkClassName ??
          "font-medium text-accent underline underline-offset-2 hover:opacity-80 break-all"
        }
      >
        {href}
      </a>
    );
    last = m.index + href.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
