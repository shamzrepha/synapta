"use client";

import React, { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/lib/store/use-user-store";

/** Your account ID, to send to the Sunroot team when you are asked for it (for example, to become a course rep). */
export function UserIdCard() {
  const user = useUserStore((s) => s.user);
  const [copied, setCopied] = useState(false);
  if (!user) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the ID is also shown to select by hand */
    }
  };
  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-4" aria-label="Your user ID">
      <h2 className="text-sm font-semibold">Your user ID</h2>
      <p className="text-xs text-muted-foreground">Want to be your department&apos;s course rep, so you can add materials for classmates? Message the Sunroot team on WhatsApp or email with this ID and your department.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all truncate rounded-md bg-muted px-2 py-2 text-xs">{user.uid}</code>
        <Button variant="outline" size="sm" onClick={() => void copy()} className="min-h-[44px]"><Copy className="mr-1 h-4 w-4" /> {copied ? "Copied" : "Copy"}</Button>
      </div>
    </section>
  );
}
