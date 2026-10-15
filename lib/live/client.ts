"use client";

import { useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { clientDb } from "@/lib/firebase/client";

function channelDocId(name: string): string {
  return name.replace(/\//g, "_").slice(0, 300);
}

/**
 * Calls `onChange` whenever the server bumps the named live channel (see lib/live/server.ts).
 * The first snapshot is ignored (the page just loaded its data). Changes are debounced so a burst
 * of updates triggers one refetch. Also refetches when the tab regains focus as a fallback.
 */
export function useLiveChannel(name: string | null | undefined, onChange: () => void, debounceMs = 400): void {
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!name) return;
    let first = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), debounceMs);
    };
    try {
      unsubscribe = onSnapshot(
        doc(clientDb(), "liveChannels", channelDocId(name)),
        () => {
          if (first) {
            first = false;
            return;
          }
          fire();
        },
        () => null
      );
    } catch {
      // no client Firebase
    }
    const onFocus = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [name, debounceMs]);
}
