"use client";

// 근접/프라이빗영역/스포트라이트 기반 P2P 음성·영상·화면공유 (mesh).
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
  stream: MediaStream | null; // 카메라+마이크
  screen: MediaStream | null; // 화면 공유
}

interface PeerRec {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  remoteScreenId: string | null;
  streams: MediaStream[];
}

export interface WebRTCApi {
  peers: RemotePeer[];
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  localStream: MediaStream | null;
  localScreen: MediaStream | null;
  mediaError: string | null;
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
  toggleShare: () => Promise<void>;
  forceMute: () => void;
  handleSignal: (from: string, data: SignalData) => void;
  setDesired: (ids: string[]) => void;
  shutdown: () => void;
}

export function useWebRTC(opts: {
  selfId: string;
  enabled: boolean;
  send: (to: string, data: SignalData) => void;
  onSpeaking?: (id: string, speaking: boolean) => void;
  onMediaChange?: (mic: boolean, cam: boolean, sharing: boolean) => void;
}): WebRTCApi {
  const { selfId, enabled } = opts;
  const sendRef = useRef(opts.send);
  sendRef.current = opts.send;
  const onSpeakingRef = useRef(opts.onSpeaking);
  onSpeakingRef.current = opts.onSpeaking;
  const onMediaChangeRef = useRef(opts.onMediaChange);
  onMediaChangeRef.current = opts.onMediaChange;

  const peersRef = useRef(new Map<string, PeerRec>());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const localStreamRef = useRef<MediaStream | null>(null); // cam+mic
  const localScreenRef = useRef<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const notifyMedia = useCallback((m: boolean, c: boolean, s: boolean) => {
    onMediaChangeRef.current?.(m, c, s);
  }, []);

  // ---------- 피어 관리 ----------

  const classifyStreams = useCallback((rec: PeerRec) => {
    // remoteScreenId 기준으로 카메라/화면 스트림 구분
    bump();
  }, [bump]);

  const createPeer = useCallback(
    (peerId: string): PeerRec => {
      const pc = new RTCPeerConnection(ICE);
      const rec: PeerRec = {
        pc,
        polite: selfId > peerId,
        makingOffer: false,
        ignoreOffer: false,
        remoteScreenId: null,
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

      // 현재 로컬 트랙 추가
      const ls = localStreamRef.current;
      if (ls) for (const t of ls.getTracks()) pc.addTrack(t, ls);
      const sc = localScreenRef.current;
      if (sc) for (const t of sc.getTracks()) pc.addTrack(t, sc);
      // 화면공유 중이면 메타 전달
      if (sc) sendRef.current(peerId, { meta: { screenId: sc.id } });

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

        if (data.meta !== undefined) {
          rec.remoteScreenId = data.meta.screenId ?? null;
          classifyStreams(rec);
          return;
        }
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
    [enabled, createPeer, closePeer, classifyStreams]
  );

  // ---------- 로컬 미디어 ----------

  const ensureLocalStream = useCallback(() => {
    if (!localStreamRef.current) localStreamRef.current = new MediaStream();
    return localStreamRef.current;
  }, []);

  const addLocalTrack = useCallback(
    (track: MediaStreamTrack, stream: MediaStream) => {
      peersRef.current.forEach((rec) => {
        try {
          rec.pc.addTrack(track, stream);
        } catch {}
      });
    },
    []
  );

  const removeLocalTrack = useCallback((track: MediaStreamTrack) => {
    peersRef.current.forEach((rec) => {
      const sender = rec.pc.getSenders().find((s) => s.track === track);
      if (sender) {
        try {
          rec.pc.removeTrack(sender);
        } catch {}
      }
    });
    track.stop();
  }, []);

  const toggleMic = useCallback(async () => {
    setMediaError(null);
    const ls = ensureLocalStream();
    const existing = ls.getAudioTracks()[0];
    if (existing) {
      removeLocalTrack(existing);
      ls.removeTrack(existing);
      setMicOn(false);
      notifyMedia(false, ls.getVideoTracks().length > 0, !!localScreenRef.current);
      bump();
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = media.getAudioTracks()[0];
      ls.addTrack(track);
      addLocalTrack(track, ls);
      setMicOn(true);
      notifyMedia(true, ls.getVideoTracks().length > 0, !!localScreenRef.current);
      bump();
    } catch {
      setMediaError("마이크 권한을 허용해주세요.");
    }
  }, [ensureLocalStream, addLocalTrack, removeLocalTrack, notifyMedia, bump]);

  const toggleCam = useCallback(async () => {
    setMediaError(null);
    const ls = ensureLocalStream();
    const existing = ls.getVideoTracks()[0];
    if (existing) {
      removeLocalTrack(existing);
      ls.removeTrack(existing);
      setCamOn(false);
      notifyMedia(ls.getAudioTracks().length > 0, false, !!localScreenRef.current);
      bump();
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: 15 },
      });
      const track = media.getVideoTracks()[0];
      ls.addTrack(track);
      addLocalTrack(track, ls);
      setCamOn(true);
      notifyMedia(ls.getAudioTracks().length > 0, true, !!localScreenRef.current);
      bump();
    } catch {
      setMediaError("카메라 권한을 허용해주세요.");
    }
  }, [ensureLocalStream, addLocalTrack, removeLocalTrack, notifyMedia, bump]);

  const stopShare = useCallback(() => {
    const sc = localScreenRef.current;
    if (!sc) return;
    for (const t of sc.getTracks()) removeLocalTrack(t);
    localScreenRef.current = null;
    setSharing(false);
    peersRef.current.forEach((_, id) => sendRef.current(id, { meta: { screenId: null } }));
    const ls = localStreamRef.current;
    notifyMedia(
      (ls?.getAudioTracks().length ?? 0) > 0,
      (ls?.getVideoTracks().length ?? 0) > 0,
      false
    );
    bump();
  }, [removeLocalTrack, notifyMedia, bump]);

  const toggleShare = useCallback(async () => {
    setMediaError(null);
    if (localScreenRef.current) {
      stopShare();
      return;
    }
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 10 },
        audio: false,
      });
      localScreenRef.current = media;
      for (const t of media.getTracks()) {
        addLocalTrack(t, media);
        t.onended = () => stopShare(); // 브라우저 공유 중지 버튼
      }
      peersRef.current.forEach((_, id) =>
        sendRef.current(id, { meta: { screenId: media.id } })
      );
      setSharing(true);
      const ls = localStreamRef.current;
      notifyMedia(
        (ls?.getAudioTracks().length ?? 0) > 0,
        (ls?.getVideoTracks().length ?? 0) > 0,
        true
      );
      bump();
    } catch {
      // 사용자가 취소
    }
  }, [addLocalTrack, stopShare, notifyMedia, bump]);

  const forceMute = useCallback(() => {
    const ls = localStreamRef.current;
    const track = ls?.getAudioTracks()[0];
    if (track && ls) {
      removeLocalTrack(track);
      ls.removeTrack(track);
      setMicOn(false);
      notifyMedia(false, ls.getVideoTracks().length > 0, !!localScreenRef.current);
      bump();
    }
  }, [removeLocalTrack, notifyMedia, bump]);

  const shutdown = useCallback(() => {
    for (const id of Array.from(peersRef.current.keys())) closePeer(id, true);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localScreenRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    localScreenRef.current = null;
  }, [closePeer]);

  useEffect(() => shutdown, [shutdown]);

  // ---------- 말하기 감지 ----------
  useEffect(() => {
    if (!enabled) return;
    const audioCtx: AudioContext | null = null;
    let ctx: AudioContext | null = audioCtx;
    const analysers = new Map<string, { an: AnalyserNode; src: MediaStreamAudioSourceNode }>();
    const speaking = new Map<string, boolean>();

    const timer = setInterval(() => {
      try {
        if (!ctx && typeof AudioContext !== "undefined") ctx = new AudioContext();
        if (!ctx) return;

        const check = (id: string, stream: MediaStream | null) => {
          if (!stream || stream.getAudioTracks().length === 0) {
            if (speaking.get(id)) {
              speaking.set(id, false);
              onSpeakingRef.current?.(id, false);
            }
            return;
          }
          let entry = analysers.get(id);
          if (!entry) {
            try {
              const src = ctx!.createMediaStreamSource(stream);
              const an = ctx!.createAnalyser();
              an.fftSize = 256;
              src.connect(an);
              entry = { an, src };
              analysers.set(id, entry);
            } catch {
              return;
            }
          }
          const buf = new Uint8Array(entry.an.frequencyBinCount);
          entry.an.getByteFrequencyData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i];
          const level = sum / buf.length;
          const isSpeaking = level > 24;
          if (speaking.get(id) !== isSpeaking) {
            speaking.set(id, isSpeaking);
            onSpeakingRef.current?.(id, isSpeaking);
          }
        };

        check(selfId, localStreamRef.current);
        peersRef.current.forEach((rec, id) => {
          const cam = rec.streams.find((s) => s.id !== rec.remoteScreenId) ?? null;
          check(id, cam);
        });
      } catch {}
    }, 300);

    return () => {
      clearInterval(timer);
      analysers.forEach((e) => {
        try {
          e.src.disconnect();
        } catch {}
      });
      try {
        ctx?.close();
      } catch {}
    };
  }, [enabled, selfId]);

  // ---------- React 표출 ----------
  const peers: RemotePeer[] = useMemo(() => {
    const out: RemotePeer[] = [];
    peersRef.current.forEach((rec, id) => {
      const screen = rec.streams.find((s) => s.id === rec.remoteScreenId) ?? null;
      const cam = rec.streams.find((s) => s.id !== rec.remoteScreenId) ?? null;
      out.push({ id, stream: cam, screen });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  return {
    peers,
    micOn,
    camOn,
    sharing,
    localStream: localStreamRef.current,
    localScreen: localScreenRef.current,
    mediaError,
    toggleMic,
    toggleCam,
    toggleShare,
    forceMute,
    handleSignal,
    setDesired,
    shutdown,
  };
}
