"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { WrittenPractice } from "@/components/practice/written-practice";
import { asArray, fetchJson } from "@/lib/api/client";

interface Topic {
  id: string;
  title: string;
}

/** With only a class given, the learner picks the topic first. */
function TopicPicker({ classId }: { classId: string }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  useEffect(() => {
    let live = true;
    void fetchJson<{ kcs: Topic[] }>(`/api/classes/${classId}`).then((j) => {
      if (live) setTopics(j.ok ? asArray<Topic>(j.data.kcs) : []);
    });
    return () => {
      live = false;
    };
  }, [classId]);
  if (!topics) return <Card className="p-6 text-sm text-muted-foreground">Loading topics…</Card>;
  if (topics.length === 0) return <Card className="p-6 text-sm">This class has no topics to practise yet.</Card>;
  return (
    <Card className="p-4 space-y-2">
      <h2 className="text-lg font-bold">Written practice</h2>
      <p className="text-sm text-muted-foreground">Pick a topic to be asked exam-style theory questions on.</p>
      <ul className="divide-y divide-border">
        {topics.map((t) => (
          <li key={t.id}>
            <Link className="block py-3 text-sm font-medium hover:text-brand-600" href={`/practice/written?classId=${encodeURIComponent(classId)}&kcId=${encodeURIComponent(t.id)}&title=${encodeURIComponent(t.title)}`}>
              {t.title}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Screen() {
  const sp = useSearchParams();
  const classId = sp.get("classId") || undefined;
  const kcId = sp.get("kcId") || undefined;
  const noteId = sp.get("noteId") || undefined;
  const title = sp.get("title") || undefined;
  const back = noteId ? "/study/notes" : classId && kcId ? `/classes/${classId}/topics/${kcId}` : classId ? `/classes/${classId}` : "/study";
  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <Link href={back} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      {noteId || (classId && kcId) ? (
        <WrittenPractice key={`${noteId}${classId}${kcId}`} source={noteId ? { noteId } : { classId, kcId }} title={title} />
      ) : classId ? (
        <TopicPicker classId={classId} />
      ) : (
        <Card className="p-6 text-sm">Open Written practice from a topic or from your notes, so it knows what to ask about.</Card>
      )}
    </div>
  );
}

export default function WrittenPracticePage() {
  return (
    <Suspense fallback={null}>
      <Screen />
    </Suspense>
  );
}
