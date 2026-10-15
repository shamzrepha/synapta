"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PollsHub } from "@/components/polls/polls-hub";
import { useUserStore } from "@/lib/store/use-user-store";

function Inner() {
  const user = useUserStore((s) => s.user);
  return <PollsHub isAdmin={user?.role === "admin"} focusId={useSearchParams().get("id")} />;
}

export default function PollsPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
