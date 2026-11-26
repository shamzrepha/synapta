import { adminDb } from "@/lib/firebase/admin";

export interface DeviceSession {
  deviceId: string;
  lastSeen: string; // ISO string
  userAgent: string;
  label: string;
  revoked?: boolean;
  revokedAt?: string;
  revokedReason?: string;
  createdAt?: string;
}

export const ACTIVE_SESSION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const STUDENT_MAX_DEVICES = 2;
export const EVICTION_MESSAGE = "You were signed out because your account was used on another device.";

/** Returns true if a session was active within the last 30 days and has not been revoked. */
export function isSessionActive(s: DeviceSession, nowMs: number = Date.now()): boolean {
  if (s.revoked) return false;
  const t = Date.parse(s.lastSeen);
  if (Number.isNaN(t)) return false;
  return nowMs - t <= ACTIVE_SESSION_WINDOW_MS;
}

/** Pure evaluation of concurrent devices: evicts least recently used active device if limit exceeded. */
export function evaluateDeviceLimit(
  existingSessions: DeviceSession[],
  currentDeviceId: string,
  newSession: Omit<DeviceSession, "revoked">,
  role: string = "student",
  nowMs: number = Date.now()
): {
  sessions: DeviceSession[];
  evictedSessionId: string | null;
} {
  const isExempt = role === "admin" || role === "teacher";

  // Separate current device from other sessions
  const others = existingSessions.filter((s) => s.deviceId !== currentDeviceId);
  const existingCurrent = existingSessions.find((s) => s.deviceId === currentDeviceId);

  const updatedCurrent: DeviceSession = {
    ...newSession,
    createdAt: existingCurrent?.createdAt || newSession.createdAt || new Date(nowMs).toISOString(),
    revoked: false,
  };

  if (isExempt) {
    return {
      sessions: [...others, updatedCurrent],
      evictedSessionId: null,
    };
  }

  // Find active sessions among others
  const activeOthers = others.filter((s) => isSessionActive(s, nowMs));
  const inactiveOthers = others.filter((s) => !isSessionActive(s, nowMs));

  // If adding this device would exceed limit (meaning activeOthers already has >= 2)
  if (activeOthers.length >= STUDENT_MAX_DEVICES) {
    // Sort active others ascending by lastSeen (oldest first)
    activeOthers.sort((a, b) => Date.parse(a.lastSeen) - Date.parse(b.lastSeen));
    const toEvict = activeOthers.shift()!;
    const evicted: DeviceSession = {
      ...toEvict,
      revoked: true,
      revokedAt: new Date(nowMs).toISOString(),
      revokedReason: EVICTION_MESSAGE,
    };

    return {
      sessions: [...inactiveOthers, ...activeOthers, evicted, updatedCurrent],
      evictedSessionId: toEvict.deviceId,
    };
  }

  return {
    sessions: [...others, updatedCurrent],
    evictedSessionId: null,
  };
}

/** Generate a human-readable short label from user agent. */
export function deviceLabelFromUa(ua: string): string {
  if (!ua) return "Unknown device";
  if (/android/i.test(ua)) {
    if (/sunroot/i.test(ua) || /mobile/i.test(ua)) return "Sunroot Android App";
    return "Android Phone";
  }
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/macintosh|mac os x/i.test(ua)) return "Mac computer";
  if (/windows/i.test(ua)) return "Windows PC";
  if (/linux/i.test(ua)) return "Linux computer";
  return "Web Browser";
}

/** Register or heartbeat a device session in Firestore: users/{uid}/sessions/{deviceId} */
export async function registerDeviceInFirestore(
  uid: string,
  deviceInfo: { deviceId: string; userAgent: string; label?: string },
  role: string = "student"
): Promise<{ registered: boolean; evictedDeviceId: string | null }> {
  const coll = adminDb().collection("users").doc(uid).collection("sessions");
  const snap = await coll.get();
  const existing: DeviceSession[] = snap.docs.map((d) => d.data() as DeviceSession);

  const label = deviceInfo.label || deviceLabelFromUa(deviceInfo.userAgent);
  const nowStr = new Date().toISOString();

  const { sessions, evictedSessionId } = evaluateDeviceLimit(
    existing,
    deviceInfo.deviceId,
    {
      deviceId: deviceInfo.deviceId,
      userAgent: deviceInfo.userAgent,
      label,
      lastSeen: nowStr,
      createdAt: nowStr,
    },
    role
  );

  // Batch write updated sessions
  const batch = adminDb().batch();
  for (const s of sessions) {
    batch.set(coll.doc(s.deviceId), s, { merge: true });
  }
  await batch.commit();

  return { registered: true, evictedDeviceId: evictedSessionId };
}

/** Get all registered devices for user. */
export async function getDeviceSessionsFromFirestore(
  uid: string,
  currentDeviceId?: string
): Promise<{ sessions: (DeviceSession & { isCurrent: boolean })[]; isCurrentRevoked: boolean; revokedReason?: string }> {
  const coll = adminDb().collection("users").doc(uid).collection("sessions");
  const snap = await coll.get();
  const raw: DeviceSession[] = snap.docs.map((d) => d.data() as DeviceSession);

  let isCurrentRevoked = false;
  let revokedReason: string | undefined;

  const sessions = raw.map((s) => {
    const isCurrent = Boolean(currentDeviceId && s.deviceId === currentDeviceId);
    if (isCurrent && s.revoked) {
      isCurrentRevoked = true;
      revokedReason = s.revokedReason || EVICTION_MESSAGE;
    }
    return {
      ...s,
      isCurrent,
    };
  });

  return { sessions, isCurrentRevoked, revokedReason };
}

/** Sign out (delete or revoke) a device session. */
export async function removeDeviceSessionFromFirestore(uid: string, deviceId: string): Promise<boolean> {
  const docRef = adminDb().collection("users").doc(uid).collection("sessions").doc(deviceId);
  await docRef.delete();
  return true;
}
