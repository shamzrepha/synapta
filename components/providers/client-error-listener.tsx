"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    __SYNAPTA_CLIENT_ERRORS__?: Array<{ message: string; timestamp: number; url: string }>;
  }
}

export function ClientErrorListener() {
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.__SYNAPTA_CLIENT_ERRORS__ = window.__SYNAPTA_CLIENT_ERRORS__ || [];

    const recordAndReportError = (message: string, stack?: string) => {
      const entry = {
        message: message.slice(0, 500),
        timestamp: Date.now(),
        url: window.location.href,
      };

      // Ring buffer of last 10 errors
      const buffer = window.__SYNAPTA_CLIENT_ERRORS__ || [];
      buffer.push(entry);
      if (buffer.length > 10) buffer.shift();
      window.__SYNAPTA_CLIENT_ERRORS__ = buffer;

      // Throttle server reports (max 1 report per 5s)
      const now = Date.now();
      if (now - lastSentRef.current < 5000) return;
      lastSentRef.current = now;

      fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.slice(0, 1000),
          stack: stack?.slice(0, 2000),
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      }).catch(() => {});
    };

    const handleError = (e: ErrorEvent) => {
      recordAndReportError(e.message || "Unknown error", e.error?.stack);
    };

    const handleRejection = (e: PromiseRejectionEvent) => {
      const msg = typeof e.reason === "string" ? e.reason : e.reason?.message || "Unhandled Promise Rejection";
      recordAndReportError(msg, e.reason?.stack);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
