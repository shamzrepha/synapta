"use client";

import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

interface Props {
  classId: string;
  title: string;
  subject: string;
  description: string;
  onSaved: (next: { title: string; subject: string; description: string }) => void;
}

/** Teachers can rename the class or reword its goal at any time (for example after accepting the AI's suggested name). */
export function EditClassDetails({ classId, title, subject, description, onSaved }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(title);
  const [s, setS] = useState(subject);
  const [d, setD] = useState(description);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: t.trim(), subject: s.trim(), description: d.trim() }) });
      const j = await res.json();
      if (!j.ok) return toast({ title: "Couldn't save", description: j.error?.message, variant: "destructive" });
      onSaved({ title: t.trim(), subject: s.trim(), description: d.trim() });
      setOpen(false);
      toast({ title: "Class details saved", variant: "success" });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="text-xs" onClick={() => { setT(title); setS(subject); setD(description); setOpen(true); }}>
        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit name and description
      </Button>
    );
  }
  return (
    <div className="w-full max-w-2xl space-y-2 rounded-xl border border-border bg-card p-3">
      <label className="block text-xs font-semibold">Class name<Input value={t} onChange={(e) => setT(e.target.value)} maxLength={100} className="mt-1" /></label>
      <label className="block text-xs font-semibold">Subject<Input value={s} onChange={(e) => setS(e.target.value)} maxLength={50} className="mt-1" /></label>
      <label className="block text-xs font-semibold">What students will be able to do<Textarea value={d} onChange={(e) => setD(e.target.value)} maxLength={1000} className="mt-1 min-h-20" /></label>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} isLoading={busy} disabled={t.trim().length < 3 || s.trim().length < 2 || d.trim().length < 10}>Save</Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
