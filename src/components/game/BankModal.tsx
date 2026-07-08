"use client";

// 하트 ATM (feature #15) — 예치/출금(복리 이자 1%/일) + 친구에게 송금.
import { useEffect, useState, useTransition } from "react";
import { Modal } from "./ui";
import {
  refreshBank,
  depositBank,
  withdrawBank,
  transferHearts,
  getFriends,
  type FriendEntry,
} from "@/app/actions";

export default function BankModal({
  hearts,
  onHearts,
  onClose,
}: {
  hearts: number;
  onHearts: (h: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"bank" | "send">("bank");
  const [bank, setBank] = useState(0);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [target, setTarget] = useState<string>("");

  useEffect(() => {
    refreshBank().then((res) => {
      if (!("error" in res)) {
        setBank(res.bank);
        onHearts(res.hearts);
        if (res.gained > 0) setMsg(`💹 이자 +${res.gained}💗 가 붙었어요!`);
      }
    });
    getFriends().then((res) => {
      if (!("error" in res)) {
        const acc = res.friends.filter((f) => f.status === "accepted");
        setFriends(acc);
        if (acc[0]) setTarget(acc[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const n = Math.max(0, Math.floor(Number(amount) || 0));

  function doDeposit() {
    startTransition(async () => {
      const res = await depositBank(n);
      if ("error" in res) return setMsg("❌ " + res.error);
      setBank(res.bank);
      onHearts(res.hearts);
      setAmount("");
      setMsg(`🏦 ${n}💗 예치 완료`);
    });
  }
  function doWithdraw() {
    startTransition(async () => {
      const res = await withdrawBank(n);
      if ("error" in res) return setMsg("❌ " + res.error);
      setBank(res.bank);
      onHearts(res.hearts);
      setAmount("");
      setMsg(`💵 ${n}💗 출금 완료`);
    });
  }
  function doSend() {
    if (!target) return setMsg("송금할 친구를 선택하세요.");
    startTransition(async () => {
      const res = await transferHearts(target, n);
      if ("error" in res) return setMsg("❌ " + res.error);
      onHearts(res.hearts);
      setAmount("");
      const name = friends.find((f) => f.id === target)?.name ?? "친구";
      setMsg(`💸 ${name}님에게 ${n}💗 송금 완료`);
    });
  }

  return (
    <Modal title="🏦 하트 은행 (ATM)" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-4 rounded-xl bg-panel2 px-3 py-2 text-sm">
          <span className="text-pink-400">지갑 💗 {hearts.toLocaleString()}</span>
          <span className="text-emerald-400">예치금 🏦 {bank.toLocaleString()}</span>
        </div>
        <p className="text-xs text-slate-500">예치금은 하루 1% 복리 이자가 붙어요 (접속/거래 시 정산).</p>

        <div className="flex gap-1.5">
          {([["bank", "예치/출금"], ["send", "송금"]] as [typeof tab, string][]).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                tab === k ? "bg-accent text-white" : "bg-panel2 text-slate-300 hover:bg-panel2/70"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="금액(하트)"
          className="input bg-panel2"
        />

        {tab === "bank" ? (
          <div className="flex gap-2">
            <button onClick={doDeposit} disabled={pending || n < 1} className="btn-primary flex-1 disabled:opacity-40">
              예치 →🏦
            </button>
            <button onClick={doWithdraw} disabled={pending || n < 1} className="btn-ghost flex-1 disabled:opacity-40">
              출금 →💗
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {friends.length === 0 ? (
              <p className="text-sm text-slate-400">송금하려면 먼저 친구를 추가하세요.</p>
            ) : (
              <>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="input bg-panel2"
                >
                  {friends.map((f) => (
                    <option key={f.id} value={f.id} className="bg-panel">
                      {f.name}
                    </option>
                  ))}
                </select>
                <button onClick={doSend} disabled={pending || n < 1} className="btn-primary w-full disabled:opacity-40">
                  💸 송금하기
                </button>
              </>
            )}
          </div>
        )}

        {msg && <div className="rounded-lg bg-panel2 px-3 py-2 text-sm text-slate-200">{msg}</div>}
      </div>
    </Modal>
  );
}
