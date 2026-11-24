"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { asArray } from "@/lib/api/client";

interface Slot { code: string; title: string; day: string; start: string; end: string; venue: string }
interface Course { code: string; title: string; shared: boolean }
interface Data { set: boolean; level?: number; department?: string; slots: Slot[]; courses: Course[] }
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TimetablePage() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    fetch("/api/timetable").then((r) => r.json()).then((j) => j.ok && setD({ ...j.data, slots: asArray<Slot>(j.data.slots), courses: asArray<Course>(j.data.courses) })).catch(() => null);
  }, []);
  if (!d) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (!d.set) return <p className="p-4 text-sm">Choose your school, department and level first (Settings) and your timetable will show here.</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">My timetable</h1>
      <p className="text-sm text-muted-foreground">{d.department}, {d.level} level</p>
      {d.slots.length === 0 && <p className="text-sm text-muted-foreground">Your timetable has not been added yet. Ask your course rep to send it to the Sunroot team.</p>}
      {DAYS.map((day) => {
        const rows = d.slots.filter((s) => s.day === day).sort((a, b) => a.start.localeCompare(b.start));
        if (rows.length === 0) return null;
        return (
          <Card key={day} className="space-y-2 p-4">
            <p className="font-semibold">{day}</p>
            {rows.map((s, i) => (
              <p key={i} className="flex flex-wrap justify-between gap-2 text-sm"><span><strong>{s.code}</strong> {s.title}</span><span className="text-muted-foreground">{s.start} to {s.end}{s.venue ? `, ${s.venue}` : ""}</span></p>
            ))}
          </Card>
        );
      })}
      {d.courses.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="font-semibold">Your courses</p>
          <ul className="space-y-1 text-sm">{d.courses.map((c) => <li key={c.code}><strong>{c.code}</strong> {c.title}{c.shared ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">shared with other departments</span> : null}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}
