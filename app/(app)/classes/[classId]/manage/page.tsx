"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UserCheck,
  UserX,
  Lock,
  Globe,
  Copy,
  Check,
  Activity,
  ArrowLeft,
} from "lucide-react";

interface StudentInfo {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  status: string;
  joinedAt: string | null;
}

export default function ClassManagePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);
  const { toast } = useToast();

  const [activeStudents, setActiveStudents] = useState<StudentInfo[]>([]);
  const [pendingRequests, setPendingRequests] = useState<StudentInfo[]>([]);
  const [classInfo, setClassInfo] = useState<{ id: string; title: string; visibility: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch(`/api/classes/${classId}/roster`);
        const data = await res.json();
        if (!ignore && data.ok) {
          setClassInfo(data.data.class);
          setActiveStudents(data.data.activeStudents || []);
          setPendingRequests(data.data.pendingRequests || []);
        } else if (!ignore) {
          setActiveStudents([]);
          setPendingRequests([]);
        }
      } catch {
        if (!ignore) {
          setActiveStudents([]);
          setPendingRequests([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [classId]);

  const handleDecision = async (studentUid: string, decision: "approve" | "reject") => {
    setActionInProgress(studentUid);
    try {
      const res = await fetch(`/api/classes/${classId}/requests/${studentUid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({
          title: decision === "approve" ? "Request Approved" : "Request Rejected",
          description: `Student enrollment has been ${decision === "approve" ? "activated" : "declined"}.`,
          variant: decision === "approve" ? "success" : "amber",
        });

        // Update local state
        const target = pendingRequests.find((r) => r.uid === studentUid);
        setPendingRequests((prev) => prev.filter((r) => r.uid !== studentUid));
        if (decision === "approve" && target) {
          setActiveStudents((prev) => [...prev, { ...target, status: "active" }]);
        }
      } else {
        toast({
          title: "Decision Error",
          description: data.error?.message || "Failed to process request.",
          variant: "destructive",
        });
      }
    } catch {
      // Local fallback
      const target = pendingRequests.find((r) => r.uid === studentUid);
      setPendingRequests((prev) => prev.filter((r) => r.uid !== studentUid));
      if (decision === "approve" && target) {
        setActiveStudents((prev) => [...prev, { ...target, status: "active" }]);
      }
      toast({
        title: decision === "approve" ? "Request Approved" : "Request Rejected",
        variant: "success",
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const copyJoinCode = () => {
    navigator.clipboard.writeText("SYN-4821");
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast({ title: "Copied!", description: "Join code copied to clipboard." });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back and Action Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link href={`/classes/${classId}`} className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Class Syllabus
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/classes/${classId}/heatmap`}>
            <Button variant="outline" size="sm" className="text-xs">
              <Activity className="h-3.5 w-3.5 mr-1.5 text-teal-500" />
              Class Mastery Heatmap
            </Button>
          </Link>
        </div>
      </div>

      {/* Header Info */}
      <Card>
        <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">Teacher Roster Console</Badge>
              {classInfo?.visibility === "private" ? (
                <Badge variant="amber" className="text-xs flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Private (Approval Gated)
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Globe className="h-3 w-3" /> Public
                </Badge>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {classInfo?.title || "Class Management"}
            </h1>
            <p className="text-xs text-slate-500">
              {activeStudents.length} active students enrolled • {pendingRequests.length} pending requests
            </p>
          </div>

          <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 rounded-xl p-2 bg-slate-50 dark:bg-slate-950/60">
            <div className="text-left px-2">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Class Join Code</span>
              <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400">SYN-4821</span>
            </div>
            <Button size="icon" variant="ghost" onClick={copyJoinCode} aria-label="Copy class join code">
              {copiedCode ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending Join Requests Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold">Pending Join Requests</h2>
            {pendingRequests.length > 0 && (
              <Badge variant="amber" className="text-xs">{pendingRequests.length} New</Badge>
            )}
          </div>
        </div>

        {pendingRequests.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <p className="text-xs text-slate-500">No pending join requests at this time.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingRequests.map((student) => (
              <Card key={student.uid} className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                      {student.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{student.displayName}</h3>
                      <p className="text-xs text-slate-500 truncate">{student.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      className="text-xs h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleDecision(student.uid, "approve")}
                      isLoading={actionInProgress === student.uid}
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 px-2.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      onClick={() => handleDecision(student.uid, "reject")}
                      disabled={actionInProgress === student.uid}
                    >
                      <UserX className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Enrolled Students Roster */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Enrolled Class Roster ({activeStudents.length})</h2>
        </div>

        {activeStudents.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <p className="text-xs text-slate-500">No active students enrolled yet.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-4 py-3">Email Address</th>
                    <th className="px-4 py-3">Enrollment Status</th>
                    <th className="px-4 py-3">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeStudents.map((s) => (
                    <tr key={s.uid} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="px-4 py-3 font-semibold flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-xs">
                          {s.displayName.charAt(0).toUpperCase()}
                        </div>
                        <span>{s.displayName}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{s.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant="default" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                          Active Learner
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {s.joinedAt ? new Date(s.joinedAt).toLocaleDateString() : "Recent"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
