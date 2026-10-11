"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { clientDb } from "@/lib/firebase/client";
import { doc, onSnapshot } from "firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";

interface RealtimeContextType {
  unreadCount: number;
  lastSignalTime: number | null;
}

const RealtimeContext = createContext<RealtimeContextType>({
  unreadCount: 0,
  lastSignalTime: null,
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser } = useAuth();
  const queryClient = useQueryClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSignalTime, setLastSignalTime] = useState<number | null>(null);

  useEffect(() => {
    if (!firebaseUser?.uid) return;

    let unsubscribe = () => {};

    try {
      const db = clientDb();
      const signalRef = doc(db, "userSignals", firebaseUser.uid);

      unsubscribe = onSnapshot(
        signalRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
            setLastSignalTime(Date.now());

            // Invalidate queries across the application to refresh stale telemetry/lists
            queryClient.invalidateQueries();
          }
        },
        () => {
          // Silent catch for initial permissions / network transition
        }
      );
    } catch {
      // Graceful fallback in environments without client Firebase
    }

    return () => {
      unsubscribe();
    };
  }, [firebaseUser?.uid, queryClient]);

  return (
    <RealtimeContext.Provider value={{ unreadCount, lastSignalTime }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
