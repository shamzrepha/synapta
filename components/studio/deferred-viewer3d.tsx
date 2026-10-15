"use client";

import React, { useState } from "react";
import { Box } from "lucide-react";
import { Viewer3D as RealViewer3D, type Viewer3DProps } from "@/components/studio/viewer3d";
import { useDataSaver } from "@/components/settings/use-prefs";
import { cn } from "@/lib/utils";

/** Drop-in Viewer3D: in data-saver mode it shows a "Tap to load 3D" placeholder until tapped. */
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
        <Box className="h-8 w-8 text-teal-600" />
        Tap to load 3D
        <span className="text-xs font-normal text-slate-500">Data saver is on</span>
      </button>
    );
  }
  return <RealViewer3D {...props} />;
}

export type { Viewer3DProps };
