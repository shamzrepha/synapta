"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, Share } from "lucide-react";

type Platform = "android" | "ios" | "other";

/** The phone this is open on. Server render shows the Android button (most visitors); the browser corrects it on load. */
function usePlatform(): Platform {
  const [p, setP] = useState<Platform>("android");
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const next: Platform = /android/i.test(ua) ? "android" : /iphone|ipad|ipod/i.test(ua) ? "ios" : "other";
    if (next === "android") return;
    const t = setTimeout(() => setP(next), 0); // after the first paint, so server and browser agree at first
    return () => clearTimeout(t);
  }, []);
  return p;
}

const primary = "group inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:text-slate-950 dark:hover:bg-brand-400";
const secondary = "inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border bg-card px-6 text-sm font-medium transition-colors hover:border-muted-foreground/60";

/**
 * The two ways in. On an Android phone the app is the main button; on an iPhone (no app yet) the website is, with a note on adding it
 * to the Home Screen; on a computer the website leads and the app is offered as the second choice.
 */
export function AppCta({ version, className = "" }: { version?: string; className?: string }) {
  const platform = usePlatform();
  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {platform === "android" || platform === "other" ? (
          <>
            {platform === "android" ? (
              <>
                <a href="/download/android" download className={primary}>
                  <Download className="h-4 w-4" aria-hidden="true" /> Get the Android app{version ? <span className="text-xs font-normal opacity-80">v{version}</span> : null}
                </a>
                <Link href="/signup" className={secondary}>Use it in your browser <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              </>
            ) : (
              <>
                <Link href="/signup" className={primary}>Create your account <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                <a href="/download/android" download className={secondary}><Download className="h-4 w-4" aria-hidden="true" /> Android app{version ? ` v${version}` : ""}</a>
              </>
            )}
          </>
        ) : (
          <Link href="/signup" className={primary}>Create your account <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        )}
      </div>
      {platform === "ios" && (
        <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <Share className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>On iPhone, open sunrootlearn.com in Safari, tap Share, then <strong className="font-medium text-foreground">Add to Home Screen</strong>. It opens full screen like an app.</span>
        </p>
      )}
      {platform === "android" && <p className="mt-3 text-sm text-muted-foreground">If your phone asks, allow installs from this site once. It is the same account as the website.</p>}
    </div>
  );
}
