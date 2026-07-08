"use client";

// 경매장 (feature #15) — 보유 아이템을 하트로 판매/구매. 개인당 최대 3개 판매.
import { useCallback, useEffect, useState, useTransition } from "react";
import { Modal } from "./ui";
import { getAuctions, listAuction, cancelAuction, buyAuction, type AuctionEntry } from "@/app/actions";
import { SHOP_MAP, HEARTS_PER_COIN, type ShopItem } from "@/lib/game/shop";
import type { WalletState } from "./StoreModal";

function baseHearts(item: ShopItem): number {
  return item.currency === "heart" ? item.price : item.price * HEARTS_PER_COIN;
}

export default function AuctionModal({
  wallet,
  onChange,
  onClose,
}: {
  wallet: WalletState;
  onChange: (w: Partial<WalletState>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"browse" | "sell">("browse");
  const [listings, setListings] = useState<AuctionEntry[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sellItem, setSellItem] = useState<string>("");
  const [sellPrice, setSellPrice] = useState<string>("");

  const load = useCallback(async () => {
    const res = await getAuctions();
    if (!("error" in res)) setListings(res.listings);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const myListings = listings.filter((l) => l.mine);

  // 판매 가능한 보유 아이템(장착 슬롯 있고 소모품 아닌 것)
  const sellable = wallet.inventory
    .map((k) => SHOP_MAP[k])
    .filter((i): i is ShopItem => !!i && i.slot !== "none" && !i.consumable);

  const selItem = sellItem ? SHOP_MAP[sellItem] : null;
  const base = selItem ? baseHearts(selItem) : 0;
  const minPrice = Math.floor(base * 0.9);

  function doBuy(l: AuctionEntry) {
    setMsg(null);
    startTransition(async () => {
      const res = await buyAuction(l.id);
      if ("error" in res) return setMsg("❌ " + res.error);
      onChange({ hearts: res.hearts, inventory: res.inventory });
      setMsg("✅ 구매 완료!");
      load();
    });
  }
  function doCancel(l: AuctionEntry) {
    startTransition(async () => {
      const res = await cancelAuction(l.id);
      if ("error" in res) return setMsg("❌ " + res.error);
      onChange({ inventory: res.inventory });
      setMsg("판매를 취소했어요.");
      load();
    });
  }
  function doList() {
    if (!selItem) return setMsg("판매할 아이템을 선택하세요.");
    const p = Math.floor(Number(sellPrice) || 0);
    startTransition(async () => {
      const res = await listAuction(sellItem, p);
      if ("error" in res) return setMsg("❌ " + res.error);
      onChange({ inventory: res.inventory, equipped: res.equipped });
      setMsg("🏷️ 경매에 등록했어요!");
      setSellItem("");
      setSellPrice("");
      load();
    });
  }

  return (
    <Modal title="🏷️ 경매장" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {([["browse", "🛒 둘러보기"], ["sell", "💰 판매하기"]] as [typeof tab, string][]).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-accent text-white" : "bg-panel2 text-slate-300"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="text-sm text-pink-400">💗 {wallet.hearts.toLocaleString()}</span>
        </div>

        {msg && <div className="rounded-lg bg-panel2 px-3 py-2 text-sm text-slate-200">{msg}</div>}

        {tab === "browse" && (
          <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
            {listings.length === 0 && <p className="py-8 text-center text-sm text-slate-400">등록된 경매가 없어요.</p>}
            {listings.map((l) => {
              const item = SHOP_MAP[l.itemKey];
              if (!item) return null;
              return (
                <div key={l.id} className="flex items-center gap-2 rounded-xl bg-panel2/60 px-3 py-2">
                  <span className="text-xl">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{item.name}</div>
                    <div className="text-xs text-slate-400">판매자 {l.sellerName} · 💗 {l.price.toLocaleString()}</div>
                  </div>
                  {l.mine ? (
                    <button onClick={() => doCancel(l)} disabled={pending} className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-300">
                      취소
                    </button>
                  ) : (
                    <button
                      onClick={() => doBuy(l)}
                      disabled={pending || wallet.hearts < l.price || wallet.inventory.includes(l.itemKey)}
                      className="rounded bg-accent px-2 py-1 text-xs text-white disabled:bg-slate-700 disabled:text-slate-500"
                    >
                      {wallet.inventory.includes(l.itemKey) ? "보유중" : "구매"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "sell" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">보유 아이템을 시중가의 90%~100% 사이 하트로 판매해요. (최대 3개, 등록 시 장착 해제)</p>
            <div className="text-xs text-slate-400">내 판매 등록: {myListings.length}/3</div>
            {sellable.length === 0 ? (
              <p className="rounded-xl bg-panel2/60 p-3 text-sm text-slate-500">판매 가능한 아이템이 없어요.</p>
            ) : (
              <>
                <select value={sellItem} onChange={(e) => setSellItem(e.target.value)} className="input bg-panel2">
                  <option value="" className="bg-panel">아이템 선택</option>
                  {sellable.map((i) => (
                    <option key={i.key} value={i.key} className="bg-panel">
                      {i.name}
                    </option>
                  ))}
                </select>
                {selItem && (
                  <div className="text-xs text-slate-400">
                    시중가 💗{base.toLocaleString()} · 판매 가능 범위 {minPrice.toLocaleString()}~{base.toLocaleString()}
                  </div>
                )}
                <input
                  type="number"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  placeholder={selItem ? `${minPrice}~${base}` : "가격(하트)"}
                  className="input bg-panel2"
                />
                <button onClick={doList} disabled={pending || !selItem || myListings.length >= 3} className="btn-primary w-full disabled:opacity-40">
                  🏷️ 경매 등록
                </button>
              </>
            )}
            {myListings.length > 0 && (
              <div>
                <div className="mb-1 text-sm text-slate-300">내 판매 목록</div>
                {myListings.map((l) => {
                  const item = SHOP_MAP[l.itemKey];
                  return (
                    <div key={l.id} className="mb-1 flex items-center gap-2 rounded-xl bg-panel2/60 px-3 py-2">
                      <span>{item?.icon}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-white">{item?.name}</span>
                      <span className="text-xs text-slate-400">💗{l.price.toLocaleString()}</span>
                      <button onClick={() => doCancel(l)} disabled={pending} className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-300">
                        취소
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
