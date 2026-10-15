"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { clientDb } from "@/lib/firebase/client";
import { doc, onSnapshot } from "firebase/firestore";
import { useUserStore } from "@/lib/store/use-user-store";

interface RealtimeContextType {
  unreadCount: number;
  /** Increments every time the server pings this user (notification, XP, badge…). */
  signalVersion: number;
  lastTopic: string | null;
  lastSignalTime: number | null;
}

const RealtimeContext = createContext<RealtimeContextType>({
  unreadCount: 0,
  signalVersion: 0,
  lastTopic: null,
  lastSignalTime: null,
});

/**
 * Listens to `userSignals/{uid}` (written only by the server). Every server-side event for this user
 * (notification, XP, level, badge, quest) bumps it, so badges and stats update live everywhere.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser } = useAuth();
  const updateUser = useUserStore((s) => s.updateUser);
  const [state, setState] = useState<RealtimeContextType>({
    unreadCount: 0,
    signalVersion: 0,
    lastTopic: null,
    lastSignalTime: null,
  });
  const first = useRef(true);

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    let unsubscribe = () => {};
    first.current = true;
    try {
      unsubscribe = onSnapshot(
        doc(clientDb(), "userSignals", firebaseUser.uid),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};
          setState((prev) => ({
            unreadCount: typeof data.unreadCount === "number" ? Math.max(0, data.unreadCount) : 0,
            signalVersion: prev.signalVersion + 1,
            lastTopic: (data.lastTopic as string) || null,
            lastSignalTime: Date.now(),
          }));
          // Keep XP / streak in the top bar fresh after XP-changing events
          if (!first.current && data.lastTopic !== "notifications") {
            fetch("/api/me/game")
              .then((r) => r.json())
              .then((j) => {
                if (j.ok) updateUser({ xp: j.data.xp, streakDays: j.data.streakDays });
              })
              .catch(() => null);
          }
          first.current = false;
        },
        () => {
          // Rules not deployed yet or offline: the app still works, just without live badges
        }
      );
    } catch {
      // Environments without client Firebase
    }
    return () => unsubscribe();
  }, [firebaseUser?.uid, updateUser]);

  return <RealtimeContext.Provider value={state}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
