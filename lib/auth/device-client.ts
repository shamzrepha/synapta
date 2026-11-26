"use client";

import { DeviceSession } from "./concurrent-sessions";

const DEVICE_ID_KEY = "sunroot:deviceId";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server-placeholder";
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id || id.length < 8) {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        id = crypto.randomUUID();
      } else {
        id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      }
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev_fallback_${Date.now()}`;
  }
}

export async function registerCurrentDevice(): Promise<{
  ok: boolean;
  evictedDeviceId?: string | null;
}> {
  const deviceId = getOrCreateDeviceId();
  try {
    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "",
      }),
    });
    if (!res.ok) return { ok: false };
    const json = await res.json();
    return { ok: true, evictedDeviceId: json?.data?.evictedDeviceId ?? null };
  } catch {
    return { ok: false };
  }
}

export async function fetchDeviceSessions(): Promise<{
  sessions: (DeviceSession & { isCurrent: boolean })[];
  isCurrentRevoked: boolean;
  revokedReason?: string;
}> {
  const deviceId = getOrCreateDeviceId();
  try {
    const res = await fetch(`/api/devices?deviceId=${encodeURIComponent(deviceId)}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return { sessions: [], isCurrentRevoked: false };
    const json = await res.json();
    return {
      sessions: json?.data?.sessions ?? [],
      isCurrentRevoked: Boolean(json?.data?.isCurrentRevoked),
      revokedReason: json?.data?.revokedReason,
    };
  } catch {
    return { sessions: [], isCurrentRevoked: false };
  }
}

export async function removeDeviceSession(deviceId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}
