"use client";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090d16] text-[#f1f5f9] flex items-center justify-center p-6 font-sans antialiased">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Fatal Application Error
            </h1>
            <p className="text-sm text-slate-400">
              A critical layout exception occurred. Please reload the platform.
            </p>
          </div>

          {error.message && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-400 text-left overflow-x-auto max-h-32">
              {error.message}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => reset()}
              className="px-4 py-2 rounded-lg bg-teal-500 text-black font-semibold text-sm hover:bg-teal-400 transition-colors shadow-lg shadow-teal-500/20"
            >
              Reload Application
            </button>
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }}
              className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-sm hover:bg-slate-700 transition-colors"
            >
              Hard Refresh
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
