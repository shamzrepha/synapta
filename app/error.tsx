"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log exception to telemetry / console
    console.error("Uncaught application error boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground relative overflow-hidden">
      {/* Background danger glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-96 bg-destructive/10 rounded-full blur-3xl opacity-70"
      />

      <div className="relative z-10 max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center shadow-lg shadow-destructive/5">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-destructive/10 text-destructive border border-destructive/20">
            Runtime Exception
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Something Went Wrong
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            An unexpected error occurred while processing this cognitive interaction. Your session progress has been preserved in local state.
          </p>
        </div>

        {/* Error message collapsible or display */}
        {error.message && (
          <div className="text-left bg-muted/40 border border-border/80 rounded-lg p-3 text-xs font-mono text-muted-foreground overflow-x-auto max-h-32">
            <span className="font-semibold text-foreground">Detail:</span> {error.message}
            {error.digest && (
              <div className="mt-1 text-[10px] text-muted-foreground/70">
                Digest: {error.digest}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button onClick={() => reset()} className="w-full sm:w-auto gap-2">
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full gap-2">
              <Home className="w-4 h-4" />
              Return to Dashboard
            </Button>
          </Link>
        </div>

        <div className="pt-4 border-t border-border/40 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <LifeBuoy className="w-3.5 h-3.5" />
            Need assistance? Check the{" "}
            <Link href="/" className="underline text-primary hover:text-primary/80">
              Synapta platform guide
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
