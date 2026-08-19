"use client";

import { useMemo, useState, useTransition } from "react";
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

const CATEGORY_ICON: Record<ShopCategory, string> = {
  액자: "◇",
  프로필카드: "▣",
  탈것: "◆",
  펫: "●",
  날개: "✦",
  댄스: "♫",
  감정표현: "☺",
  카트: "▰",
  화살: "➶",
  소모품: "♪",
};

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

  const owned = useMemo(() => new Set(wallet.inventory), [wallet.inventory]);
  const inv = wallet.inventory.map((k) => SHOP_MAP[k]).filter(Boolean) as ShopItem[];
  const visibleItems = SHOP_ITEMS.filter((i) => i.category === cat);
  const featured = visibleItems[0];
  const slots: { slot: string; label: string }[] = [
    { slot: "frame", label: "액자" },
    { slot: "card", label: "카드" },
    { slot: "pet", label: "펫" },
    { slot: "mount", label: "탈것" },
    { slot: "wings", label: "날개" },
    { slot: "kart", label: "카트" },
    { slot: "dance", label: "댄스" },
  ];

  function doBuy(item: ShopItem) {
    setMsg(null);
    if (owned.has(item.key)) return;
    const bal = item.currency === "heart" ? wallet.hearts : wallet.coins;
    if (bal < item.price) {
      setMsg(item.currency === "heart" ? "하트 부족" : "코인 부족");
      return;
    }
    if (!loggedIn) {
      const invNext = [...wallet.inventory, item.key];
      onChange(
        item.currency === "heart"
          ? { hearts: wallet.hearts - item.price, inventory: invNext }
          : { coins: wallet.coins - item.price, inventory: invNext }
      );
      setMsg(`${item.name} 구매 완료`);
      return;
    }
    startTransition(async () => {
      const res = await buyItem(item.key);
      if ("error" in res) return setMsg(res.error);
      if ("degraded" in res) {
        const nextInv = wallet.inventory.includes(item.key) ? wallet.inventory : [...wallet.inventory, item.key];
        onChange(
          item.currency === "heart"
            ? { hearts: wallet.hearts - item.price, inventory: nextInv }
            : { coins: wallet.coins - item.price, inventory: nextInv }
        );
      } else {
        onChange({ hearts: res.hearts, coins: res.coins, inventory: res.inventory });
      }
      setMsg(`${item.name} 구매 완료`);
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
      if ("error" in res) return setMsg(res.error);
      if ("degraded" in res) {
        const eq = { ...wallet.equipped };
        if (key === null) delete eq[slot];
        else eq[slot] = key;
        onChange({ equipped: eq });
      } else {
        onChange({ equipped: res.equipped });
      }
    });
  }

  function doExchange(n: number) {
    setMsg(null);
    const cost = n * HEARTS_PER_COIN;
    if (wallet.hearts < cost) return setMsg("하트 부족");
    if (!loggedIn) {
      onChange({ hearts: wallet.hearts - cost, coins: wallet.coins + n });
      setMsg(`${n}코인 환전 완료`);
      return;
    }
    startTransition(async () => {
      const res = await exchangeToCoins(n);
      if ("error" in res) return setMsg(res.error);
      if ("degraded" in res) onChange({ hearts: wallet.hearts - cost, coins: wallet.coins + n });
      else onChange({ hearts: res.hearts, coins: res.coins });
      setMsg(`${n}코인 환전 완료`);
    });
  }

  return (
    <aside className="flex h-full w-[420px] max-w-[100vw] flex-col overflow-hidden rounded-l-[28px] border-l-4 border-white bg-gradient-to-b from-[#fff6e9] via-[#ffeef8] to-[#eef6ff] text-stone-700 shadow-2xl">
      <header className="relative overflow-hidden bg-gradient-to-r from-pink-300 via-amber-200 to-sky-300 px-5 py-5">
        <div className="pointer-events-none absolute -left-6 -top-8 h-24 w-24 rounded-full bg-white/25 blur-xl" />
        <div className="pointer-events-none absolute -right-4 bottom-0 h-16 w-16 rounded-full bg-white/30 blur-lg" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/80">🛍️ Market</div>
            <h2 className="mt-1 text-2xl font-extrabold text-white drop-shadow-sm">모여봐요 상점</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border-2 border-white/70 bg-white/20 text-lg font-bold text-white shadow-sm transition hover:scale-105 hover:bg-white/40"
            title="닫기"
          >
            ×
          </button>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <Balance label="❤️ 하트" value={wallet.hearts} tone="text-pink-500" />
          <Balance label="🪙 코인" value={wallet.coins} tone="text-amber-600" />
        </div>
        <div className="relative mt-3 grid grid-cols-3 gap-1.5 rounded-full bg-white/40 p-1.5 shadow-inner">
          {([["shop", "🛒 상점"], ["inventory", "🎒 가방"], ["exchange", "🏦 환전"]] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-full px-2 py-1.5 text-[12px] font-bold transition ${
                tab === k ? "bg-white text-pink-500 shadow-md scale-[1.02]" : "text-stone-600 hover:bg-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {msg && (
        <div className="mx-4 mt-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-600 shadow-sm">
          {msg}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "shop" && (
          <div className="grid h-full min-h-0 grid-cols-[56px_1fr] gap-3">
            <nav className="flex flex-col gap-2">
              {SHOP_CATEGORIES.map((cc) => (
                <button
                  key={cc}
                  onClick={() => setCat(cc)}
                  className={`grid h-12 w-12 place-items-center rounded-2xl border-2 text-lg font-bold transition ${
                    cat === cc
                      ? "border-amber-300 bg-gradient-to-br from-amber-200 to-pink-200 text-stone-700 shadow-[0_4px_12px_rgba(251,191,36,0.35)] scale-105"
                      : "border-white bg-white/70 text-stone-400 shadow-sm hover:scale-105 hover:border-amber-200"
                  }`}
                  title={cc}
                >
                  {CATEGORY_ICON[cc]}
                </button>
              ))}
            </nav>

            <div className="min-w-0 space-y-3">
              {featured && <FeaturedItem item={featured} owned={owned.has(featured.key)} onBuy={() => doBuy(featured)} pending={pending} wallet={wallet} />}
              <div className="grid grid-cols-2 gap-2.5">
                {visibleItems.slice(1).map((item) => (
                  <ShopCard
                    key={item.key}
                    item={item}
                    owned={owned.has(item.key)}
                    pending={pending}
                    wallet={wallet}
                    onBuy={() => doBuy(item)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "inventory" && (
          <div className="space-y-4">
            {inv.length === 0 && <EmptyState text="가방이 비어있어요" />}
            {slots.map(({ slot, label }) => {
              const items = inv.filter((i) => i.slot === slot);
              if (!items.length) return null;
              const eq = wallet.equipped[slot];
              return (
                <section key={slot}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[12px] font-bold uppercase tracking-[0.18em] text-pink-400">{label}</h3>
                    {eq && (
                      <button
                        onClick={() => doEquip(slot, null)}
                        className="rounded-full border-2 border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-400 shadow-sm hover:bg-stone-50"
                      >
                        해제
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {items.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => doEquip(slot, item.key)}
                        className={`group rounded-2xl border-2 p-2 text-left transition ${
                          eq === item.key
                            ? "border-sky-300 bg-sky-50 shadow-[0_4px_12px_rgba(125,211,252,0.3)]"
                            : "border-white bg-white/80 shadow-sm hover:border-sky-100 hover:scale-[1.02]"
                        }`}
                      >
                        <div className="relative h-16 overflow-hidden rounded-xl bg-gradient-to-b from-sky-50 to-white">
                          <div className="absolute inset-x-4 bottom-3 h-2 rounded-[50%] bg-sky-200/50 blur" />
                          <div className="absolute left-1/2 top-3 -translate-x-1/2 text-3xl transition group-hover:-translate-y-1">{item.icon}</div>
                        </div>
                        <div className="mt-2 truncate text-sm font-bold text-stone-600">{item.name}</div>
                        <div className={`text-[11px] font-bold ${eq === item.key ? "text-sky-500" : "text-stone-400"}`}>{eq === item.key ? "✔ 착용중" : "착용하기"}</div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {inv.filter((i) => i.slot === "none").length > 0 && (
              <section>
                <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.18em] text-pink-400">기타</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {inv
                    .filter((i) => i.slot === "none")
                    .map((item) => (
                      <div key={item.key} className="rounded-2xl border-2 border-white bg-white/80 p-2.5 shadow-sm">
                        <div className="text-3xl">{item.icon}</div>
                        <div className="mt-1 truncate text-sm font-bold text-stone-600">{item.name}</div>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "exchange" && (
          <div className="space-y-3">
            <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-pink-50 p-4 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-500">환율</div>
              <div className="mt-1 text-2xl font-extrabold text-stone-700">{HEARTS_PER_COIN.toLocaleString()} ❤️ = 1 🪙</div>
            </div>
            {[1, 5, 10].map((n) => (
              <button
                key={n}
                disabled={pending || wallet.hearts < n * HEARTS_PER_COIN}
                onClick={() => doExchange(n)}
                className="flex w-full items-center justify-between rounded-2xl border-2 border-white bg-white/80 px-4 py-3 text-left shadow-sm transition hover:scale-[1.02] hover:border-amber-200 disabled:opacity-40 disabled:hover:scale-100"
              >
                <span className="text-sm font-semibold text-stone-500">{(n * HEARTS_PER_COIN).toLocaleString()} ❤️</span>
                <span className="text-base font-extrabold text-amber-500">{n} 🪙</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function Balance({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border-2 border-white/60 bg-white/50 px-3 py-2 shadow-sm">
      <div className="text-[10px] font-bold tracking-[0.15em] text-stone-600">{label}</div>
      <div className={`mt-0.5 text-lg font-extrabold ${tone} bg-white/70 rounded-lg px-1 -mx-1`}>{value.toLocaleString()}</div>
    </div>
  );
}

function priceLabel(item: ShopItem) {
  return `${item.price.toLocaleString()} ${item.currency === "heart" ? "HEART" : "COIN"}`;
}

function canAfford(item: ShopItem, wallet: WalletState) {
  return item.currency === "heart" ? wallet.hearts >= item.price : wallet.coins >= item.price;
}

function FeaturedItem({
  item,
  owned,
  pending,
  wallet,
  onBuy,
}: {
  item: ShopItem;
  owned: boolean;
  pending: boolean;
  wallet: WalletState;
  onBuy: () => void;
}) {
  const afford = canAfford(item, wallet);
  return (
    <article className="overflow-hidden rounded-3xl border-2 border-white bg-white/70 shadow-md">
      <div className="relative h-44 bg-[radial-gradient(circle_at_50%_20%,rgba(253,224,71,0.35),transparent_45%),linear-gradient(180deg,#fff3d6,#ffe3f1)]">
        <div className="absolute inset-x-10 bottom-9 h-5 rounded-[50%] bg-sky-200/40 blur-md" />
        <div className="shop-float absolute left-1/2 top-10 -translate-x-1/2 text-7xl drop-shadow-sm">{item.icon}</div>
        <div className="absolute bottom-8 left-1/2 h-5 w-36 -translate-x-1/2 rounded-[50%] border border-white/60 bg-white/30" />
        <div className="absolute left-3 top-3 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] text-pink-500 shadow-sm">
          {item.category}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 p-3.5">
        <div className="min-w-0">
          <div className="truncate text-base font-extrabold text-stone-700">{item.name}</div>
          <div className="mt-1 text-xs font-bold text-amber-500">{priceLabel(item)}</div>
        </div>
        <BuyButton owned={owned} pending={pending} afford={afford} onBuy={onBuy} />
      </div>
    </article>
  );
}

function ShopCard({
  item,
  owned,
  pending,
  wallet,
  onBuy,
}: {
  item: ShopItem;
  owned: boolean;
  pending: boolean;
  wallet: WalletState;
  onBuy: () => void;
}) {
  const afford = canAfford(item, wallet);
  return (
    <article className="overflow-hidden rounded-2xl border-2 border-white bg-white/70 shadow-sm transition hover:scale-[1.02] hover:shadow-md">
      <div className="relative h-28 bg-[radial-gradient(circle_at_50%_25%,rgba(186,230,253,0.4),transparent_50%),linear-gradient(180deg,#fef6ec,#fdeaf5)]">
        <div className="absolute inset-x-6 bottom-6 h-3 rounded-[50%] bg-sky-200/40 blur" />
        <div className="shop-float absolute left-1/2 top-6 -translate-x-1/2 text-5xl">{item.icon}</div>
        <div className="absolute bottom-4 left-1/2 h-3 w-20 -translate-x-1/2 rounded-[50%] border border-white/60 bg-white/40" />
      </div>
      <div className="p-2.5">
        <div className="truncate text-sm font-extrabold text-stone-700">{item.name}</div>
        <div className="mt-0.5 text-[11px] font-bold text-amber-500">{priceLabel(item)}</div>
        <BuyButton owned={owned} pending={pending} afford={afford} onBuy={onBuy} compact />
      </div>
    </article>
  );
}

function BuyButton({
  owned,
  pending,
  afford,
  compact,
  onBuy,
}: {
  owned: boolean;
  pending: boolean;
  afford: boolean;
  compact?: boolean;
  onBuy: () => void;
}) {
  return (
    <button
      disabled={owned || pending || !afford}
      onClick={onBuy}
      className={`${compact ? "mt-2 w-full py-1.5 text-[11px]" : "px-4 py-2 text-xs"} rounded-full font-extrabold tracking-[0.06em] transition ${
        owned
          ? "bg-stone-100 text-stone-400"
          : afford
            ? "bg-gradient-to-r from-amber-300 to-pink-300 text-white shadow-[0_4px_10px_rgba(251,191,36,0.35)] hover:scale-105 hover:brightness-105"
            : "bg-stone-100 text-stone-400"
      }`}
    >
      {owned ? "보유중" : afford ? "구매" : "잠김"}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid h-40 place-items-center rounded-3xl border-2 border-white bg-white/50 text-sm font-bold text-stone-400">
      {text}
    </div>
  );
}
