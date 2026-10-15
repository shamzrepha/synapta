"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2, Play, Square, UserCheck, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, errMsg } from "@/lib/teach/client";
import { useUserStore } from "@/lib/store/use-user-store";
import { ClassSelect, useTeacherClasses } from "@/components/teach/class-picker";

export default function AttendancePage() {
  const user = useUserStore((s) => s.user);
  const isLoading = useUserStore((s) => s.isLoading);
  if (isLoading) return <div className="mx-auto max-w-3xl px-4 py-4"><Skeleton className="h-24 w-full rounded-2xl" /></div>;
  const teacher = user?.role === "teacher" || user?.role === "admin";
  return (
    <Suspense fallback={null}>
      {teacher ? <TeacherAttendance /> : <StudentAttendance />}
    </Suspense>
  );
}

interface Session {
  id: string;
  code: string;
  title?: string;
  openedAt: number;
  expiresAt: number;
  closed: boolean;
  checkedIn: number;
}
interface ReportRow { uid: string; name: string; present: number; late: number; total: number; percent: number }

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}

function TeacherAttendance() {
  const { toast } = useToast();
  const { classes, loading } = useTeacherClasses();
  const [classId, setClassId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [report, setReport] = useState<{ totalSessions: number; students: ReportRow[] } | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  const load = useCallback(async (cid: string) => {
    if (!cid) return;
    try {
      const [s, r] = await Promise.all([
        api<Session[]>(`/api/attendance?classId=${encodeURIComponent(cid)}`),
        api<{ totalSessions: number; students: ReportRow[] }>(`/api/attendance/report?classId=${encodeURIComponent(cid)}`),
      ]);
      setSessions(asArray<Session>(s));
      setReport({ totalSessions: r.totalSessions, students: asArray<ReportRow>(r.students) });
    } catch {
      setSessions([]);
      setReport(null);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(classId), 0);
    return () => clearTimeout(t);
  }, [classId, load]);

  // Keep the live count fresh while a check-in is open.
  const active = sessions.find((s) => !s.closed && s.expiresAt > now);
  useEffect(() => {
    if (!active || !classId) return;
    const t = setInterval(() => void load(classId), 8000);
    return () => clearInterval(t);
  }, [active, classId, load]);

  async function open() {
    setBusy(true);
    try {
      await api("/api/attendance", { method: "POST", body: { classId, minutes } });
      await load(classId);
    } catch (e) {
      toast({ title: "Could not open check-in", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function close(id: string) {
    try {
      await api(`/api/attendance/${id}`, { method: "PATCH" });
      await load(classId);
    } catch (e) {
      toast({ title: "Could not close", description: errMsg(e), variant: "destructive" });
    }
  }

  const remaining = active ? Math.max(0, Math.round((active.expiresAt - now) / 1000)) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-4 sm:px-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Attendance</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Open a check-in, share the code, and watch students arrive.</p>
      </header>
      {loading ? <Skeleton className="h-11 w-full rounded-xl" /> : <ClassSelect classes={classes} value={classId} onChange={setClassId} />}

      {classId && (
        <>
          {active ? (
            <Card className="border-teal-400">
              <CardContent className="space-y-3 p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check-in code</p>
                <p className="select-all font-mono text-5xl font-extrabold tracking-[0.25em] text-teal-600 dark:text-teal-400">{active.code}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} left · {active.checkedIn} checked in
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/teach/attendance?code=${active.code}`); toast({ title: "Link copied" }); }}><Copy className="mr-1 h-4 w-4" /> Copy link</Button>
                  <Button size="sm" variant="outline" onClick={() => close(active.id)}><Square className="mr-1 h-4 w-4" /> Close now</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 p-4">
                <div className="w-28">
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Open for (min)</label>
                  <Input type="number" min={1} max={240} value={minutes} onChange={(e) => setMinutes(Math.min(240, Math.max(1, Number(e.target.value) || 10)))} />
                </div>
                <Button onClick={open} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />} Open check-in</Button>
              </CardContent>
            </Card>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Report ({report?.totalSessions ?? 0} sessions)</h2>
              <a href={`/api/attendance/report?classId=${encodeURIComponent(classId)}&format=csv`} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <Download className="h-4 w-4" /> CSV
              </a>
            </div>
            {!report || report.students.length === 0 ? (
              <p className="text-sm text-slate-500">No students enrolled yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {report.students.map((s) => (
                  <div key={s.uid} className="flex items-center gap-3 p-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-white">{s.name}</span>
                    {s.late > 0 && <Badge variant="amber">{s.late} late</Badge>}
                    <span className="w-16 text-right text-xs text-slate-500">{s.present}/{s.total}</span>
                    <Badge variant={s.percent >= 80 ? "emerald" : s.percent >= 50 ? "amber" : "destructive"}>{s.percent}%</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Past check-ins</h2>
            {sessions.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
            {sessions.slice(0, 20).map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                <span>{new Date(s.openedAt).toLocaleString()}</span>
                <span className="text-slate-500">{s.checkedIn} present</span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

interface MyClassAttendance {
  classId: string;
  classTitle: string;
  present: number;
  late: number;
  total: number;
  percent: number;
  sessions: { id: string; openedAt: number; attended: boolean; late: boolean }[];
}

function StudentAttendance() {
  const { toast } = useToast();
  const params = useSearchParams();
  const [code, setCode] = useState(() => (params.get("code") || "").toUpperCase().slice(0, 12));
  const [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<MyClassAttendance[] | null>(null);

  const load = useCallback(async () => {
    try {
      setRecords(asArray<MyClassAttendance>(await api<MyClassAttendance[]>("/api/attendance/mine")));
    } catch {
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function checkIn() {
    setBusy(true);
    try {
      const r = await api<{ alreadyCheckedIn: boolean; late?: boolean }>("/api/attendance/checkin", { method: "POST", body: { code } });
      toast({
        title: r.alreadyCheckedIn ? "Already checked in" : r.late ? "Checked in (late)" : "You are checked in",
        variant: r.late ? "amber" : "success",
      });
      setCode("");
      await load();
    } catch (e) {
      toast({ title: "Check-in failed", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-4 sm:px-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Check in</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">Enter the code your teacher shows in class.</p>
      </header>
      <Card>
        <CardContent className="space-y-3 p-4">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC234"
            maxLength={12}
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="Check-in code"
            className="h-14 text-center font-mono text-2xl font-bold tracking-[0.3em]"
          />
          <Button className="w-full" size="lg" onClick={checkIn} disabled={busy || code.trim().length < 6}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />} Check in
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">My attendance</h2>
        {records === null ? (
          <Skeleton className="h-20 w-full rounded-2xl" />
        ) : records.length === 0 ? (
          <p className="text-sm text-slate-500">Join a class to see your attendance.</p>
        ) : (
          records.map((r) => (
            <Card key={r.classId}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">{r.classTitle}</span>
                  <Badge variant={r.percent >= 80 ? "emerald" : r.percent >= 50 ? "amber" : "destructive"}>{r.total ? `${r.percent}%` : "No sessions"}</Badge>
                </div>
                <p className="text-xs text-slate-500">{r.present} of {r.total} sessions{r.late ? ` · ${r.late} late` : ""}</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.sessions.map((s) => (
                    <span key={s.id} title={new Date(s.openedAt).toLocaleString()} className={`rounded-md px-2 py-1 text-xs font-medium ${s.attended ? (s.late ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300") : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                      {new Date(s.openedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
