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
      onChange({ hearts: res.hearts, coins: res.coins, inventory: res.inventory });
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
      onChange({ equipped: res.equipped });
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
      onChange({ hearts: res.hearts, coins: res.coins });
      setMsg(`${n}코인 환전 완료`);
    });
  }

  return (
    <aside className="flex h-full w-[420px] max-w-[100vw] flex-col overflow-hidden border-l border-white/10 bg-[#11130f]/95 text-slate-100 shadow-2xl backdrop-blur-xl">
      <header className="relative border-b border-white/10 px-4 py-4">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-cyan-200 to-emerald-300" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-amber-200/70">Market</div>
            <h2 className="mt-1 text-xl font-semibold text-white">AFFINITY</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="닫기"
          >
            ×
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Balance label="HEART" value={wallet.hearts} tone="text-pink-200" />
          <Balance label="COIN" value={wallet.coins} tone="text-amber-200" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-black/30 p-1">
          {([["shop", "SHOP"], ["inventory", "BAG"], ["exchange", "BANK"]] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded px-2 py-1.5 text-[11px] font-semibold tracking-[0.12em] transition ${
                tab === k ? "bg-amber-200 text-stone-950" : "text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {msg && (
        <div className="mx-4 mt-3 rounded-md border border-emerald-200/20 bg-emerald-200/10 px-3 py-2 text-sm text-emerald-50">
          {msg}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "shop" && (
          <div className="grid h-full min-h-0 grid-cols-[52px_1fr] gap-3">
            <nav className="flex flex-col gap-2">
              {SHOP_CATEGORIES.map((cc) => (
                <button
                  key={cc}
                  onClick={() => setCat(cc)}
                  className={`grid h-11 w-11 place-items-center rounded-md border text-base font-semibold transition ${
                    cat === cc
                      ? "border-amber-200/70 bg-amber-200 text-stone-950 shadow-[0_0_18px_rgba(253,230,138,0.22)]"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/30 hover:bg-white/10"
                  }`}
                  title={cc}
                >
                  {CATEGORY_ICON[cc]}
                </button>
              ))}
            </nav>

            <div className="min-w-0 space-y-3">
              {featured && <FeaturedItem item={featured} owned={owned.has(featured.key)} onBuy={() => doBuy(featured)} pending={pending} wallet={wallet} />}
              <div className="grid grid-cols-2 gap-2">
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
            {inv.length === 0 && <EmptyState text="EMPTY" />}
            {slots.map(({ slot, label }) => {
              const items = inv.filter((i) => i.slot === slot);
              if (!items.length) return null;
              const eq = wallet.equipped[slot];
              return (
                <section key={slot}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</h3>
                    {eq && (
                      <button
                        onClick={() => doEquip(slot, null)}
                        className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
                      >
                        OFF
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => doEquip(slot, item.key)}
                        className={`group rounded-md border p-2 text-left transition ${
                          eq === item.key
                            ? "border-cyan-200/70 bg-cyan-200/10"
                            : "border-white/10 bg-white/[0.04] hover:border-white/25"
                        }`}
                      >
                        <div className="relative h-16 overflow-hidden rounded bg-black/30">
                          <div className="absolute inset-x-4 bottom-3 h-2 rounded-[50%] bg-cyan-200/30 blur" />
                          <div className="absolute left-1/2 top-3 -translate-x-1/2 text-3xl transition group-hover:-translate-y-1">{item.icon}</div>
                        </div>
                        <div className="mt-2 truncate text-sm font-medium text-white">{item.name}</div>
                        <div className="text-[11px] text-slate-500">{eq === item.key ? "ON" : "EQUIP"}</div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {inv.filter((i) => i.slot === "none").length > 0 && (
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">기타</h3>
                <div className="grid grid-cols-2 gap-2">
                  {inv
                    .filter((i) => i.slot === "none")
                    .map((item) => (
                      <div key={item.key} className="rounded-md border border-white/10 bg-white/[0.04] p-2">
                        <div className="text-3xl">{item.icon}</div>
                        <div className="mt-1 truncate text-sm text-white">{item.name}</div>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "exchange" && (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200/20 bg-amber-200/10 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/70">Rate</div>
              <div className="mt-1 text-2xl font-semibold text-white">{HEARTS_PER_COIN.toLocaleString()} : 1</div>
            </div>
            {[1, 5, 10].map((n) => (
              <button
                key={n}
                disabled={pending || wallet.hearts < n * HEARTS_PER_COIN}
                onClick={() => doExchange(n)}
                className="flex w-full items-center justify-between rounded-md border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:border-amber-200/40 hover:bg-amber-200/10 disabled:opacity-40"
              >
                <span className="text-sm text-slate-300">{(n * HEARTS_PER_COIN).toLocaleString()} HEART</span>
                <span className="text-base font-semibold text-amber-200">{n} COIN</span>
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
    <div className="rounded-md border border-white/10 bg-white/[0.05] px-3 py-2">
      <div className="text-[10px] font-semibold tracking-[0.2em] text-slate-500">{label}</div>
      <div className={`mt-1 text-base font-semibold ${tone}`}>{value.toLocaleString()}</div>
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
    <article className="overflow-hidden rounded-md border border-white/10 bg-[#171813]">
      <div className="relative h-48 bg-[radial-gradient(circle_at_50%_20%,rgba(250,231,174,0.24),transparent_34%),linear-gradient(180deg,#202018,#10110e)]">
        <div className="absolute inset-x-10 bottom-9 h-5 rounded-[50%] bg-cyan-200/30 blur-md" />
        <div className="shop-float absolute left-1/2 top-12 -translate-x-1/2 text-7xl">{item.icon}</div>
        <div className="absolute bottom-8 left-1/2 h-5 w-36 -translate-x-1/2 rounded-[50%] border border-cyan-100/25 bg-cyan-100/10" />
        <div className="absolute left-3 top-3 rounded bg-black/35 px-2 py-1 text-[10px] font-semibold tracking-[0.18em] text-amber-100">
          {item.category}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-white">{item.name}</div>
          <div className="mt-1 text-xs font-medium text-amber-100">{priceLabel(item)}</div>
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
    <article className="overflow-hidden rounded-md border border-white/10 bg-white/[0.04]">
      <div className="relative h-28 bg-[radial-gradient(circle_at_50%_25%,rgba(125,211,252,0.16),transparent_42%),linear-gradient(180deg,#191b17,#0f100d)]">
        <div className="absolute inset-x-6 bottom-6 h-3 rounded-[50%] bg-cyan-200/25 blur" />
        <div className="shop-float absolute left-1/2 top-6 -translate-x-1/2 text-5xl">{item.icon}</div>
        <div className="absolute bottom-4 left-1/2 h-3 w-20 -translate-x-1/2 rounded-[50%] border border-white/15 bg-white/10" />
      </div>
      <div className="p-2.5">
        <div className="truncate text-sm font-semibold text-white">{item.name}</div>
        <div className="mt-0.5 text-[11px] font-medium text-amber-100">{priceLabel(item)}</div>
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
      className={`${compact ? "mt-2 w-full py-1.5 text-[11px]" : "px-4 py-2 text-xs"} rounded-md font-semibold tracking-[0.12em] transition ${
        owned
          ? "bg-white/5 text-slate-500"
          : afford
            ? "bg-amber-200 text-stone-950 shadow-[0_0_18px_rgba(253,230,138,0.18)] hover:brightness-110"
            : "bg-white/5 text-slate-500"
      }`}
    >
      {owned ? "OWNED" : afford ? "BUY" : "LOCK"}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid h-40 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-xs font-semibold tracking-[0.28em] text-slate-500">
      {text}
    </div>
  );
}
