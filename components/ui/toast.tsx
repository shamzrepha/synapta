"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive" | "amber";
}

interface ToastContextType {
  toasts: ToastItem[];
  toast: (item: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "default" }: Omit<ToastItem, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, title, description, variant };
      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        dismiss(id);
      }, 5000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-md transition-all duration-300",
              t.variant === "success" &&
                "border-emerald-500/30 bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-100",
              t.variant === "destructive" &&
                "border-rose-500/30 bg-rose-50/90 text-rose-950 dark:bg-rose-950/80 dark:text-rose-100",
              t.variant === "amber" &&
                "border-amber-500/30 bg-amber-50/90 text-amber-950 dark:bg-amber-950/80 dark:text-amber-100",
              (!t.variant || t.variant === "default") &&
                "border-slate-200 bg-white/95 text-slate-900 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-100"
            )}
          >
            {t.variant === "success" && (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            )}
            {t.variant === "destructive" && (
              <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
            )}
            {t.variant === "amber" && (
              <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            )}
            {(!t.variant || t.variant === "default") && (
              <Info className="h-5 w-5 text-teal-600 dark:text-teal-400 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">{t.title}</p>
              {t.description && (
                <p className="text-xs opacity-90 mt-1 leading-relaxed">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              aria-label="Close notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
