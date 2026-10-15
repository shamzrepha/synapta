"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationList, type NotificationItem } from "@/components/notifications/notification-list";
import { useRealtime } from "@/components/providers/realtime-provider";

async function load(): Promise<NotificationItem[] | null> {
  try {
    const res = await fetch("/api/notifications?limit=50");
    const data = await res.json();
    return data.ok ? data.data.notifications : null;
  } catch {
    return null;
  }
}

export default function NotificationsPage() {
  const { signalVersion } = useRealtime();
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => {
    load().then((list) => setItems(list || []));
  }, [signalVersion]);

  const markAll = useCallback(async () => {
    setItems((prev) => (prev || []).map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Notifications</h1>
        <Button size="sm" variant="outline" onClick={markAll}>
          <CheckCheck className="h-4 w-4 mr-1.5" /> Mark all read
        </Button>
      </div>
      <Card className="overflow-hidden">
        {items === null ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <NotificationList items={items} />
        )}
      </Card>
    </div>
  );
}
