"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { asArray } from "@/lib/api/client";
import { api } from "@/lib/teach/client";
import { useUserStore } from "@/lib/store/use-user-store";
import { TeacherGrading } from "@/components/teach/grading-teacher";

interface StudentSet {
  id: string;
  title: string;
  classTitle: string;
  status: string;
  released: boolean;
  submitted: boolean;
}

export default function GradingPage() {
  const user = useUserStore((s) => s.user);
  const isLoading = useUserStore((s) => s.isLoading);
  if (isLoading) return <div className="mx-auto max-w-3xl px-4 py-4"><Skeleton className="h-24 w-full rounded-2xl" /></div>;
  if (user?.role === "teacher" || user?.role === "admin") return <TeacherGrading />;
  return <StudentSets />;
}

function StudentSets() {
  const [sets, setSets] = useState<StudentSet[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<StudentSet[]>("/api/grading")
      .then((d) => alive && setSets(asArray<StudentSet>(d)))
      .catch(() => alive && setSets([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4 sm:px-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Short-answer sets</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Question sets from your teachers. Marks appear once your teacher releases them.</p>
      </header>
      {sets === null ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
      ) : sets.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing to answer right now.</p>
      ) : (
        sets.map((s) => (
          <Link key={s.id} href={`/teach/grading/take/${s.id}`} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 hover:border-teal-400 dark:border-slate-800 dark:bg-slate-900">
            <span>
              <span className="block font-semibold text-slate-900 dark:text-white">{s.title}</span>
              <span className="text-xs text-slate-500">{s.classTitle}</span>
            </span>
            <Badge variant={s.released ? "default" : s.submitted ? "secondary" : s.status === "open" ? "emerald" : "outline"}>
              {s.released && s.submitted ? "Marks ready" : s.submitted ? "Submitted" : s.status === "open" ? "Open" : "Closed"}
            </Badge>
          </Link>
        ))
      )}
    </div>
  );
}
