"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActivePath } from "./nav-items";
import { useT } from "@/components/settings/use-t";
import { openAddMaterial } from "./add-material";

const PRIMARY = NAV_ITEMS.filter((i) => i.primary);

/**
 * Phone navigation: four places and one action. Home, Classes, [Add], Study, Community. Add is the centre button because everything
 * Sunroot does starts from something you add. Saved, Profile, Everything and Admin live in the account menu at the top right.
 */
export function MobileNav() {
  const t = useT();
  const pathname = usePathname();
  const { user } = useUserStore();
  const role = user?.role || "student";
  const primary = PRIMARY.filter((i) => i.roles.includes(role));
  const left = primary.slice(0, 2);
  const right = primary.slice(2, 4);

  const tab = (item: (typeof primary)[number]) => {
    const Icon = item.icon;
    const active = isActivePath(pathname, item.href, item.match);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500",
          active ? "text-brand-700 dark:text-brand-300 font-semibold" : "text-slate-500 dark:text-slate-400"
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="max-w-full truncate px-0.5 leading-tight">{t(item.short ?? item.label)}</span>
      </Link>
    );
  };

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]" aria-label="Mobile navigation">
      <div className="grid h-16 grid-cols-5">
        {left.map(tab)}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={openAddMaterial}
            aria-label="Add material"
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-brand-500"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
        {right.map(tab)}
      </div>
    </nav>
  );
}
