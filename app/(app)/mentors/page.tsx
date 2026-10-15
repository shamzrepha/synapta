"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MentorsHub } from "@/components/mentors/mentors-hub";

function Inner() {
  return <MentorsHub initialTab={useSearchParams().get("tab")} />;
}

export default function MentorsPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
