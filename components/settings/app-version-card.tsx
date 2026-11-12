"use client";

import React, { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UPDATE_CHECK_EVENT } from "@/components/shell/app-update-banner";
import { installedBuild } from "@/lib/native/app-update";

/** Only inside the Android app: which build is installed, and a button to look for a newer one right now. */
export function AppVersionCard() {
  const [build, setBuild] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void installedBuild().then((b) => alive && setBuild(b));
    return () => {
      alive = false;
    };
  }, []);
  if (build === null) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <span className="text-brand-600"><Smartphone className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">Sunroot app</p>
        <p className="text-xs text-slate-500">Build {build}. The app checks for new versions by itself when it opens.</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => window.dispatchEvent(new Event(UPDATE_CHECK_EVENT))}>
        Check for updates
      </Button>
    </Card>
  );
}
