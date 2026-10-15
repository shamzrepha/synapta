"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { SHOP_ITEMS, isEquippable, type ShopItem, type EquipSlot } from "@/lib/shop/catalog";
import { THEME_EVENT } from "@/components/shop/theme-applier";
import { formatNumber } from "@/lib/utils";
import type { ShopState } from "@/lib/shop/server";

const SECTIONS: Array<{ title: string; kinds: ShopItem["kind"][] }> = [
  { title: "Accent themes", kinds: ["theme"] },
  { title: "Avatar frames", kinds: ["frame"] },
  { title: "Titles", kinds: ["title"] },
  { title: "Streak boosters", kinds: ["freeze", "recovery"] },
];

function Preview({ item }: { item: ShopItem }) {
  if (item.kind === "theme" && item.palette) {
    return (
      <div className="flex h-10 w-10 shrink-0 overflow-hidden rounded-xl">
        {[3, 5, 7].map((i) => (
          <span key={i} className="flex-1" style={{ background: item.palette![i] }} />
        ))}
      </div>
    );
  }
  if (item.kind === "frame") {
    return <div className={`h-10 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 ${item.frameClass}`} />;
  }
  return <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl dark:bg-slate-800">{item.emoji}</div>;
}

export default function ShopPage() {
  const { toast } = useToast();
  const [state, setState] = useState<ShopState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/shop");
      const json = await res.json();
      if (json.ok) setState(json.data);
    } catch {
      /* shown as loading failure below */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shop")
      .then((r) => r.json())
      .then((json) => !cancelled && json.ok && setState(json.data))
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  }

  async function buy(item: ShopItem) {
    if (busy) return;
    setBusy(item.id);
    try {
      const json = await post("/api/shop/purchase", { itemId: item.id });
      if (json.ok) {
        setState(json.data.state);
        toast({ title: `${item.emoji} ${item.name}`, description: `Purchased for ${formatNumber(json.data.spent)} XP.`, variant: "success" });
      } else {
        toast({ title: "Couldn't buy that", description: json.error?.message || "Try again.", variant: "destructive" });
        void load();
      }
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function equip(slot: EquipSlot, itemId: string | null) {
    if (busy) return;
    setBusy(itemId || slot);
    try {
      const json = await post("/api/shop/equip", { slot, itemId });
      if (json.ok) {
        setState(json.data);
        if (slot === "theme") window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: itemId }));
      } else {
        toast({ title: "Couldn't equip", description: json.error?.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const items = asArray<ShopItem>(SHOP_ITEMS);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">XP shop</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Spending XP never lowers your level or rank.</p>
      </div>

      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Spendable XP</p>
          <p className="text-2xl font-extrabold">{state ? formatNumber(state.spendable) : "…"}</p>
        </div>
        <p className="text-xs text-slate-500">
          {state ? `${formatNumber(state.xp)} total · ${formatNumber(state.xpSpent)} spent` : ""}
        </p>
        <Link href="/streak" className="text-xs font-semibold text-teal-600 dark:text-teal-400 underline">
          Streak page
        </Link>
      </Card>

      {SECTIONS.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{section.title}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items
              .filter((i) => section.kinds.includes(i.kind))
              .map((item) => {
                const owned = !!state?.owned[item.id];
                const equippable = isEquippable(item);
                const slot = item.kind as EquipSlot;
                const equipped = equippable && state?.equipped[slot] === item.id;
                const price = item.kind === "recovery" ? state?.recovery.cost ?? 0 : item.price;
                const disabledReason =
                  item.kind === "freeze" && state && state.freezes >= state.maxFreezes
                    ? "Freezes full"
                    : item.kind === "recovery" && state && !state.recovery.available
                    ? "No broken streak"
                    : null;
                return (
                  <Card key={item.id} className="p-4 flex items-center gap-3">
                    <Preview item={item} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{item.name}</p>
                      <p className="text-xs text-slate-500 line-clamp-2">{item.description}</p>
                      {item.kind === "freeze" && state && <p className="text-[11px] text-slate-500 mt-0.5">Holding {state.freezes}/{state.maxFreezes}</p>}
                    </div>
                    <div className="shrink-0">
                      {equippable && owned ? (
                        <Button size="sm" variant={equipped ? "secondary" : "default"} disabled={!!busy} onClick={() => equip(slot, equipped ? null : item.id)}>
                          {equipped ? "Unequip" : "Equip"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={!state || !!busy || !!disabledReason || state.spendable < price}
                          isLoading={busy === item.id}
                          onClick={() => buy(item)}
                        >
                          {disabledReason || `${formatNumber(price)} XP`}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
          </div>
        </section>
      ))}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Purchase history</h2>
        <Card className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
          {state && asArray(state.ledger).length === 0 && <p className="p-4 text-sm text-slate-500">Nothing bought yet.</p>}
          {asArray<ShopState["ledger"][number]>(state?.ledger).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 truncate">
                {l.emoji} {l.name}
              </span>
              <span className="shrink-0 text-xs text-slate-500">
                -{formatNumber(l.price)} XP · {l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ""}
              </span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
