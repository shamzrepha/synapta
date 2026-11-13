"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WorldUploader } from "@/components/worlds/uploader";

function Inner() {
  const sp = useSearchParams();
  const worldId = sp.get("world") || undefined;
  const classId = sp.get("class") || undefined;
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{worldId ? "Add more notes" : "Build a world from your notes"}</h1>
        <p className="text-sm text-muted-foreground">{worldId ? "New notes are merged into your library: what you already have is kept, and gaps get filled." : (classId ? "Your notes are already in the subject library: pick them and SunRoot turns them into a world." : "Upload your notes and SunRoot turns them into a world you can learn in.")}</p>
      </div>
      <WorldUploader worldId={worldId} classId={classId} />
    </div>
  );
}

export default function NewWorldPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
