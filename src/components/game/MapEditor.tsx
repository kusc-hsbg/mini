"use client";

// 맵 에디터 (Build Tool + Mapmaker) — 타일/오브젝트/효과/포털/영역/라벨/박스선택/undo/저장.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameEngine } from "@/lib/game/engine";
import {
  MapData,
  TILE_INFO,
  type InteractionKind,
  type MapObject,
} from "@/lib/game/maps";
import { getPreset } from "@/lib/game/maps";
import { INTERACTION_LABELS, OBJECT_DEFS, OBJECT_KINDS, type ObjectKind } from "@/lib/game/objects";
import { saveRoomMap } from "@/app/actions";
import type { RoomRecord } from "@/lib/game/types";

type Mode =
  | { kind: "tile"; ch: string }
  | { kind: "object"; type: ObjectKind }
  | { kind: "erase" }
  | { kind: "select" }
  | { kind: "spawn" }
  | { kind: "spotlight" }
  | { kind: "portal" }
  | { kind: "portal-target"; portalId: string }
  | { kind: "area" }
  | { kind: "label" };

const TILE_PALETTE: { ch: string; label: string }[] = [
  { ch: ",", label: "잔디" },
  { ch: ";", label: "짙은 잔디" },
  { ch: "d", label: "흙길" },
  { ch: "s", label: "모래" },
  { ch: "-", label: "보도" },
  { ch: "=", label: "도로" },
  { ch: "~", label: "물" },
  { ch: ".", label: "실내 타일" },
  { ch: "w", label: "마루" },
  { ch: "k", label: "짙은 마루" },
  { ch: "c", label: "카펫(파랑)" },
  { ch: "m", label: "카펫(레드)" },
  { ch: "g", label: "카펫(그린)" },
  { ch: "#", label: "벽" },
  { ch: "x", label: "공백" },
  { ch: "B", label: "오토바이존" },
];

export default function MapEditor({
  engine,
  canvas,
  room,
  rooms,
  templateKey,
  onSaved,
  onClose,
}: {
  engine: GameEngine;
  canvas: HTMLCanvasElement;
  room: { id: string; name: string };
  rooms: RoomRecord[];
  templateKey: string;
  onSaved: () => void; // 저장 후 map-update 브로드캐스트
  onClose: () => void;
}) {
  const mapRef = useRef<MapData>(clone(engine.map));
  const undoRef = useRef<MapData[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "tile", ch: "." });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seq, setSeq] = useState(0); // 강제 리렌더용
  const painting = useRef(false);
  const boxStart = useRef<{ x: number; y: number } | null>(null);
  const rafPending = useRef(false);

  // 오브젝트 배치 옵션
  const [objName, setObjName] = useState("");
  const [objUrl, setObjUrl] = useState("");
  const [objText, setObjText] = useState("");
  const [objInteraction, setObjInteraction] = useState<InteractionKind | "">("");

  const apply = useCallback(
    (immediate = false) => {
      setDirty(true);
      if (immediate) {
        engine.setMap(clone(mapRef.current));
        return;
      }
      if (rafPending.current) return;
      rafPending.current = true;
      requestAnimationFrame(() => {
        rafPending.current = false;
        engine.setMap(clone(mapRef.current));
      });
    },
    [engine]
  );

  const snapshot = useCallback(() => {
    undoRef.current.push(clone(mapRef.current));
    if (undoRef.current.length > 30) undoRef.current.shift();
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (prev) {
      mapRef.current = prev;
      apply(true);
      setSeq((s) => s + 1);
    }
  }, [apply]);

  // 에디터 모드 켜기
  useEffect(() => {
    engine.editorMode = true;
    engine.inputLocked = false;
    return () => {
      engine.editorMode = false;
    };
  }, [engine]);

  const setTile = useCallback((x: number, y: number, ch: string) => {
    const m = mapRef.current;
    if (y < 0 || y >= m.tiles.length) return;
    const row = m.tiles[y];
    if (x < 0 || x >= row.length) return;
    m.tiles[y] = row.slice(0, x) + ch + row.slice(x + 1);
  }, []);

  const handleTileAction = useCallback(
    (tx: number, ty: number, isDown: boolean) => {
      const m = mapRef.current;
      switch (mode.kind) {
        case "tile":
          setTile(tx, ty, mode.ch);
          apply();
          break;
        case "erase": {
          if (!isDown) return;
          const before = m.objects.length;
          m.objects = m.objects.filter((o) => {
            const def = OBJECT_DEFS[o.type];
            return !(tx >= o.x && tx < o.x + (def?.w ?? 1) && ty >= o.y && ty < o.y + (def?.h ?? 1));
          });
          m.portals = m.portals.filter((p) => !(p.x === tx && p.y === ty));
          m.spawns = m.spawns.filter((s) => !(s.x === tx && s.y === ty));
          m.spotlights = m.spotlights.filter((s) => !(s.x === tx && s.y === ty));
          m.labels = m.labels.filter((l) => !(l.x === tx && l.y === ty));
          m.areas = m.areas.filter(
            (a) => !(tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h) ||
              !confirm(`프라이빗 영역 "${a.name}" 을 삭제할까요?`)
          );
          if (m.objects.length !== before) setSeq((s) => s + 1);
          apply(true);
          break;
        }
        case "object": {
          if (!isDown) return;
          const id = `obj-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
          const o: MapObject = { id, type: mode.type, x: tx, y: ty };
          if (objName.trim()) o.name = objName.trim();
          const props: MapObject["props"] = {};
          if (objUrl.trim()) props.url = objUrl.trim();
          if (objText.trim()) props.text = objText.trim();
          if (objInteraction) props.interaction = objInteraction as InteractionKind;
          if (Object.keys(props).length) o.props = props;
          m.objects.push(o);
          apply(true);
          break;
        }
        case "spawn": {
          if (!isDown) return;
          const i = m.spawns.findIndex((s) => s.x === tx && s.y === ty);
          if (i >= 0) m.spawns.splice(i, 1);
          else m.spawns.push({ x: tx, y: ty });
          apply(true);
          break;
        }
        case "spotlight": {
          if (!isDown) return;
          const i = m.spotlights.findIndex((s) => s.x === tx && s.y === ty);
          if (i >= 0) m.spotlights.splice(i, 1);
          else m.spotlights.push({ x: tx, y: ty });
          apply(true);
          break;
        }
        case "label": {
          if (!isDown) return;
          const existing = m.labels.find((l) => l.x === tx && l.y === ty);
          const text = prompt("라벨 텍스트 (비우면 삭제):", existing?.text ?? "");
          if (text === null) return;
          m.labels = m.labels.filter((l) => !(l.x === tx && l.y === ty));
          if (text.trim()) m.labels.push({ x: tx, y: ty, text: text.trim().slice(0, 40) });
          apply(true);
          break;
        }
        case "portal": {
          if (!isDown) return;
          openPortalDialog(tx, ty);
          break;
        }
        case "portal-target": {
          if (!isDown) return;
          const p = m.portals.find((pp) => pp.id === mode.portalId);
          if (p) {
            p.tx = tx;
            p.ty = ty;
          }
          setMode({ kind: "portal" });
          apply(true);
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, objName, objUrl, objText, objInteraction, apply, setTile]
  );

  const openPortalDialog = useCallback(
    (tx: number, ty: number) => {
      const m = mapRef.current;
      const existing = m.portals.find((p) => p.x === tx && p.y === ty);
      if (existing && confirm("이 포털을 삭제할까요? (취소 = 유지)")) {
        m.portals = m.portals.filter((p) => p !== existing);
        apply(true);
        return;
      }
      const kindStr = prompt(
        "포털 종류: 1=같은 방 순간이동, 2=다른 방으로, 3=다른 스페이스로",
        "1"
      );
      if (!kindStr) return;
      const id = `po-${Date.now().toString(36)}`;
      if (kindStr === "1") {
        m.portals.push({ id, x: tx, y: ty, kind: "same", tx, ty, label: prompt("라벨(선택):") ?? undefined });
        alert("다음 클릭 위치가 목적지가 됩니다.");
        setMode({ kind: "portal-target", portalId: id });
      } else if (kindStr === "2") {
        const list = rooms.map((r, i) => `${i + 1}=${r.name}`).join(", ");
        const idx = parseInt(prompt(`목적지 방 번호 (${list})`, "1") ?? "", 10) - 1;
        const target = rooms[idx];
        if (!target) return;
        m.portals.push({
          id, x: tx, y: ty, kind: "room", roomId: target.id,
          label: prompt("라벨(선택):") ?? undefined,
          password: prompt("비밀번호 문으로 만들려면 비밀번호 입력 (비우면 없음):") || undefined,
          membersOnly: confirm("멤버 전용 문으로 만들까요?"),
        });
      } else {
        const slug = prompt("목적지 스페이스 slug 또는 ID:");
        if (!slug) return;
        m.portals.push({ id, x: tx, y: ty, kind: "space", spaceSlug: slug, label: prompt("라벨(선택):") ?? undefined });
      }
      apply(true);
    },
    [apply, rooms]
  );

  // 캔버스 포인터 이벤트
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = engine.screenToTile(e.clientX, e.clientY);
      if (mode.kind === "select" || mode.kind === "area") {
        boxStart.current = t;
        return;
      }
      snapshot();
      painting.current = true;
      handleTileAction(t.x, t.y, true);
    };
    const onMove = (e: PointerEvent) => {
      if (!painting.current) return;
      if (mode.kind !== "tile" && mode.kind !== "erase") return;
      const t = engine.screenToTile(e.clientX, e.clientY);
      handleTileAction(t.x, t.y, false);
    };
    const onUp = (e: PointerEvent) => {
      painting.current = false;
      if (boxStart.current) {
        const a = boxStart.current;
        const b = engine.screenToTile(e.clientX, e.clientY);
        boxStart.current = null;
        const x0 = Math.min(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const x1 = Math.max(a.x, b.x);
        const y1 = Math.max(a.y, b.y);
        const m = mapRef.current;
        if (mode.kind === "area") {
          const name = prompt("프라이빗 영역 이름:", "회의 영역");
          if (!name) return;
          const max = parseInt(prompt("최대 인원 (비우면 무제한):") ?? "", 10);
          snapshot();
          m.areas.push({
            id: `area-${Date.now().toString(36)}`,
            name: name.slice(0, 30),
            x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1,
            maxOccupancy: Number.isFinite(max) && max > 0 ? max : undefined,
            lockable: confirm("잠금 가능한 영역으로 만들까요?"),
          });
          apply(true);
        } else if (mode.kind === "select") {
          const hit = m.objects.filter((o) => {
            const def = OBJECT_DEFS[o.type];
            return o.x >= x0 && o.x + (def?.w ?? 1) - 1 <= x1 && o.y >= y0 && o.y + (def?.h ?? 1) - 1 <= y1;
          });
          const labels = m.labels.filter((l) => l.x >= x0 && l.x <= x1 && l.y >= y0 && l.y <= y1);
          if (hit.length + labels.length === 0) return;
          if (confirm(`선택 범위의 오브젝트 ${hit.length}개 / 라벨 ${labels.length}개를 삭제할까요?`)) {
            snapshot();
            m.objects = m.objects.filter((o) => !hit.includes(o));
            m.labels = m.labels.filter((l) => !labels.includes(l));
            apply(true);
          }
        }
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [canvas, engine, mode, handleTileAction, snapshot, apply]);

  // Ctrl+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  async function save() {
    setSaving(true);
    const res = await saveRoomMap(room.id, mapRef.current);
    setSaving(false);
    if (!("error" in res)) {
      setDirty(false);
      onSaved();
    } else {
      alert(`저장 실패: ${res.error}`);
    }
  }

  const objectsByCategory = useMemo(() => {
    const map = new Map<string, ObjectKind[]>();
    for (const k of OBJECT_KINDS) {
      const c = OBJECT_DEFS[k].category;
      map.set(c, [...(map.get(c) ?? []), k]);
    }
    return map;
  }, []);

  const needsProps = mode.kind === "object";

  return (
    <div className="pointer-events-auto flex h-full w-72 flex-col border-r border-white/10 bg-panel/95 text-sm backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
        <h3 className="font-semibold text-white">🛠️ 맵 에디터</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3" key={seq}>
        {/* 도구 */}
        <div className="grid grid-cols-3 gap-1">
          <Tool active={mode.kind === "select"} onClick={() => setMode({ kind: "select" })}>⬚ 박스선택</Tool>
          <Tool active={mode.kind === "erase"} onClick={() => setMode({ kind: "erase" })}>🧹 지우기</Tool>
          <Tool active={false} onClick={undo}>↩️ 실행취소</Tool>
          <Tool active={mode.kind === "spawn"} onClick={() => setMode({ kind: "spawn" })}>🟢 스폰</Tool>
          <Tool active={mode.kind === "spotlight"} onClick={() => setMode({ kind: "spotlight" })}>🎤 스포트라이트</Tool>
          <Tool active={mode.kind === "portal" || mode.kind === "portal-target"} onClick={() => setMode({ kind: "portal" })}>🌀 포털</Tool>
          <Tool active={mode.kind === "area"} onClick={() => setMode({ kind: "area" })}>🟪 영역(드래그)</Tool>
          <Tool active={mode.kind === "label"} onClick={() => setMode({ kind: "label" })}>🔤 라벨</Tool>
        </div>

        {mode.kind === "portal-target" && (
          <p className="rounded-lg bg-accent/10 p-2 text-xs text-accent">
            맵에서 포털 목적지 타일을 클릭하세요.
          </p>
        )}

        {/* 타일 팔레트 */}
        <div>
          <div className="mb-1 text-xs font-medium text-slate-400">바닥/벽 타일 (드래그로 칠하기)</div>
          <div className="grid grid-cols-4 gap-1">
            {TILE_PALETTE.map((t) => (
              <button
                key={t.ch}
                onClick={() => setMode({ kind: "tile", ch: t.ch })}
                className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-[10px] ${
                  mode.kind === "tile" && mode.ch === t.ch
                    ? "bg-accent/30 ring-1 ring-accent"
                    : "bg-panel2 hover:bg-white/10"
                }`}
              >
                <span
                  className="h-5 w-5 rounded"
                  style={{ backgroundColor: TILE_INFO[t.ch]?.color }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 오브젝트 피커 */}
        <div>
          <div className="mb-1 text-xs font-medium text-slate-400">오브젝트</div>
          {[...objectsByCategory.entries()].map(([cat, kinds]) => (
            <div key={cat} className="mb-1.5">
              <div className="mb-0.5 text-[10px] text-slate-500">{cat}</div>
              <div className="flex flex-wrap gap-1">
                {kinds.map((k) => (
                  <button
                    key={k}
                    onClick={() => setMode({ kind: "object", type: k })}
                    className={`rounded-lg px-2 py-1 text-[11px] ${
                      mode.kind === "object" && mode.type === k
                        ? "bg-accent text-white"
                        : "bg-panel2 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {OBJECT_DEFS[k].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 오브젝트 속성 */}
        {needsProps && (
          <div className="space-y-1.5 rounded-xl bg-panel2 p-2">
            <div className="text-xs font-medium text-slate-300">배치 옵션</div>
            <input className="input bg-panel text-xs" placeholder="이름 (선택)" value={objName} onChange={(e) => setObjName(e.target.value)} />
            <input className="input bg-panel text-xs" placeholder="URL (웹/영상/이미지/사운드/커스텀)" value={objUrl} onChange={(e) => setObjUrl(e.target.value)} />
            <textarea className="input min-h-[40px] resize-none bg-panel text-xs" placeholder="노트 내용 (note 오브젝트)" value={objText} onChange={(e) => setObjText(e.target.value)} />
            <select
              className="input bg-panel text-xs"
              value={objInteraction}
              onChange={(e) => setObjInteraction(e.target.value as InteractionKind | "")}
            >
              <option value="">상호작용: 기본값</option>
              {Object.entries(INTERACTION_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
        )}

        {/* 템플릿 리셋 */}
        <button
          onClick={() => {
            if (confirm("이 방을 템플릿 원본으로 초기화할까요? (저장 전까지는 되돌릴 수 있음)")) {
              snapshot();
              mapRef.current = clone(getPreset(templateKey));
              apply(true);
            }
          }}
          className="btn-ghost w-full text-xs"
        >
          🔄 템플릿으로 초기화
        </button>
      </div>

      <div className="border-t border-white/5 p-3">
        <button onClick={save} disabled={saving || !dirty} className="btn-primary w-full disabled:opacity-40">
          {saving ? "저장 중..." : dirty ? "💾 맵 저장 (모두에게 적용)" : "변경 사항 없음"}
        </button>
      </div>
    </div>
  );
}

function Tool({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-1.5 py-1.5 text-[11px] ${
        active ? "bg-accent text-white" : "bg-panel2 text-slate-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
