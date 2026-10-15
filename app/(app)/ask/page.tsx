"use client";

import { AskBoard } from "@/components/ask/ask-board";
import { useUserStore } from "@/lib/store/use-user-store";

export default function AskPage() {
  const user = useUserStore((s) => s.user);
  return <AskBoard isAdmin={user?.role === "admin"} />;
}
