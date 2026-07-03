"use client";

// 근접/프라이빗영역/스포트라이트 기반 P2P 영상 대화 (카메라 전용 mesh).
// 시그널링은 Supabase Realtime broadcast('signal') 사용, STUN 은 구글 공개 서버.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SignalData } from "@/lib/realtime/protocol";

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export interface RemotePeer {
  id: string;
  stream: MediaStream | null; // 카메라
}

interface PeerRec {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  streams: MediaStream[];
}

export interface WebRTCApi {
  peers: RemotePeer[];
  camOn: boolean;
  localStream: MediaStream | null;
  mediaError: string | null;
  toggleCam: () => Promise<void>;
  handleSignal: (from: string, data: SignalData) => void;
  setDesired: (ids: string[]) => void;
  shutdown: () => void;
}

export function useWebRTC(opts: {
  selfId: string;
  enabled: boolean;
  send: (to: string, data: SignalData) => void;
  onMediaChange?: (cam: boolean) => void;
}): WebRTCApi {
  const { selfId, enabled } = opts;
  const sendRef = useRef(opts.send);
  sendRef.current = opts.send;
  const onMediaChangeRef = useRef(opts.onMediaChange);
  onMediaChangeRef.current = opts.onMediaChange;

  const peersRef = useRef(new Map<string, PeerRec>());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const localStreamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // ---------- 피어 관리 ----------

  const createPeer = useCallback(
    (peerId: string): PeerRec => {
      const pc = new RTCPeerConnection(ICE);
      const rec: PeerRec = {
        pc,
        polite: selfId > peerId,
        makingOffer: false,
        ignoreOffer: false,
        streams: [],
      };

      pc.onnegotiationneeded = async () => {
        try {
          rec.makingOffer = true;
          await pc.setLocalDescription();
          if (pc.localDescription)
            sendRef.current(peerId, { sdp: pc.localDescription.toJSON() });
        } catch {
          // 협상 실패는 다음 트리거에서 재시도
        } finally {
          rec.makingOffer = false;
        }
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) sendRef.current(peerId, { candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        for (const st of e.streams) {
          if (!rec.streams.some((s) => s.id === st.id)) {
            rec.streams.push(st);
            st.onremovetrack = () => {
              if (st.getTracks().length === 0) {
                rec.streams = rec.streams.filter((s) => s.id !== st.id);
                bump();
              }
            };
          }
        }
        bump();
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          try {
            pc.restartIce();
          } catch {}
        }
        bump();
      };

      // 현재 로컬 카메라 트랙 추가
      const ls = localStreamRef.current;
      if (ls) for (const t of ls.getTracks()) pc.addTrack(t, ls);

      peersRef.current.set(peerId, rec);
      bump();
      return rec;
    },
    [selfId, bump]
  );

  const closePeer = useCallback(
    (peerId: string, sendBye: boolean) => {
      const rec = peersRef.current.get(peerId);
      if (!rec) return;
      if (sendBye) sendRef.current(peerId, { bye: true });
      try {
        rec.pc.close();
      } catch {}
      peersRef.current.delete(peerId);
      bump();
    },
    [bump]
  );

  const setDesired = useCallback(
    (ids: string[]) => {
      if (!enabled) return;
      const want = new Set(ids.filter((i) => i !== selfId));
      for (const id of Array.from(peersRef.current.keys())) {
        if (!want.has(id)) closePeer(id, true);
      }
      // 카메라가 꺼져 있으면 굳이 연결을 만들 필요 없음 —
      // 상대가 카메라를 켜면 상대 쪽에서 offer 가 온다.
      if (!localStreamRef.current) return;
      for (const id of Array.from(want)) {
        if (!peersRef.current.has(id)) createPeer(id);
      }
    },
    [enabled, selfId, createPeer, closePeer]
  );

  const handleSignal = useCallback(
    (from: string, data: SignalData) => {
      if (!enabled) return;
      (async () => {
        if (data.bye) {
          closePeer(from, false);
          return;
        }
        let rec = peersRef.current.get(from);
        if (!rec) rec = createPeer(from);
        const pc = rec.pc;

        try {
          if (data.sdp) {
            const desc = data.sdp;
            const collision =
              desc.type === "offer" &&
              (rec.makingOffer || pc.signalingState !== "stable");
            rec.ignoreOffer = !rec.polite && collision;
            if (rec.ignoreOffer) return;
            await pc.setRemoteDescription(desc);
            if (desc.type === "offer") {
              await pc.setLocalDescription();
              if (pc.localDescription)
                sendRef.current(from, { sdp: pc.localDescription.toJSON() });
            }
          } else if (data.candidate) {
            try {
              await pc.addIceCandidate(data.candidate);
            } catch (err) {
              if (!rec.ignoreOffer) throw err;
            }
          }
        } catch {
          // 시그널링 에러는 무시하고 재협상에 맡김
        }
      })();
    },
    [enabled, createPeer, closePeer]
  );

  // ---------- 로컬 카메라 ----------

  const toggleCam = useCallback(async () => {
    setMediaError(null);
    const existing = localStreamRef.current;
    if (existing) {
      for (const track of existing.getTracks()) {
        peersRef.current.forEach((rec) => {
          const sender = rec.pc.getSenders().find((s) => s.track === track);
          if (sender) {
            try {
              rec.pc.removeTrack(sender);
            } catch {}
          }
        });
        track.stop();
      }
      localStreamRef.current = null;
      setCamOn(false);
      onMediaChangeRef.current?.(false);
      bump();
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: 15 },
      });
      localStreamRef.current = media;
      for (const t of media.getTracks()) {
        peersRef.current.forEach((rec) => {
          try {
            rec.pc.addTrack(t, media);
          } catch {}
        });
      }
      setCamOn(true);
      onMediaChangeRef.current?.(true);
      bump();
    } catch {
      setMediaError("카메라 권한을 허용해주세요.");
    }
  }, [bump]);

  const shutdown = useCallback(() => {
    for (const id of Array.from(peersRef.current.keys())) closePeer(id, true);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
  }, [closePeer]);

  useEffect(() => shutdown, [shutdown]);

  // ---------- React 표출 ----------
  const peers: RemotePeer[] = useMemo(() => {
    const out: RemotePeer[] = [];
    peersRef.current.forEach((rec, id) => {
      out.push({ id, stream: rec.streams[0] ?? null });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return {
    peers,
    camOn,
    localStream: localStreamRef.current,
    mediaError,
    toggleCam,
    handleSignal,
    setDesired,
    shutdown,
  };
}
