"use client";

import React, { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { SessionsPanel } from "@/components/sessions/sessions-panel";
import { asArray } from "@/lib/api/client";

export default function SessionsPage() {
  const [classes, setClasses] = useState<Array<{ id: string; title: string }>>([]);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("focus");
    const t = setTimeout(() => setFocusId(f), 0);
    fetch("/api/classes?scope=mine")
      .then((r) => r.json())
      .then((j) =>
        setClasses(
          asArray<{ id: string; title: string; isOwner?: boolean; userEnrollmentStatus?: string }>(j.ok ? j.data : []).filter(
            (c) => c.isOwner || c.userEnrollmentStatus === "active"
          )
        )
      )
      .catch(() => null);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <CalendarClock className="h-7 w-7 text-teal-600" /> Study sessions
        </h1>
        <p className="text-sm text-slate-500">Live sessions across your classes. You&apos;ll get a reminder 15 minutes before they start.</p>
      </div>
      <SessionsPanel classes={classes} title="Upcoming & live" focusId={focusId} />
    </div>
  );
}
