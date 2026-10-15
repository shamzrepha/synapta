"use client";

import React, { use } from "react";
import { ClassJoinGate } from "@/components/classes/class-join-gate";

/** Every page of a class requires membership; a shared link alone only shows the join screen. */
export default function ClassLayout({ children, params }: { children: React.ReactNode; params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  return (
    <ClassJoinGate key={classId} classId={classId}>
      {children}
    </ClassJoinGate>
  );
}
