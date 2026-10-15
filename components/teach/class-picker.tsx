"use client";

import { useEffect, useState } from "react";
import { asArray } from "@/lib/api/client";
import { api, type MyClass } from "@/lib/teach/client";

/** Classes the signed-in teacher owns or co-teaches. */
export function useTeacherClasses() {
  const [classes, setClasses] = useState<MyClass[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api<MyClass[]>("/api/classes?scope=mine");
        if (alive) setClasses(asArray<MyClass>(data).filter((c) => c.isOwner));
      } catch {
        if (alive) setClasses([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { classes, loading };
}

export function ClassSelect({
  classes,
  value,
  onChange,
}: {
  classes: MyClass[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Class"
      className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <option value="">Choose a class…</option>
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </select>
  );
}
