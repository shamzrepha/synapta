"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Smartphone, Laptop, LogOut, ShieldCheck, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchDeviceSessions, removeDeviceSession } from "@/lib/auth/device-client";
import { DeviceSession } from "@/lib/auth/concurrent-sessions";

function formatRelativeTime(isoStr: string): string {
  const t = Date.parse(isoStr);
  if (Number.isNaN(t)) return "Unknown";
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function DevicesCard() {
  const [sessions, setSessions] = useState<(DeviceSession & { isCurrent: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchDeviceSessions();
    setSessions(data.sessions);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    fetchDeviceSessions().then((data) => {
      if (active) {
        setSessions(data.sessions);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = async (deviceId: string, isCurrent: boolean) => {
    if (!confirm(isCurrent ? "Sign out this device?" : "Sign out this device from your account?")) {
      return;
    }
    setBusyId(deviceId);
    const ok = await removeDeviceSession(deviceId);
    if (ok) {
      if (isCurrent) {
        window.location.reload();
      } else {
        setSessions((prev) => prev.filter((s) => s.deviceId !== deviceId));
      }
    }
    setBusyId(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Signed-in Devices
        </p>
        <button
          onClick={load}
          aria-label="Refresh devices list"
          className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 font-medium"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <Card className="divide-y divide-slate-100 dark:divide-slate-800 p-0 overflow-hidden">
        <div className="p-4 bg-slate-50/50 dark:bg-slate-900/50 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-brand-600 mt-0.5 shrink-0" />
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Device security: </span>
            Student plans allow up to 2 active devices. When a 3rd device signs in, your least recently used device is automatically signed out.
          </div>
        </div>

        {sessions.length === 0 && !loading && (
          <div className="p-4 text-center text-sm text-slate-500">
            No devices currently registered.
          </div>
        )}

        {sessions.map((s) => {
          const isPhone = /android|iphone/i.test(s.label || s.userAgent);
          return (
            <div key={s.deviceId} className="flex items-center justify-between p-4 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
                  {isPhone ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {s.label || "Registered Device"}
                    </p>
                    {s.isCurrent && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                        This device
                      </span>
                    )}
                    {s.revoked && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
                        Signed out
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    Last active: {formatRelativeTime(s.lastSeen)}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={busyId === s.deviceId}
                onClick={() => handleSignOut(s.deviceId, s.isCurrent)}
                className="shrink-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-slate-200 dark:border-slate-800"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Sign out
              </Button>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
