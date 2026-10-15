import React from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { OfflineManager } from "@/components/offline/offline-manager";
import { TutorLauncher } from "@/components/tutor/tutor-launcher";
import { ThemeApplier } from "@/components/shop/theme-applier";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#F7F6F2] dark:bg-[#0B0F14] text-slate-900 dark:text-slate-100">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar />
        <main className="flex-1 px-3 py-4 sm:p-5 md:p-6 lg:p-8 max-w-[1200px] mx-auto w-full pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8 overflow-x-hidden">
          {children}
        </main>
      </div>
      <MobileNav />
      <TutorLauncher />
<<<<<<< HEAD
      <OfflineManager />
=======
      <ThemeApplier />
>>>>>>> worktree-agent-a08c5f8c2a5f7a3c8
    </div>
  );
}
