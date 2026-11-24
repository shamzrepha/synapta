"use client";

import React, { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { asArray } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast";

interface School { id: string; name: string; departments: string[] }
interface Inst { id: string; name: string; schools: School[] }
const field = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

/** Lecturer control: which school, department and levels a class is for. Students who set their course only see classes that match. */
export function ClassAudience({ classId, institution, department, levels, open, onSaved }: { classId: string; institution?: string; department?: string; levels?: number[]; open?: boolean; onSaved: () => void }) {
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [insts, setInsts] = useState<Inst[]>([]);
  const [inst, setInst] = useState(institution || "");
  const [dept, setDept] = useState(department || "");
  const [lv, setLv] = useState<number[]>(levels || []);
  const [everyone, setEveryone] = useState(!!open);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    fetch("/api/profile/academic").then((r) => r.json()).then((j) => j.ok && setInsts(asArray<Inst>(j.data.institutions))).catch(() => null);
  }, [show]);

  const known = insts.find((i) => i.name === inst || i.name.toLowerCase().includes(inst.toLowerCase()) && inst.length > 3);
  const departments = known ? known.schools.flatMap((s) => s.departments).sort() : [];

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ institution: known ? known.name : inst.trim(), department: dept.trim(), levels: lv, open: everyone }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) return toast({ title: "Couldn't save", description: j?.error?.message || "Try again.", variant: "destructive" });
      toast({ title: "Saved", description: "Only matching students will see this class.", variant: "success" });
      setShow(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="text-xs" onClick={() => setShow(true)}><Users className="mr-1 h-3.5 w-3.5 text-brand-600" /> Who sees this</Button>
      {show && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Who can see this class" onClick={() => setShow(false)}>
          <div className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Who can see this class</h2>
            <p className="text-sm text-muted-foreground">Students who have set their course only see classes for their own school, department and level. Leave department or levels empty for all.</p>
            <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} className="h-4 w-4" /> Open to every student, whatever their school</label>
            {!everyone && (
              <>
                <input className={field} list="acad-insts" placeholder="School" value={inst} onChange={(e) => setInst(e.target.value)} aria-label="School" />
                <datalist id="acad-insts">{insts.map((i) => <option key={i.id} value={i.name} />)}</datalist>
                <input className={field} list="acad-depts" placeholder="Department (optional)" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department" />
                <datalist id="acad-depts">{departments.map((d) => <option key={d} value={d} />)}</datalist>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Levels">
                  {[100, 200, 300, 400, 500, 600].map((l) => (
                    <button key={l} type="button" aria-pressed={lv.includes(l)} onClick={() => setLv((c) => (c.includes(l) ? c.filter((x) => x !== l) : [...c, l]))} className={`min-h-[44px] min-w-[56px] rounded-lg border px-3 text-sm font-semibold ${lv.includes(l) ? "border-brand-600 bg-brand-600 text-white" : "border-border"}`}>{l}</button>
                  ))}
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShow(false)}>Cancel</Button>
              <Button onClick={() => void save()} isLoading={busy}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
