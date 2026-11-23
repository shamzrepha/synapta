"use client";

import React, { use } from "react";
import { ExamSprint } from "@/components/practice/exam-sprint";

export default function SprintPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  return <ExamSprint classId={classId} />;
}
