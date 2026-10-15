"use client";

import React from "react";
import Link from "next/link";
import { CloudOff, Trash2, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clearOffline, removeOffline, useOfflineItems } from "@/components/offline/use-offline";
import { useOnline } from "@/components/offline/offline-manager";
import { formatBytes, totalBytes } from "@/lib/offline/items";

export default function OfflinePage() {
  const items = useOfflineItems();
  const online = useOnline();

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <CloudOff className="h-7 w-7 text-teal-600" /> Offline
        </h1>
        <p className="text-sm text-slate-500">
          Use &ldquo;Download for offline&rdquo; on a notebook or lesson to read it without internet. {formatBytes(totalBytes(items))} used on this device.
        </p>
      </div>

      {!online && (
        <Card className="flex items-center gap-2 p-3 text-sm font-semibold bg-amber-500/10 border-amber-500/30">
          <WifiOff className="h-4 w-4" /> You&apos;re offline. These downloads still open.
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">Nothing downloaded yet. Open a notebook or a lesson and tap Download for offline.</Card>
      ) : (
        <>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((i) => (
              <div key={i.url} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <Link href={i.page} className="block truncate text-sm font-semibold hover:text-teal-600">
                    {i.title}
                  </Link>
                  <p className="text-[11px] text-slate-500">
                    {formatBytes(i.bytes)}
                    {i.savedAt ? ` · saved ${new Date(i.savedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => removeOffline(i.url)}
                  aria-label={`Remove ${i.title}`}
                  className="h-9 w-9 shrink-0 rounded-xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-600 flex items-center justify-center"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </Card>
          <Button variant="outline" size="sm" onClick={() => clearOffline()}>
            Clear all downloads
          </Button>
        </>
      )}
    </div>
  );
}
