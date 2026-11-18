"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Box } from "lucide-react";
import type { Viewer3DProps } from "@/components/studio/viewer3d";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataSaver } from "@/components/settings/use-prefs";
import { cn } from "@/lib/utils";

const RealViewer3D = dynamic(() => import("@/components/studio/viewer3d").then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <Skeleton className="min-h-40 h-full w-full rounded-lg" />,
});

/** Drop-in Viewer3D: lazy-loads Three.js on demand, and in data-saver mode shows a "Tap to load 3D" placeholder until tapped. */
export function Viewer3D(props: Viewer3DProps) {
  const dataSaver = useDataSaver();
  const [loaded, setLoaded] = useState(false);
  if (dataSaver && !loaded) {
    return (
      <button
        type="button"
        onClick={() => setLoaded(true)}
        className={cn(
          "flex min-h-40 flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-slate-900 text-sm font-semibold text-slate-600 dark:text-slate-300",
          props.className
        )}
      >
        <Box className="h-8 w-8 text-brand-600" />
        Tap to load 3D
        <span className="text-xs font-normal text-slate-500">Data saver is on</span>
      </button>
    );
  }
  return <RealViewer3D {...props} />;
}

export type { Viewer3DProps };
