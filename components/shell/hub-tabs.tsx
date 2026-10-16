"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { CLASS_TABS, COMMUNITY_TABS, PageTabs } from "./page-tabs";

const COMMUNITY_PATHS = ["/community", "/feed", "/lounge", "/leaderboard", "/challenges", "/messages"];

/**
 * Related pages read as one place: the class list and "Find a class" share tabs, and the social pages
 * (feed, study rooms, leaderboard, challenges, messages) share another set, instead of each being a menu item.
 */
export function HubTabs() {
  const pathname = usePathname();
  const is = (p: string) => pathname === p || pathname.startsWith(p + "/");
  if (pathname === "/classes/manage" || pathname === "/explore") return <div className="mb-4"><PageTabs tabs={CLASS_TABS} label="Classes" /></div>;
  if (COMMUNITY_PATHS.some(is)) return <div className="mb-4"><PageTabs tabs={COMMUNITY_TABS} label="Community" /></div>;
  return null;
}
