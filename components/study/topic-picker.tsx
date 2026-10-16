"use client";

import React, { useEffect, useState } from "react";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface TopicChoice {
  text: string;
  classId: string;
  kcId: string;
}

interface Opt {
  id: string;
  title: string;
}

const selectCls =
  "h-11 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

/** Pick one of your class topics, or paste/type a topic or notes. */
export function TopicPicker({
  value,
  onChange,
  textPlaceholder = "Type a syllabus topic, or paste notes…",
  rows = 4,
}: {
  value: TopicChoice;
  onChange: (v: TopicChoice) => void;
  textPlaceholder?: string;
  rows?: number;
}) {
  const [classes, setClasses] = useState<Opt[]>([]);
  const [topics, setTopics] = useState<Opt[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/classes?scope=mine")
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.ok) return;
        setClasses(
          asArray<{ id: string; title: string; isOwner?: boolean; userEnrollmentStatus?: string }>(j.data)
            .filter((c) => c.isOwner || c.userEnrollmentStatus === "active")
            .map((c) => ({ id: c.id, title: c.title }))
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!value.classId) return;
    let alive = true;
    fetch(`/api/classes/${value.classId}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive && j.ok) setTopics(asArray<{ id: string; title: string }>(j.data?.kcs).map((k) => ({ id: k.id, title: k.title })));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value.classId]);

  const usingClass = Boolean(value.classId);
  return (
    <div className="space-y-2">
      {classes.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            aria-label="Class"
            className={selectCls}
            value={value.classId}
            onChange={(e) => {
              setTopics([]);
              onChange({ ...value, classId: e.target.value, kcId: "" });
            }}
          >
            <option value="">From my own text…</option>
            {asArray(classes).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          {usingClass && (
            <select aria-label="Topic" className={selectCls} value={value.kcId} onChange={(e) => onChange({ ...value, kcId: e.target.value })}>
              <option value="">Choose a topic…</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {!usingClass && (
        <textarea
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          rows={rows}
          maxLength={12000}
          placeholder={textPlaceholder}
          className={cn(selectCls, "h-auto py-2.5 resize-y")}
        />
      )}
    </div>
  );
}

/** True when the choice has enough to send. */
export function topicReady(v: TopicChoice): boolean {
  return v.classId ? Boolean(v.kcId) : v.text.trim().length >= 3;
}

/** Request fields for the API. */
export function topicPayload(v: TopicChoice): { classId?: string; kcId?: string; text?: string } {
  return v.classId && v.kcId ? { classId: v.classId, kcId: v.kcId } : { text: v.text.trim() };
}
