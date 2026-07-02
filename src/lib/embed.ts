// 외부 미디어 URL → 임베드 URL 변환.

export function toVideoEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
      if (u.pathname.startsWith("/live/"))
        return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
    }
    if (host === "youtu.be") {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (host === "vimeo.com") {
      return `https://player.vimeo.com/video/${u.pathname.slice(1)}`;
    }
    if (host === "twitch.tv") {
      const chan = u.pathname.slice(1).split("/")[0];
      if (typeof window !== "undefined")
        return `https://player.twitch.tv/?channel=${chan}&parent=${window.location.hostname}`;
    }
    return url; // 그 외에는 그대로 iframe 시도
  } catch {
    return null;
  }
}

export function toSpotifyEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("spotify.com")) return null;
    if (u.pathname.startsWith("/embed/")) return url;
    return `https://open.spotify.com/embed${u.pathname}`;
  } catch {
    return null;
  }
}
