"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MasteryRadar } from "@/components/dashboard/mastery-radar";
import {
  ArrowLeft,
  Download,
  Search,
  Filter,
  Users,
  BrainCircuit,
  X,
  TrendingDown,
  TrendingUp,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { getMasteryStatus } from "@/lib/utils";
import { MASTERY_THRESHOLD } from "@/lib/bkt/engine";

interface HeatmapCell {
  kcId: string;
  pL: number;
  attempts: number;
  correct: number;
  status: "novice" | "emerging" | "competent" | "mastered";
  lastUpdated?: string | null;
}

interface StudentRow {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  xp: number;
  streakDays: number;
  averagePL: number;
  masteredCount: number;
  kcs: Record<string, HeatmapCell>;
}

interface KcItem {
  id: string;
  title: string;
  order: number;
  pL0: number;
  averagePL: number;
  masteredPercentage: number;
  strugglingPercentage: number;
}

interface HeatmapPayload {
  class: {
    id: string;
    title: string;
    subject: string;
    description: string;
  };
  kcs: KcItem[];
  students: StudentRow[];
  summary: {
    totalStudents: number;
    totalKcs: number;
    classAverageMastery: number;
    strugglingKcs: KcItem[];
  };
}

export default function ClassHeatmapPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);
  const { toast } = useToast();

  const [data, setData] = useState<HeatmapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "struggling" | "emerging" | "competent" | "mastered">("all");
  const [sortBy, setSortBy] = useState<"mastery_asc" | "mastery_desc" | "name_asc" | "xp_desc">("mastery_asc");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const refreshHeatmap = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/classes/${classId}/heatmap`);
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
      } else {
        toast({
          title: "Unable to load heatmap",
          description: json.error?.message || "Verify your teacher credentials.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection Error",
        description: "Failed to load class mastery heatmap.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const res = await fetch(`/api/classes/${classId}/heatmap`);
        const json = await res.json();
        if (!ignore && json.ok) {
          setData(json.data);
        }
      } catch {
        // Fallback handled gracefully
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, [classId]);

  const handleExportCSV = () => {
    if (!data || data.students.length === 0) {
      toast({ title: "No Data", description: "No student records to export.", variant: "destructive" });
      return;
    }

    const headers = [
      "Student Name",
      "Email",
      "XP",
      "Streak Days",
      "Average Mastery P(L)",
      "Mastered KCs Count",
      ...data.kcs.map((kc) => `"${kc.title.replace(/"/g, '""')}" P(L)`),
    ];

    const rows = data.students.map((s) => {
      const kcValues = data.kcs.map((kc) => {
        const cell = s.kcs[kc.id];
        return cell ? cell.pL.toFixed(3) : "0.200";
      });

      return [
        `"${s.displayName.replace(/"/g, '""')}"`,
        `"${s.email.replace(/"/g, '""')}"`,
        s.xp,
        s.streakDays,
        s.averagePL.toFixed(3),
        s.masteredCount,
        ...kcValues,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${data.class.title.replace(/\s+/g, "_")}_Mastery_Heatmap.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Complete",
      description: `Downloaded mastery matrix for ${data.students.length} students.`,
      variant: "success",
    });
  };

  // Filter & Sort Students
  const filteredStudents = (data?.students || []).filter((s) => {
    const matchesSearch =
      s.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === "struggling") return s.averagePL < 0.4;
    if (statusFilter === "emerging") return s.averagePL >= 0.4 && s.averagePL < 0.7;
    if (statusFilter === "competent") return s.averagePL >= 0.7 && s.averagePL < MASTERY_THRESHOLD;
    if (statusFilter === "mastered") return s.averagePL >= MASTERY_THRESHOLD;

    return true;
  }).sort((a, b) => {
    if (sortBy === "mastery_asc") return a.averagePL - b.averagePL;
    if (sortBy === "mastery_desc") return b.averagePL - a.averagePL;
    if (sortBy === "name_asc") return a.displayName.localeCompare(b.displayName);
    if (sortBy === "xp_desc") return b.xp - a.xp;
    return 0;
  });

  const getCellColor = (pL: number) => {
    if (pL >= MASTERY_THRESHOLD) {
      return "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30";
    }
    if (pL >= 0.7) {
      return "bg-teal-500/20 text-teal-800 dark:text-teal-300 border-teal-500/40 hover:bg-teal-500/30";
    }
    if (pL >= 0.4) {
      return "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/30";
    }
    return "bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-500/40 hover:bg-rose-500/30";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 space-y-4">
        <h2 className="text-2xl font-bold">Class Not Found</h2>
        <Link href={`/classes/${classId}`}>
          <Button>Back to Class</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link
          href={`/classes/${classId}/manage`}
          className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Teacher Console
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshHeatmap}
            className="text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleExportCSV}
            className="text-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Header Banner */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">Teacher Analytics</Badge>
          <Badge variant="secondary" className="text-xs">{data.class.subject}</Badge>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Class Mastery Heatmap
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {data.class.title} &bull; Mastery score across all enrolled students
        </p>
      </div>

      {/* Class KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Class Average Mastery */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Class Average P(L)
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {(data.summary.classAverageMastery * 100).toFixed(1)}%
              </span>
              <Badge
                variant={
                  data.summary.classAverageMastery >= 0.7
                    ? "emerald"
                    : data.summary.classAverageMastery >= 0.4
                    ? "amber"
                    : "destructive"
                }
                className="text-[10px]"
              >
                {getMasteryStatus(data.summary.classAverageMastery).label}
              </Badge>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
        </Card>

        {/* Total Students Enrolled */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Active Cohort Size
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {data.summary.totalStudents}
              </span>
              <span className="text-xs text-slate-500">Students</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5" />
          </div>
        </Card>

        {/* Highest Mastery KC */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Strongest Concept
            </span>
            <div className="mt-1">
              {data.kcs.length > 0 ? (
                <>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[170px]">
                    {[...data.kcs].sort((a, b) => b.averagePL - a.averagePL)[0]?.title}
                  </p>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    {([ ...data.kcs].sort((a, b) => b.averagePL - a.averagePL)[0]?.averagePL * 100).toFixed(0)}% Class Mastery
                  </span>
                </>
              ) : (
                <span className="text-xs text-slate-400">No KCs</span>
              )}
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
        </Card>

        {/* Areas for Intervention */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Target Intervention Area
            </span>
            <div className="mt-1">
              {data.summary.strugglingKcs.length > 0 ? (
                <>
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400 truncate max-w-[170px]">
                    {data.summary.strugglingKcs[0]?.title}
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {(data.summary.strugglingKcs[0]?.averagePL * 100).toFixed(0)}% Class Mastery
                  </span>
                </>
              ) : (
                <span className="text-xs text-emerald-600 font-semibold">All Concepts &ge; 70%</span>
              )}
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <TrendingDown className="h-5 w-5" />
          </div>
        </Card>
      </div>

      {/* Filter and Control Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by student name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center gap-1 text-xs">
              <Filter className="h-3.5 w-3.5 text-slate-400 mr-1" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="all">All Statuses ({data.students.length})</option>
                <option value="struggling">Struggling (&lt;40%)</option>
                <option value="emerging">Emerging (40-69%)</option>
                <option value="competent">Competent (70-94%)</option>
                <option value="mastered">Mastered (&ge;95%)</option>
              </select>
            </div>

            {/* Sort Options */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="mastery_asc">Sort: Lowest Mastery First (Intervention)</option>
              <option value="mastery_desc">Sort: Highest Mastery First</option>
              <option value="name_asc">Sort: Student Name (A-Z)</option>
              <option value="xp_desc">Sort: Most XP Earned</option>
            </select>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Legend:</span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md bg-emerald-500 inline-block" /> Mastered (&ge;95%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md bg-teal-500 inline-block" /> Competent (70-94%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md bg-amber-500 inline-block" /> Emerging (40-69%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md bg-rose-500 inline-block" /> Struggling / Novice (&lt;40%)
          </span>
          <span className="ml-auto italic">Click any cell or row to drill down into student Cognitive Twin</span>
        </div>
      </Card>

      {/* Main Heatmap Matrix Container */}
      {filteredStudents.length === 0 ? (
        <Card className="p-12 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
              {data.students.length === 0 ? "No students enrolled yet" : "No students match the current criteria"}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {data.students.length === 0
                ? "No active students are enrolled in this class yet. Share the class invite code or course link with your learners to start tracking mastery."
                : "Try clearing your search query or adjusting the status filter."}
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              {/* Table Header: Students Column + Knowledge Components */}
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                  {/* Sticky Student Column Header */}
                  <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-900 p-3.5 min-w-[220px] font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                    Enrolled Student ({filteredStudents.length})
                  </th>

                  {/* Knowledge Component Columns */}
                  {data.kcs.map((kc, index) => (
                    <th
                      key={kc.id}
                      className="p-3 min-w-[130px] max-w-[180px] font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 text-center"
                    >
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">
                          KC {index + 1}
                        </span>
                        <p className="truncate text-xs font-bold" title={kc.title}>
                          {kc.title}
                        </p>
                        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-mono">
                          Avg: {(kc.averagePL * 100).toFixed(0)}%
                        </div>
                      </div>
                    </th>
                  ))}

                  {/* Summary Mastery Column */}
                  <th className="p-3 min-w-[110px] text-center font-bold text-slate-700 dark:text-slate-300">
                    Overall P(L)
                  </th>
                </tr>
              </thead>

              {/* Table Body: Student Rows */}
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredStudents.map((student) => {
                  return (
                    <tr
                      key={student.uid}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedStudent(student)}
                    >
                      {/* Sticky Student Profile Cell */}
                      <td className="sticky left-0 z-10 bg-white dark:bg-slate-950 group-hover:bg-slate-50 dark:group-hover:bg-slate-900 p-3 border-r border-slate-200 dark:border-slate-800 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold flex items-center justify-center text-xs shrink-0">
                            {student.displayName[0]?.toUpperCase() || "S"}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {student.displayName}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">{student.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Knowledge Component Heatmap Cells */}
                      {data.kcs.map((kc) => {
                        const cell = student.kcs[kc.id] || {
                          kcId: kc.id,
                          pL: kc.pL0,
                          attempts: 0,
                          correct: 0,
                          status: "novice",
                        };

                        return (
                          <td
                            key={kc.id}
                            className="p-2 border-r border-slate-200 dark:border-slate-800 text-center"
                          >
                            <div
                              className={`py-2 px-1 rounded-xl border font-bold text-xs transition-all ${getCellColor(
                                cell.pL
                              )}`}
                              title={`${student.displayName} - ${kc.title}: P(L) = ${(cell.pL * 100).toFixed(
                                1
                              )}% (${cell.correct}/${cell.attempts} correct)`}
                            >
                              <span>{(cell.pL * 100).toFixed(0)}%</span>
                              <span className="block text-[9px] font-normal opacity-75">
                                {cell.attempts} att
                              </span>
                            </div>
                          </td>
                        );
                      })}

                      {/* Overall Average Cell */}
                      <td className="p-3 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                            {(student.averagePL * 100).toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {student.masteredCount}/{data.kcs.length} Mastered
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer: Class Aggregate Row */}
              <tfoot>
                <tr className="bg-slate-100/70 dark:bg-slate-900/80 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                  <td className="sticky left-0 z-10 bg-slate-100 dark:bg-slate-900 p-3.5 border-r border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    Cohort Average ({data.summary.totalStudents} Students)
                  </td>

                  {data.kcs.map((kc) => (
                    <td
                      key={kc.id}
                      className="p-3 text-center border-r border-slate-200 dark:border-slate-800"
                    >
                      <span className="font-extrabold text-xs block text-slate-900 dark:text-slate-100">
                        {(kc.averagePL * 100).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        {kc.masteredPercentage}% mastered
                      </span>
                    </td>
                  ))}

                  <td className="p-3 text-center font-extrabold text-teal-600 dark:text-teal-400">
                    {(data.summary.classAverageMastery * 100).toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* STUDENT SKILL MAP DRILL-DOWN MODAL */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 font-extrabold flex items-center justify-center text-lg">
                  {selectedStudent.displayName[0]?.toUpperCase() || "S"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
                      {selectedStudent.displayName}
                    </h3>
                    <Badge variant="outline" className="text-xs">
                      Skill Map
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">{selectedStudent.email}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStudent(null)}
                className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Telemetry Overview Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Overall P(L)
                  </span>
                  <span className="text-lg font-black text-teal-600 dark:text-teal-400">
                    {(selectedStudent.averagePL * 100).toFixed(1)}%
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Mastered Concepts
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-slate-100">
                    {selectedStudent.masteredCount} / {data.kcs.length}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Total XP
                  </span>
                  <span className="text-lg font-black text-amber-500">
                    {selectedStudent.xp} XP
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-center">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Active Streak
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-slate-100">
                    {selectedStudent.streakDays} Days 🔥
                  </span>
                </div>
              </div>

              {/* Radar Chart */}
              {data.kcs.length >= 3 && (
                <MasteryRadar
                  data={data.kcs.map((kc) => {
                    const cell = selectedStudent.kcs[kc.id];
                    return {
                      subject: kc.title.split(":")[0]?.slice(0, 16) || kc.title.slice(0, 16),
                      fullName: kc.title,
                      pL: Math.round((cell?.pL ?? kc.pL0) * 100),
                      threshold: 95,
                    };
                  })}
                />
              )}

              {/* Targeted AI Teacher Intervention Recommendation */}
              <div className="p-4 rounded-2xl border border-teal-500/20 bg-teal-500/5 dark:bg-teal-950/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-700 dark:text-teal-300">
                  <BrainCircuit className="h-4 w-4" />
                  <span>AI teaching recommendation</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {selectedStudent.averagePL >= 0.85
                    ? `${selectedStudent.displayName} displays strong conceptual synthesis across all primary KCs. Pair them in the Peer Study Lounge as a tutor for peers with P(L) < 0.40 to solidify mastery.`
                    : `${selectedStudent.displayName} would benefit from guided retrieval practice on struggling areas. Recommend focusing on active flashcards and the interactive simulator apparatus to reinforce physical intuitions.`}
                </p>
              </div>

              {/* Detailed Breakdown Table */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Knowledge Component Granular Mastery
                </h4>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="p-3 font-semibold">Knowledge Component</th>
                        <th className="p-3 font-semibold text-center">Status</th>
                        <th className="p-3 font-semibold text-center">Attempts</th>
                        <th className="p-3 font-semibold text-center">Accuracy</th>
                        <th className="p-3 font-semibold text-right">Mastery P(L)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.kcs.map((kc) => {
                        const cell = selectedStudent.kcs[kc.id] || {
                          kcId: kc.id,
                          pL: kc.pL0,
                          attempts: 0,
                          correct: 0,
                          status: "novice",
                        };

                        const accuracy =
                          cell.attempts > 0 ? ((cell.correct / cell.attempts) * 100).toFixed(0) : "N/A";

                        return (
                          <tr key={kc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="p-3">
                              <span className="font-bold text-slate-900 dark:text-slate-100 block">
                                {kc.title}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <Badge
                                variant={
                                  cell.pL >= MASTERY_THRESHOLD
                                    ? "emerald"
                                    : cell.pL >= 0.7
                                    ? "default"
                                    : cell.pL >= 0.4
                                    ? "amber"
                                    : "destructive"
                                }
                                className="text-[10px] capitalize"
                              >
                                {cell.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-center text-slate-600 dark:text-slate-400 font-mono">
                              {cell.attempts}
                            </td>
                            <td className="p-3 text-center text-slate-600 dark:text-slate-400 font-mono">
                              {accuracy === "N/A" ? "—" : `${accuracy}%`}
                            </td>
                            <td className="p-3 text-right">
                              <span className="font-black text-sm font-mono text-slate-900 dark:text-slate-100">
                                {(cell.pL * 100).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <Button size="sm" onClick={() => setSelectedStudent(null)}>
                Close Drill-Down
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
