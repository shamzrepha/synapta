import React from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileNav } from "@/components/shell/mobile-nav";

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
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto w-full pb-20 md:pb-8">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
