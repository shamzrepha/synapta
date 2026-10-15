"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TutorsHub } from "@/components/tutors/tutors-hub";

function Inner() {
  const tab = useSearchParams().get("tab");
  return <TutorsHub initialTab={tab} />;
}

export default function TutorsPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
