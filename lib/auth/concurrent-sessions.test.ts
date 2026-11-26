import { describe, it, expect } from "vitest";
import {
  evaluateDeviceLimit,
  isSessionActive,
  deviceLabelFromUa,
  EVICTION_MESSAGE,
  type DeviceSession,
} from "./concurrent-sessions";

describe("Concurrent Login & Device Limit", () => {
  const now = 1700000000000;
  const tMinusDays = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

  it("registers 1st and 2nd device without evicting either", () => {
    const existing: DeviceSession[] = [
      {
        deviceId: "dev-1",
        lastSeen: tMinusDays(1),
        userAgent: "Chrome Windows",
        label: "Windows PC",
      },
    ];

    const result = evaluateDeviceLimit(
      existing,
      "dev-2",
      {
        deviceId: "dev-2",
        lastSeen: new Date(now).toISOString(),
        userAgent: "iPhone Safari",
        label: "iPhone",
      },
      "student",
      now
    );

    expect(result.evictedSessionId).toBeNull();
    expect(result.sessions.filter((s) => !s.revoked).length).toBe(2);
  });

  it("evicts the least recently used device when a 3rd device signs in on a student plan", () => {
    const dev1: DeviceSession = {
      deviceId: "dev-1",
      lastSeen: tMinusDays(10), // Oldest active
      userAgent: "Chrome Windows",
      label: "Windows PC",
    };
    const dev2: DeviceSession = {
      deviceId: "dev-2",
      lastSeen: tMinusDays(2), // Newer active
      userAgent: "iPhone Safari",
      label: "iPhone",
    };

    const existing: DeviceSession[] = [dev1, dev2];

    const result = evaluateDeviceLimit(
      existing,
      "dev-3",
      {
        deviceId: "dev-3",
        lastSeen: new Date(now).toISOString(),
        userAgent: "Android Phone",
        label: "Sunroot Android App",
      },
      "student",
      now
    );

    expect(result.evictedSessionId).toBe("dev-1");
    const evicted = result.sessions.find((s) => s.deviceId === "dev-1");
    expect(evicted?.revoked).toBe(true);
    expect(evicted?.revokedReason).toBe(EVICTION_MESSAGE);

    const activeSessions = result.sessions.filter((s) => !s.revoked);
    expect(activeSessions.length).toBe(2);
    expect(activeSessions.map((s) => s.deviceId)).toEqual(["dev-2", "dev-3"]);
  });

  it("does not count an expired device (> 30 days) toward the 2-device limit", () => {
    const devExpired: DeviceSession = {
      deviceId: "dev-old",
      lastSeen: tMinusDays(35), // Expired!
      userAgent: "Old Tablet",
      label: "Android Tablet",
    };
    const devActive: DeviceSession = {
      deviceId: "dev-1",
      lastSeen: tMinusDays(5),
      userAgent: "Chrome Windows",
      label: "Windows PC",
    };

    const existing: DeviceSession[] = [devExpired, devActive];

    const result = evaluateDeviceLimit(
      existing,
      "dev-2",
      {
        deviceId: "dev-2",
        lastSeen: new Date(now).toISOString(),
        userAgent: "iPhone",
        label: "iPhone",
      },
      "student",
      now
    );

    // No eviction should happen because only 1 other device was active
    expect(result.evictedSessionId).toBeNull();
    const active = result.sessions.filter((s) => isSessionActive(s, now));
    expect(active.length).toBe(2);
  });

  it("exempts admins and teachers from the concurrent device limit", () => {
    const existing: DeviceSession[] = [
      {
        deviceId: "dev-1",
        lastSeen: tMinusDays(1),
        userAgent: "Mac",
        label: "Mac computer",
      },
      {
        deviceId: "dev-2",
        lastSeen: tMinusDays(2),
        userAgent: "iPhone",
        label: "iPhone",
      },
    ];

    // Admin 3rd device
    const adminResult = evaluateDeviceLimit(
      existing,
      "dev-3",
      {
        deviceId: "dev-3",
        lastSeen: new Date(now).toISOString(),
        userAgent: "Windows",
        label: "Windows PC",
      },
      "admin",
      now
    );

    expect(adminResult.evictedSessionId).toBeNull();
    expect(adminResult.sessions.filter((s) => !s.revoked).length).toBe(3);

    // Teacher 3rd device
    const teacherResult = evaluateDeviceLimit(
      existing,
      "dev-3",
      {
        deviceId: "dev-3",
        lastSeen: new Date(now).toISOString(),
        userAgent: "Windows",
        label: "Windows PC",
      },
      "teacher",
      now
    );

    expect(teacherResult.evictedSessionId).toBeNull();
    expect(teacherResult.sessions.filter((s) => !s.revoked).length).toBe(3);
  });

  it("updates existing device session lastSeen without evicting anything", () => {
    const existing: DeviceSession[] = [
      {
        deviceId: "dev-1",
        lastSeen: tMinusDays(5),
        userAgent: "Mac",
        label: "Mac computer",
      },
      {
        deviceId: "dev-2",
        lastSeen: tMinusDays(2),
        userAgent: "iPhone",
        label: "iPhone",
      },
    ];

    // Heartbeat from dev-1
    const result = evaluateDeviceLimit(
      existing,
      "dev-1",
      {
        deviceId: "dev-1",
        lastSeen: new Date(now).toISOString(),
        userAgent: "Mac",
        label: "Mac computer",
      },
      "student",
      now
    );

    expect(result.evictedSessionId).toBeNull();
    expect(result.sessions.filter((s) => !s.revoked).length).toBe(2);
    expect(result.sessions.find((s) => s.deviceId === "dev-1")?.lastSeen).toBe(new Date(now).toISOString());
  });

  it("infers friendly device labels from user agent", () => {
    expect(deviceLabelFromUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows PC");
    expect(deviceLabelFromUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceLabelFromUa("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("iPad");
    expect(deviceLabelFromUa("Mozilla/5.0 (Linux; Android 14; Pixel 8) SunrootApp")).toBe("Sunroot Android App");
  });
});
