import React from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { OfflineManager } from "@/components/offline/offline-manager";
import { TutorLauncher } from "@/components/tutor/tutor-launcher";
import { HubTabs } from "@/components/shell/hub-tabs";
import { ThemeApplier } from "@/components/shop/theme-applier";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#F7F6F2] dark:bg-[#0B0F14] text-slate-900 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-teal-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar />
        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none px-3 py-4 sm:p-5 md:p-6 lg:p-8 max-w-[1200px] mx-auto w-full pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8 overflow-x-hidden">
          <HubTabs />
          {children}
        </main>
      </div>
      <MobileNav />
      <TutorLauncher />
      <OfflineManager />
      <ThemeApplier />
    </div>
  );
}
