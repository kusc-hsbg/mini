"use client";

// 상점 / 인벤토리 / 환전 모달 (feature #5)
import { useState, useTransition } from "react";
import { Modal } from "./ui";
import { buyItem, equipItem, exchangeToCoins } from "@/app/actions";
import {
  HEARTS_PER_COIN,
  SHOP_CATEGORIES,
  SHOP_ITEMS,
  SHOP_MAP,
  type ShopCategory,
  type ShopItem,
} from "@/lib/game/shop";

export interface WalletState {
  hearts: number;
  coins: number;
  inventory: string[];
  equipped: Record<string, string>;
}

type Tab = "shop" | "inventory" | "exchange";

export default function StoreModal({
  wallet,
  onChange,
  onClose,
  loggedIn,
}: {
  wallet: WalletState;
  onChange: (w: Partial<WalletState>) => void;
  onClose: () => void;
  loggedIn: boolean;
}) {
  const [tab, setTab] = useState<Tab>("shop");
  const [cat, setCat] = useState<ShopCategory>("액자");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const owned = new Set(wallet.inventory);

  function doBuy(item: ShopItem) {
    setMsg(null);
    if (owned.has(item.key)) return;
    const bal = item.currency === "heart" ? wallet.hearts : wallet.coins;
    if (bal < item.price) {
      setMsg(item.currency === "heart" ? "❌ 하트가 부족합니다." : "❌ 코인이 부족합니다.");
      return;
    }
    if (!loggedIn) {
      // 게스트: 로컬 구매
      const inv = [...wallet.inventory, item.key];
      onChange(
        item.currency === "heart"
          ? { hearts: wallet.hearts - item.price, inventory: inv }
          : { coins: wallet.coins - item.price, inventory: inv }
      );
      setMsg(`✅ ${item.name} 구매 완료!`);
      return;
    }
    startTransition(async () => {
      const res = await buyItem(item.key);
      if ("error" in res) {
        setMsg("❌ " + res.error);
        return;
      }
      onChange({ hearts: res.hearts, coins: res.coins, inventory: res.inventory });
      setMsg(`✅ ${item.name} 구매 완료!`);
    });
  }

  function doEquip(slot: string, key: string | null) {
    if (!loggedIn) {
      const eq = { ...wallet.equipped };
      if (key === null) delete eq[slot];
      else eq[slot] = key;
      onChange({ equipped: eq });
      return;
    }
    startTransition(async () => {
      const res = await equipItem(slot, key);
      if ("error" in res) {
        setMsg("❌ " + res.error);
        return;
      }
      onChange({ equipped: res.equipped });
    });
  }

  function doExchange(n: number) {
    setMsg(null);
    const cost = n * HEARTS_PER_COIN;
    if (wallet.hearts < cost) {
      setMsg("❌ 하트가 부족합니다.");
      return;
    }
    if (!loggedIn) {
      onChange({ hearts: wallet.hearts - cost, coins: wallet.coins + n });
      setMsg(`✅ ${n}코인으로 환전했어요!`);
      return;
    }
    startTransition(async () => {
      const res = await exchangeToCoins(n);
      if ("error" in res) {
        setMsg("❌ " + res.error);
        return;
      }
      onChange({ hearts: res.hearts, coins: res.coins });
      setMsg(`✅ ${n}코인으로 환전했어요!`);
    });
  }

  const inv = wallet.inventory.map((k) => SHOP_MAP[k]).filter(Boolean) as ShopItem[];
  const slots: { slot: string; label: string }[] = [
    { slot: "frame", label: "액자" },
    { slot: "card", label: "프로필 카드" },
    { slot: "pet", label: "펫" },
    { slot: "mount", label: "탈것" },
    { slot: "wings", label: "날개" },
    { slot: "kart", label: "카트" },
  ];

  return (
    <Modal title="🛍️ 상점 & 인벤토리" onClose={onClose}>
      <div className="space-y-3">
        {/* 지갑 */}
        <div className="flex items-center gap-3 rounded-xl bg-panel2 px-3 py-2 text-sm">
          <span className="font-semibold text-pink-400">💗 {wallet.hearts.toLocaleString()}</span>
          <span className="font-semibold text-yellow-400">🪙 {wallet.coins.toLocaleString()}</span>
          <span className="ml-auto text-xs text-slate-500">1코인 = {HEARTS_PER_COIN.toLocaleString()}하트</span>
        </div>

        {/* 탭 */}
        <div className="flex gap-1.5">
          {([["shop", "🛒 상점"], ["inventory", "🎒 인벤토리"], ["exchange", "💱 환전"]] as [Tab, string][]).map(
            ([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  tab === k ? "bg-accent text-white" : "bg-panel2 text-slate-300 hover:bg-panel2/70"
                }`}
              >
                {l}
              </button>
            )
          )}
        </div>

        {msg && <div className="rounded-lg bg-panel2 px-3 py-2 text-sm text-slate-200">{msg}</div>}

        {/* 상점 */}
        {tab === "shop" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {SHOP_CATEGORIES.map((cc) => (
                <button
                  key={cc}
                  onClick={() => setCat(cc)}
                  className={`rounded-lg px-2.5 py-1 text-xs transition ${
                    cat === cc ? "bg-accent2 text-ink" : "bg-panel2 text-slate-300 hover:bg-panel2/70"
                  }`}
                >
                  {cc}
                </button>
              ))}
            </div>
            <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
              {SHOP_ITEMS.filter((i) => i.category === cat).map((item) => {
                const has = owned.has(item.key);
                const bal = item.currency === "heart" ? wallet.hearts : wallet.coins;
                const canAfford = bal >= item.price;
                return (
                  <div key={item.key} className="flex flex-col rounded-xl bg-panel2 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{item.icon}</span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{item.name}</div>
                        <div className="text-xs text-slate-400">
                          {item.currency === "heart" ? "💗" : "🪙"} {item.price.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {item.desc && <p className="mt-1 text-[11px] text-slate-500">{item.desc}</p>}
                    <button
                      disabled={has || pending || !canAfford}
                      onClick={() => doBuy(item)}
                      className={`mt-2 rounded-lg px-2 py-1 text-xs font-medium transition ${
                        has
                          ? "bg-slate-700 text-slate-400"
                          : canAfford
                            ? "bg-accent text-white hover:brightness-110"
                            : "bg-slate-700 text-slate-500"
                      }`}
                    >
                      {has ? "보유중" : canAfford ? "구매" : "잔액 부족"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 인벤토리 */}
        {tab === "inventory" && (
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {inv.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">보유한 아이템이 없어요. 상점에서 구매해보세요!</p>
            )}
            {slots.map(({ slot, label }) => {
              const items = inv.filter((i) => i.slot === slot);
              if (!items.length) return null;
              const eq = wallet.equipped[slot];
              return (
                <div key={slot}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                    <span>{label}</span>
                    {eq && (
                      <button
                        onClick={() => doEquip(slot, null)}
                        className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] hover:text-white"
                      >
                        해제
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => doEquip(slot, item.key)}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition ${
                          eq === item.key
                            ? "bg-accent text-white ring-2 ring-accent"
                            : "bg-panel2 text-slate-200 hover:bg-panel2/70"
                        }`}
                      >
                        <span className="text-lg">{item.icon}</span>
                        {item.name}
                        {eq === item.key && <span className="text-[10px]">✓장착</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* 슬롯 없는 아이템(감정표현/소모품) */}
            {inv.filter((i) => i.slot === "none").length > 0 && (
              <div>
                <div className="mb-1 text-xs text-slate-400">기타 (감정표현·소모품)</div>
                <div className="flex flex-wrap gap-2">
                  {inv
                    .filter((i) => i.slot === "none")
                    .map((item) => (
                      <span
                        key={item.key}
                        className="flex items-center gap-1.5 rounded-lg bg-panel2 px-2.5 py-1.5 text-sm text-slate-200"
                      >
                        <span className="text-lg">{item.icon}</span>
                        {item.name}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 환전 */}
        {tab === "exchange" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              수많은 하트를 코인으로 바꿔 고급 탈것을 구매하거나 강화하세요.
            </p>
            <div className="flex flex-wrap gap-2">
              {[1, 5, 10].map((n) => (
                <button
                  key={n}
                  disabled={pending || wallet.hearts < n * HEARTS_PER_COIN}
                  onClick={() => doExchange(n)}
                  className="rounded-lg bg-accent px-3 py-2 text-sm text-white transition hover:brightness-110 disabled:bg-slate-700 disabled:text-slate-500"
                >
                  💗 {(n * HEARTS_PER_COIN).toLocaleString()} → 🪙 {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
