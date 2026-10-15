"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShoutoutsHub } from "@/components/shoutouts/shoutouts-hub";

function Inner() {
  return <ShoutoutsHub initialTab={useSearchParams().get("tab")} />;
}

export default function ShoutoutsPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
