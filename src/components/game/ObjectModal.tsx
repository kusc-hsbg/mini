"use client";

// 오브젝트 상호작용 모달: 웹사이트/이미지/영상/외부회의/노트/외부게임/Spotify.
import { Modal } from "./ui";
import { toSpotifyEmbed, toVideoEmbed } from "@/lib/embed";
import type { InteractionKind, MapObject } from "@/lib/game/maps";
import { objectInteraction } from "@/lib/game/maps";

export default function ObjectModal({
  obj,
  onClose,
}: {
  obj: MapObject;
  onClose: () => void;
}) {
  const kind: InteractionKind = objectInteraction(obj);
  const url = obj.props?.url ?? "";
  const title = obj.name ?? "오브젝트";
  const subtitle = obj.props?.title;

  let body: React.ReactNode = null;
  let wide = true;

  switch (kind) {
    case "website":
    case "game": {
      body = url ? (
        <div className="flex h-[70vh] flex-col gap-2">
          <iframe
            src={url}
            className="min-h-0 w-full flex-1 rounded-lg border border-white/10 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"
            allow="fullscreen"
          />
          <div className="flex justify-end">
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
              새 탭에서 열기 ↗ (임베드가 안 보이면 사이트가 iframe 을 차단한 것입니다)
            </a>
          </div>
        </div>
      ) : (
        <Empty text="URL이 설정되지 않았습니다. 맵 에디터에서 URL을 지정하세요." />
      );
      break;
    }
    case "image": {
      body = url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={title} className="max-h-[70vh] w-full rounded-lg object-contain" />
      ) : (
        <Empty text="이미지 URL이 설정되지 않았습니다." />
      );
      break;
    }
    case "video": {
      const embed = url ? toVideoEmbed(url) : null;
      body = embed ? (
        <iframe
          src={embed}
          className="aspect-video w-full rounded-lg border border-white/10"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        />
      ) : (
        <Empty text="영상 URL이 설정되지 않았습니다. (YouTube/Vimeo/Twitch 지원)" />
      );
      break;
    }
    case "spotify": {
      const embed = url ? toSpotifyEmbed(url) : null;
      body = embed ? (
        <iframe
          src={embed}
          className="h-[352px] w-full rounded-lg"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      ) : (
        <Empty text="Spotify URL이 설정되지 않았습니다. (트랙/앨범/플레이리스트 링크)" />
      );
      break;
    }
    case "external": {
      wide = false;
      body = (
        <div className="space-y-4 text-center">
          <p className="text-slate-300">외부 화상회의로 연결합니다 (Zoom / Meet / Teams / Webex 등).</p>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="btn-primary inline-flex">
              🎥 회의 참여하기 ↗
            </a>
          ) : (
            <Empty text="회의 URL이 설정되지 않았습니다." />
          )}
        </div>
      );
      break;
    }
    case "note":
    default: {
      wide = false;
      body = (
        <div className="whitespace-pre-wrap rounded-lg bg-panel2 p-4 text-sm leading-relaxed text-slate-200">
          {subtitle && (
            <div className="mb-3 border-b border-white/10 pb-3">
              <div className="text-xs text-accent2">전시 프로필</div>
              <div className="mt-1 text-base font-semibold text-white">{subtitle}</div>
            </div>
          )}
          {obj.props?.text || "내용이 없습니다."}
        </div>
      );
      break;
    }
  }

  return (
    <Modal title={`${iconOf(kind)} ${title}`} onClose={onClose} wide={wide}>
      {body}
    </Modal>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-slate-400">{text}</p>;
}

function iconOf(kind: InteractionKind): string {
  switch (kind) {
    case "website": return "🌐";
    case "image": return "🖼️";
    case "video": return "📺";
    case "external": return "🎥";
    case "spotify": return "🎵";
    case "game": return "🎮";
    default: return "📄";
  }
}
