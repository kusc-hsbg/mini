"use client";

// 게시판 오브젝트 — 공지/링크 게시 (Supabase 영속화).
import { useEffect, useState, useTransition } from "react";
import { Modal } from "./ui";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { addBulletinPost, deleteBulletinPost } from "@/app/actions";
import type { BulletinPost } from "@/lib/game/types";

export default function BulletinModal({
  spaceId,
  roomId,
  objectId,
  title,
  myName,
  loggedIn,
  isMod,
  onClose,
}: {
  spaceId: string;
  roomId: string;
  objectId: string;
  title: string;
  myName: string;
  loggedIn: boolean;
  isMod: boolean;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<BulletinPost[] | null>(null);
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();

  async function load() {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setPosts([]);
      return;
    }
    const { data } = await supabase
      .from("bulletin_posts")
      .select("*")
      .eq("room_id", roomId)
      .eq("object_id", objectId)
      .order("created_at", { ascending: false })
      .limit(50);
    setPosts((data as BulletinPost[]) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, objectId]);

  function submit() {
    const text = content.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await addBulletinPost({
        spaceId,
        roomId,
        objectId,
        authorName: myName,
        content: text,
        url: url.trim() || null,
      });
      if (!("error" in res)) {
        setContent("");
        setUrl("");
        load();
      }
    });
  }

  return (
    <Modal title={`📌 ${title}`} onClose={onClose}>
      <div className="space-y-4">
        {loggedIn ? (
          <div className="space-y-2 rounded-xl bg-panel2 p-3">
            <textarea
              className="input min-h-[60px] resize-none bg-panel"
              placeholder="공지/메모를 남겨보세요"
              value={content}
              maxLength={500}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="input bg-panel"
                placeholder="링크 (선택)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button onClick={submit} disabled={pending} className="btn-primary shrink-0">
                게시
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">로그인하면 글을 게시할 수 있습니다.</p>
        )}

        {posts === null ? (
          <p className="py-6 text-center text-slate-400">불러오는 중...</p>
        ) : posts.length === 0 ? (
          <p className="py-6 text-center text-slate-400">아직 게시물이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id} className="rounded-xl bg-panel2 p-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-medium text-slate-300">{p.author_name}</span>
                  <span className="flex items-center gap-2">
                    {new Date(p.created_at).toLocaleString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {isMod && (
                      <button
                        onClick={() =>
                          startTransition(async () => {
                            await deleteBulletinPost(p.id);
                            load();
                          })
                        }
                        className="text-red-400 hover:text-red-300"
                      >
                        삭제
                      </button>
                    )}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-100">{p.content}</p>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-accent hover:underline"
                  >
                    🔗 {p.url.slice(0, 60)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
