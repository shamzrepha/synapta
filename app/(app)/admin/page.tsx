"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useUserStore } from "@/lib/store/use-user-store";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { asArray } from "@/lib/api/client";
import {
  ShieldAlert,
  Users,
  Cpu,
  DollarSign,
  Flame,
  Search,
  Filter,
  RefreshCw,
  UserCheck,
  UserX,
  BarChart3,
  Calendar,
  GraduationCap,
  CheckCircle,
  XCircle,
  BookOpen,
  Trash2,
  AlertTriangle,
  FileText,
  Clock,
  Layers,
  Activity,
  Globe,
  Lock,
  Save,
  RotateCcw,
} from "lucide-react";

interface AdminUserItem {
  uid: string;
  displayName: string;
  email: string;
  role: "student" | "teacher" | "admin";
  roleRequest?: "none" | "pending" | "approved" | "rejected" | null;
  disabled: boolean;
  xp: number;
  streakDays: number;
  monthlyTokensUsed: number;
  monthlyTokenLimit: number;
  createdAt: string | null;
  lastActiveDate: string | null;
}

interface AdminClassItem {
  id: string;
  title: string;
  subject: string;
  teacherId: string;
  teacherName?: string;
  visibility: "public" | "private";
  status: "draft" | "published" | "archived";
  studentCount?: number;
  joinCode?: string;
  createdAt?: string;
}

interface AdminReportItem {
  id: string;
  reporterUid: string;
  reporterName: string;
  targetType: "bug" | "class" | "kc" | "ai_content" | "user";
  targetId: string | null;
  classId: string | null;
  kcId: string | null;
  reason: string;
  description: string;
  status: "pending" | "investigating" | "resolved" | "dismissed";
  adminNotes: string | null;
  createdAt: string | null;
}

interface AdminAuditItem {
  id: string;
  actorUid: string;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string | null;
}

interface PlatformUsageData {
  summary: {
    totalTokens: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalCalls: number;
    totalCostUsd: number;
  };
  monthlyBreakdown: {
    period: string;
    tokensIn: number;
    tokensOut: number;
    calls: number;
    estimatedCostUsd: number;
  }[];
  counts: {
    totalUsers: number;
    students: number;
    teachers: number;
    admins: number;
    classes: number;
    evidenceLogs: number;
  };
}

interface ModelHealthData {
  model: string;
  tier: string;
  rpd: number;
  requestsToday: number;
  tokensToday: number;
  status: "ok" | "exhausted" | "invalid";
  exhaustedUntil?: string;
}

interface ModelCatalogItem {
  id: string;
  tier: string;
  rpd: number;
  notes?: string;
}

type AdminTab = "overview" | "users" | "requests" | "classes" | "reports" | "usage" | "audit" | "system";

export default function AdminConsolePage() {
  const { user } = useUserStore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [classes, setClasses] = useState<AdminClassItem[]>([]);
  const [reports, setReports] = useState<AdminReportItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditItem[]>([]);
  const [usageData, setUsageData] = useState<PlatformUsageData | null>(null);
  const [modelsHealth, setModelsHealth] = useState<ModelHealthData[]>([]);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogItem[]>([]);
  const [modelAssignments, setModelAssignments] = useState<Record<string, string>>({});
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [resettingCooldowns, setResettingCooldowns] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [reportFilter, setReportFilter] = useState<string>("all");
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null);

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, usageRes, classesRes, reportsRes, auditRes, modelsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/usage"),
        fetch("/api/classes?scope=explore"),
        fetch("/api/admin/reports"),
        fetch("/api/admin/audit"),
        fetch("/api/admin/system/models"),
      ]);

      const [usersJson, usageJson, classesJson, reportsJson, auditJson, modelsJson] = await Promise.all([
        usersRes.json().catch(() => ({})),
        usageRes.json().catch(() => ({})),
        classesRes.json().catch(() => ({})),
        reportsRes.json().catch(() => ({})),
        auditRes.json().catch(() => ({})),
        modelsRes.json().catch(() => ({})),
      ]);

      if (usersJson.ok) setUsers(asArray<AdminUserItem>(usersJson.data?.users));
      if (usageJson.ok) setUsageData(usageJson.data || null);
      if (classesJson.ok) setClasses(asArray<AdminClassItem>(classesJson.data));
      if (reportsJson.ok) setReports(asArray<AdminReportItem>(reportsJson.data?.reports));
      if (modelsJson.ok) {
        if (Array.isArray(modelsJson.data?.models)) setModelsHealth(modelsJson.data.models);
        if (modelsJson.data?.assignments) setModelAssignments(modelsJson.data.assignments);
      }
    } catch {
      toast({ title: "Failed to load telemetry", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let ignore = false;
    async function initData() {
      try {
        const [usersRes, usageRes, classesRes, reportsRes, auditRes, modelsRes] = await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/admin/usage"),
          fetch("/api/classes?scope=explore"),
          fetch("/api/admin/reports"),
          fetch("/api/admin/audit"),
          fetch("/api/admin/system/models"),
        ]);
        const [usersJson, usageJson, classesJson, reportsJson, auditJson, modelsJson] = await Promise.all([
          usersRes.json().catch(() => ({})),
          usageRes.json().catch(() => ({})),
          classesRes.json().catch(() => ({})),
          reportsRes.json().catch(() => ({})),
          auditRes.json().catch(() => ({})),
          modelsRes.json().catch(() => ({})),
        ]);

        if (!ignore) {
          if (usersJson.ok) setUsers(asArray<AdminUserItem>(usersJson.data?.users));
          if (usageJson.ok) setUsageData(usageJson.data || null);
          if (classesJson.ok) setClasses(asArray<AdminClassItem>(classesJson.data));
          if (reportsJson.ok) setReports(asArray<AdminReportItem>(reportsJson.data?.reports));
          if (modelsJson.ok) {
            if (Array.isArray(modelsJson.data?.models)) setModelsHealth(modelsJson.data.models);
            if (Array.isArray(modelsJson.data?.catalog)) setModelCatalog(modelsJson.data.catalog);
            if (modelsJson.data?.assignments) setModelAssignments(modelsJson.data.assignments);
          }
        }
      } catch {
        // Fail gracefully without mock data
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    initData();
    return () => {
      ignore = true;
    };
  }, []);

  // Clear AI Model Cooldowns
  const handleClearCooldowns = async (modelName?: string) => {
    setResettingCooldowns(true);
    try {
      const res = await fetch("/api/admin/system/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_cooldowns", model: modelName }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Cooldowns Cleared",
          description: modelName ? `Cooldown removed for ${modelName}.` : "All model exhaustion cooldowns cleared.",
          variant: "success",
        });
        // Refresh models table
        const refRes = await fetch("/api/admin/system/models");
        const refJson = await refRes.json();
        if (refJson.ok && Array.isArray(refJson.data?.models)) {
          setModelsHealth(refJson.data.models);
        }
      } else {
        toast({
          title: "Reset Failed",
          description: json.error?.message || "Failed to clear cooldowns.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to connect to admin endpoint.", variant: "destructive" });
    } finally {
      setResettingCooldowns(false);
    }
  };

  // Test AI Model Health
  const handleTestModel = async (modelName: string) => {
    setTestingModel(modelName);
    try {
      const res = await fetch("/api/admin/system/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName }),
      });
      const json = await res.json();
      if (json.ok && json.data?.success) {
        toast({
          title: "Test Successful",
          description: `Model ${modelName} responded in ${json.data.latencyMs}ms.`,
          variant: "success",
        });
      } else {
        toast({
          title: "Test Alert",
          description: json.data?.errorMessage || json.error?.message || "Model test call failed.",
          variant: "destructive",
        });
      }
      // Refresh models table
      const refRes = await fetch("/api/admin/system/models");
      const refJson = await refRes.json();
      if (refJson.ok && Array.isArray(refJson.data?.models)) {
        setModelsHealth(refJson.data.models);
      }
    } catch {
      toast({ title: "Error", description: "Failed to connect to model endpoint.", variant: "destructive" });
    } finally {
      setTestingModel(null);
    }
  };

  // Save Dynamic Model Task Assignments
  const handleSaveModelAssignments = async () => {
    setSavingAssignments(true);
    try {
      const res = await fetch("/api/admin/system/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: modelAssignments }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Model Routing Updated",
          description: "Task model assignments successfully persisted to Firestore systemConfig.",
          variant: "success",
        });
        if (json.data?.assignments) {
          setModelAssignments(json.data.assignments);
        }
      } else {
        toast({
          title: "Update Failed",
          description: json.error?.message || "Failed to persist model assignments.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to connect to system models endpoint.", variant: "destructive" });
    } finally {
      setSavingAssignments(false);
    }
  };

  // Update User Role
  const handleRoleChange = async (targetUid: string, newRole: "student" | "teacher" | "admin") => {
    setUpdatingUid(targetUid);
    try {
      const res = await fetch(`/api/admin/users/${targetUid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (json.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.uid === targetUid ? { ...u, role: newRole } : u))
        );
        toast({
          title: "Role Updated",
          description: `User role updated to ${newRole}.`,
          variant: "success",
        });
      } else {
        toast({
          title: "Update Failed",
          description: json.error?.message || "Could not change role.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Network error modifying role.", variant: "destructive" });
    } finally {
      setUpdatingUid(null);
    }
  };

  // Toggle User Disabled
  const handleToggleDisabled = async (targetUid: string, currentDisabled: boolean) => {
    setUpdatingUid(targetUid);
    const nextState = !currentDisabled;
    try {
      const res = await fetch(`/api/admin/users/${targetUid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: nextState }),
      });
      const json = await res.json();
      if (json.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.uid === targetUid ? { ...u, disabled: nextState } : u))
        );
        toast({
          title: nextState ? "Account Disabled" : "Account Enabled",
          description: nextState ? "User is now barred from authentication." : "User access restored.",
          variant: nextState ? "amber" : "success",
        });
      } else {
        toast({
          title: "Action Forbidden",
          description: json.error?.message || "Could not toggle account status.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update account status.", variant: "destructive" });
    } finally {
      setUpdatingUid(null);
    }
  };

  // Approve Teacher Request
  const handleApproveTeacher = async (targetUid: string) => {
    setUpdatingUid(targetUid);
    try {
      const res = await fetch(`/api/admin/users/${targetUid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "teacher", roleRequest: "approved" }),
      });
      const json = await res.json();
      if (json.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.uid === targetUid
              ? { ...u, role: "teacher", roleRequest: "approved", monthlyTokenLimit: 200000 }
              : u
          )
        );
        toast({
          title: "Teacher Approved",
          description: "Elevated to verified teacher with 200,000 monthly token cap.",
          variant: "success",
        });
      } else {
        toast({
          title: "Action Failed",
          description: json.error?.message || "Could not approve request.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Network error approving request.", variant: "destructive" });
    } finally {
      setUpdatingUid(null);
    }
  };

  // Reject Teacher Request
  const handleRejectTeacher = async (targetUid: string) => {
    setUpdatingUid(targetUid);
    try {
      const res = await fetch(`/api/admin/users/${targetUid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleRequest: "rejected" }),
      });
      const json = await res.json();
      if (json.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.uid === targetUid ? { ...u, roleRequest: "rejected" } : u))
        );
        toast({
          title: "Request Rejected",
          description: "Teacher application rejected.",
          variant: "default",
        });
      } else {
        toast({
          title: "Action Failed",
          description: json.error?.message || "Could not reject request.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Network error rejecting request.", variant: "destructive" });
    } finally {
      setUpdatingUid(null);
    }
  };

  // Toggle Class Status
  const handleToggleClassStatus = async (classId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "published" ? "draft" : "published";
    try {
      const res = await fetch(`/api/classes/${classId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setClasses((prev) =>
          prev.map((c) => (c.id === classId ? { ...c, status: nextStatus } : c))
        );
        toast({ title: "Class Status Updated", description: `Course set to ${nextStatus}.`, variant: "success" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update class status.", variant: "destructive" });
    }
  };

  // Delete Class
  const handleDeleteClass = async (classId: string) => {
    if (!confirm("Are you sure you want to permanently delete this course?")) return;
    setDeletingClassId(classId);
    try {
      const res = await fetch(`/api/classes/${classId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        setClasses((prev) => prev.filter((c) => c.id !== classId));
        toast({ title: "Course Deleted", description: "Class removed from platform.", variant: "success" });
      } else {
        toast({ title: "Deletion Failed", description: json.error?.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error deleting class.", variant: "destructive" });
    } finally {
      setDeletingClassId(null);
    }
  };

  // Update Bug Report Status
  const handleUpdateReport = async (reportId: string, status: "investigating" | "resolved" | "dismissed") => {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status } : r))
        );
        toast({ title: "Report Updated", description: `Marked as ${status}.`, variant: "success" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update report.", variant: "destructive" });
    }
  };

  // Non-Admin Permission Guard
  if (user && user.role !== "admin") {
    return (
      <div className="text-center py-24 space-y-4 max-w-md mx-auto">
        <div className="h-16 w-16 rounded-3xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">
          Access Restricted
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          The Platform Operations Console is restricted to system administrators. Your account is registered as <strong>{user.role}</strong>.
        </p>
        <Link href="/dashboard">
          <Button size="sm">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

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

  // Filter users
  const filteredUsers = asArray(users).filter((u) => {
    const matchQuery =
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.uid.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchQuery) return false;
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    return true;
  });

  // Filter reports
  const filteredReports = asArray(reports).filter((r) => {
    if (reportFilter !== "all" && r.status !== reportFilter) return false;
    return true;
  });

  const pendingTeacherCount = asArray(users).filter((u) => u.roleRequest === "pending").length;
  const pendingReportCount = asArray(reports).filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">System Administration</Badge>
            <Badge variant="emerald" className="text-xs">Superuser Operations</Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
            Platform Operations Console
          </h1>
          <p className="text-xs text-slate-500">
            User directory, permission elevation, AI token usage metrics, content moderation, and audit logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAdminData}
            className="text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh Telemetry
          </Button>
        </div>
      </div>

      {/* PLATFORM KPI METRICS OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Registered Users */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Registered Users
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {usageData?.counts.totalUsers ?? asArray(users).length}
              </span>
              <span className="text-[10px] text-teal-600 font-semibold">
                {usageData?.counts.teachers ?? asArray(users).filter((u) => u.role === "teacher").length} Teachers
              </span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5" />
          </div>
        </Card>

        {/* Card 2: AI Token Invocations */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Tokens Consumed
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {((usageData?.summary.totalTokens ?? 0) / 1000).toFixed(1)}k
              </span>
              <span className="text-[10px] text-slate-400">Tokens</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Cpu className="h-5 w-5" />
          </div>
        </Card>

        {/* Card 3: Est. Gemini API Cost */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Est. Gemini API Cost
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                ${(usageData?.summary.totalCostUsd ?? 0.00).toFixed(4)}
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold">USD</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <DollarSign className="h-5 w-5" />
          </div>
        </Card>

        {/* Card 4: Cognitive Evidence Submissions */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Active Courses
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-amber-500">
                {asArray(classes).length}
              </span>
              <span className="text-[10px] text-slate-400">Classes</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
        </Card>
      </div>

      {/* CONSOLE TAB NAVIGATION */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all shrink-0 ${
            activeTab === "overview"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <Activity className="h-4 w-4" /> Overview
        </button>

        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all shrink-0 ${
            activeTab === "users"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <Users className="h-4 w-4" /> Users ({asArray(users).length})
        </button>

        <button
          onClick={() => setActiveTab("requests")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all shrink-0 ${
            activeTab === "requests"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <GraduationCap className="h-4 w-4" /> Teacher Requests
          {pendingTeacherCount > 0 && (
            <Badge variant="amber" className="ml-1 text-[10px] px-1.5 py-0">
              {pendingTeacherCount}
            </Badge>
          )}
        </button>

        <button
          onClick={() => setActiveTab("classes")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all shrink-0 ${
            activeTab === "classes"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <BookOpen className="h-4 w-4" /> Courses ({asArray(classes).length})
        </button>

        <button
          onClick={() => setActiveTab("reports")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all shrink-0 ${
            activeTab === "reports"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <AlertTriangle className="h-4 w-4" /> Bug & Safety Reports
          {pendingReportCount > 0 && (
            <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">
              {pendingReportCount}
            </Badge>
          )}
        </button>

        <button
          onClick={() => setActiveTab("usage")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all shrink-0 ${
            activeTab === "usage"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <BarChart3 className="h-4 w-4" /> AI Costs
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all shrink-0 ${
            activeTab === "audit"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <FileText className="h-4 w-4" /> Audit Log
        </button>

        <button
          onClick={() => setActiveTab("system")}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all shrink-0 ${
            activeTab === "system"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <Cpu className="h-4 w-4" /> System & AI Health
        </button>
      </div>

      {/* TAB: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
              Platform Health & Invariants Status
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300">
                  Authentication & Permissions
                </span>
                <p className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                  Strict Server RBAC Active
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Privileged client Firestore writes blocked with rules lockdown.
                </p>
              </div>

              <div
                onClick={() => setActiveTab("system")}
                className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900/50 space-y-1 cursor-pointer hover:border-teal-400 dark:hover:border-teal-700 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-teal-700 dark:text-teal-300">
                    Model Routing & Fallbacks
                  </span>
                  <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 group-hover:underline">
                    Configure →
                  </span>
                </div>
                <p className="text-sm font-bold text-teal-950 dark:text-teal-100">
                  Dynamic Task Router Engaged
                </p>
                <p className="text-xs text-teal-700 dark:text-teal-300">
                  Assign models to workloads and manage quota cooldowns.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-1">
                <span className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-300">
                  Data Persistence & Integrity
                </span>
                <p className="text-sm font-bold text-blue-950 dark:text-blue-100">
                  Zero Enrollment Ownership
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Teachers own classes implicitly without duplicate enrollment records.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB: USER MANAGEMENT DIRECTORY */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {/* Search & Role Filter Bar */}
          <Card className="p-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search users by name, email, or UID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-teal-500"
                >
                  <option value="all">All Roles</option>
                  <option value="student">Students Only</option>
                  <option value="teacher">Teachers Only</option>
                  <option value="admin">Administrators Only</option>
                </select>
              </div>
            </div>
          </Card>

          {/* User Table */}
          <Card className="overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    <th className="p-3.5 font-bold">User Identity</th>
                    <th className="p-3 font-semibold">System Role</th>
                    <th className="p-3 font-semibold text-center">XP & Streak</th>
                    <th className="p-3 font-semibold text-center">Monthly AI Quota</th>
                    <th className="p-3 font-semibold">Registered</th>
                    <th className="p-3 font-semibold text-right">Administrative Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                        No registered users match your query filter.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const quotaPercent = Math.min(
                        100,
                        Math.round((u.monthlyTokensUsed / (u.monthlyTokenLimit || 1)) * 100)
                      );

                      return (
                        <tr
                          key={u.uid}
                          className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors ${
                            u.disabled ? "opacity-60 bg-red-50/10" : ""
                          }`}
                        >
                          <td className="p-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold flex items-center justify-center shrink-0">
                                {u.displayName[0]?.toUpperCase() || "U"}
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 dark:text-slate-100">
                                    {u.displayName}
                                  </span>
                                  {u.disabled && (
                                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                                      Frozen
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 font-mono">{u.email}</p>
                                <span className="text-[10px] text-slate-400 font-mono">UID: {u.uid}</span>
                              </div>
                            </div>
                          </td>

                          <td className="p-3">
                            <select
                              value={u.role}
                              disabled={updatingUid === u.uid}
                              onChange={(e) =>
                                handleRoleChange(u.uid, e.target.value as "student" | "teacher" | "admin")
                              }
                              className="h-8 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-semibold"
                            >
                              <option value="student">Student</option>
                              <option value="teacher">Teacher</option>
                              <option value="admin">Administrator</option>
                            </select>
                          </td>

                          <td className="p-3 text-center">
                            <div className="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
                              <Flame className="h-3.5 w-3.5 text-amber-500" />
                              <span>{u.xp} XP</span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                ({u.streakDays}d streak)
                              </span>
                            </div>
                          </td>

                          <td className="p-3 text-center">
                            <div className="space-y-1">
                              <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                {(u.monthlyTokensUsed / 1000).toFixed(1)}k /{" "}
                                {(u.monthlyTokenLimit / 1000).toFixed(0)}k
                              </span>
                              <div className="w-24 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mx-auto overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    quotaPercent > 90
                                      ? "bg-rose-500"
                                      : quotaPercent > 70
                                      ? "bg-amber-500"
                                      : "bg-teal-500"
                                  }`}
                                  style={{ width: `${quotaPercent}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="p-3 text-slate-500 text-[11px] font-mono">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Unknown"}
                          </td>

                          <td className="p-3 text-right">
                            <Button
                              size="sm"
                              variant={u.disabled ? "default" : "outline"}
                              disabled={updatingUid === u.uid}
                              onClick={() => handleToggleDisabled(u.uid, u.disabled)}
                              className="text-xs h-8"
                            >
                              {u.disabled ? (
                                <>
                                  <UserCheck className="h-3.5 w-3.5 mr-1 text-emerald-400" /> Restore
                                </>
                              ) : (
                                <>
                                  <UserX className="h-3.5 w-3.5 mr-1 text-rose-500" /> Freeze
                                </>
                              )}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB: TEACHER REQUESTS */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                Pending Teacher Accreditation Requests
              </h3>
              <p className="text-xs text-slate-500">
                Review and approve educators applying to create and publish curriculum courses.
              </p>
            </div>

            {asArray(users).filter((u) => u.roleRequest === "pending").length === 0 ? (
              <div className="text-center py-12 space-y-2 border border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  No pending educator requests
                </p>
                <p className="text-[11px] text-slate-400">
                  All applicant verification tickets have been processed.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {asArray(users)
                  .filter((u) => u.roleRequest === "pending")
                  .map((u) => (
                    <Card
                      key={u.uid}
                      className="p-5 border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/10 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {u.displayName}
                          </span>
                          <Badge variant="amber" className="text-[10px]">
                            Application Pending
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">{u.email}</p>
                        <p className="text-[11px] text-slate-400">UID: {u.uid}</p>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-amber-200/40 dark:border-amber-900/40">
                        <Button
                          size="sm"
                          disabled={updatingUid === u.uid}
                          onClick={() => handleApproveTeacher(u.uid)}
                          className="text-xs flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve Teacher
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingUid === u.uid}
                          onClick={() => handleRejectTeacher(u.uid)}
                          className="text-xs flex-1"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1 text-rose-500" /> Reject
                        </Button>
                      </div>
                    </Card>
                  ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB: COURSES & CLASSES */}
      {activeTab === "classes" && (
        <div className="space-y-4">
          <Card className="overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm">Course Directory ({asArray(classes).length})</h3>
              <span className="text-xs text-slate-500">Manage courses and visibility</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    <th className="p-3.5 font-bold">Course Title</th>
                    <th className="p-3 font-semibold">Subject</th>
                    <th className="p-3 font-semibold text-center">Status</th>
                    <th className="p-3 font-semibold text-center">Enrollment</th>
                    <th className="p-3 font-semibold text-center">Join Code</th>
                    <th className="p-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {asArray(classes).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                        No courses registered on platform.
                      </td>
                    </tr>
                  ) : (
                    asArray(classes).map((cls) => (
                      <tr key={cls.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                        <td className="p-3.5">
                          <Link href={`/classes/${cls.id}`} className="font-bold hover:text-teal-600 transition-colors">
                            {cls.title}
                          </Link>
                          <p className="text-[10px] text-slate-400 font-mono">ID: {cls.id}</p>
                        </td>

                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px] uppercase">{cls.subject}</Badge>
                        </td>

                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleToggleClassStatus(cls.id, cls.status)}
                            className="cursor-pointer"
                          >
                            <Badge variant={cls.status === "published" ? "emerald" : "amber"} className="text-[10px]">
                              {cls.status}
                            </Badge>
                          </button>
                        </td>

                        <td className="p-3 text-center font-mono">
                          {cls.studentCount ?? 0} students
                        </td>

                        <td className="p-3 text-center font-mono font-bold text-teal-600 dark:text-teal-400">
                          {cls.joinCode || "None"}
                        </td>

                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link href={`/classes/${cls.id}/manage/content`}>
                              <Button size="sm" variant="outline" className="text-xs h-7 px-2">
                                Studio
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deletingClassId === cls.id}
                              onClick={() => handleDeleteClass(cls.id)}
                              className="text-xs h-7 px-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB: BUG REPORTS & SAFETY TRIAGE */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          <Card className="p-4 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm">Bug Reports & Safety Triage ({asArray(reports).length})</h3>
              <p className="text-xs text-slate-500">Review flagged user content and reported application issues</p>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value)}
                className="h-8 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending Only</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
          </Card>

          {filteredReports.length === 0 ? (
            <Card className="p-12 text-center text-slate-400 border-dashed">
              <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold">Triage queue empty</p>
              <p className="text-xs text-slate-500">No active reports match your filter criteria.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((report) => (
                <Card key={report.id} className="p-4 space-y-3 border-slate-200 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            report.status === "pending"
                              ? "destructive"
                              : report.status === "investigating"
                              ? "amber"
                              : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {report.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {report.targetType}
                        </Badge>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {report.reason}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {report.description}
                      </p>
                    </div>

                    <div className="text-right text-[11px] text-slate-400 shrink-0">
                      <span>Reporter: {report.reporterName}</span>
                      <p className="font-mono text-[10px]">
                        {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ""}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="text-[11px] text-slate-500">
                      {report.targetId && <span>Target Ref: <code className="font-mono">{report.targetId}</code></span>}
                    </div>

                    <div className="flex items-center gap-2">
                      {report.status !== "investigating" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateReport(report.id, "investigating")}
                          className="text-xs h-7"
                        >
                          Investigate
                        </Button>
                      )}
                      {report.status !== "resolved" && (
                        <Button
                          size="sm"
                          onClick={() => handleUpdateReport(report.id, "resolved")}
                          className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700"
                        >
                          Resolve
                        </Button>
                      )}
                      {report.status !== "dismissed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUpdateReport(report.id, "dismissed")}
                          className="text-xs h-7 text-slate-500"
                        >
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: AI TOKEN QUOTAS & USAGE ANALYTICS */}
      {activeTab === "usage" && (
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                Monthly Infrastructure Consumption Periods
              </h3>
              <p className="text-xs text-slate-500">
                Detailed telemetry of LLM token inputs, outputs, invocations, and estimated cloud charges.
              </p>
            </div>

            {(!usageData?.monthlyBreakdown || usageData.monthlyBreakdown.length === 0) ? (
              <div className="text-center py-12 space-y-2 border border-dashed rounded-2xl border-slate-200 dark:border-slate-800">
                <BarChart3 className="h-8 w-8 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  No historical usage cycles logged yet
                </p>
                <p className="text-[11px] text-slate-400">
                  Token records are written transactionally as students ask AI questions and synthesize syllabi.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                      <th className="p-3.5 font-bold">Billing Cycle</th>
                      <th className="p-3 font-semibold text-center">API Calls</th>
                      <th className="p-3 font-semibold text-center">Prompt Tokens (In)</th>
                      <th className="p-3 font-semibold text-center">Completion Tokens (Out)</th>
                      <th className="p-3 font-semibold text-right">Est. Cost (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {asArray(usageData.monthlyBreakdown).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                        <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                          {row.period}
                        </td>
                        <td className="p-3 text-center font-mono">{row.calls.toLocaleString()}</td>
                        <td className="p-3 text-center font-mono text-slate-600 dark:text-slate-400">
                          {row.tokensIn.toLocaleString()}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-600 dark:text-slate-400">
                          {row.tokensOut.toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          ${row.estimatedCostUsd.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Quota Policy Reference Card */}
          <Card className="p-5 border-teal-500/20 bg-teal-50/20 dark:bg-teal-950/20 space-y-2">
            <h4 className="font-bold text-xs text-teal-800 dark:text-teal-300">
              Active Platform Rate Limit & Quota Policies:
            </h4>
            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
              <li><strong>Sliding Window:</strong> Max 10 generative AI invocations per minute per authenticated user.</li>
              <li><strong>Student Monthly Quota:</strong> 50,000 tokens / month per account.</li>
              <li><strong>Teacher Monthly Quota:</strong> 200,000 tokens / month for syllabus synthesis and classroom tools.</li>
              <li><strong>Superusers (Admins):</strong> Exempt from monthly token caps.</li>
            </ul>
          </Card>
        </div>
      )}

      {/* TAB: AUDIT LOG */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <Card className="overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm">Security & Administrative Audit Logs ({asArray(auditLogs).length})</h3>
              <span className="text-xs text-slate-500">Immutable record of high-privilege operations</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    <th className="p-3.5 font-bold">Timestamp</th>
                    <th className="p-3 font-semibold">Action</th>
                    <th className="p-3 font-semibold">Actor UID</th>
                    <th className="p-3 font-semibold">Target Type</th>
                    <th className="p-3 font-semibold text-right">Target Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {asArray(auditLogs).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                        No audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    asArray(auditLogs).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                        <td className="p-3.5 font-mono text-[11px] text-slate-500 flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : "Unknown"}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px] font-mono font-bold">
                            {log.action}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {log.actorName ? `${log.actorName} (${log.actorUid.slice(0, 6)}...)` : log.actorUid}
                        </td>
                        <td className="p-3">
                          <span className="capitalize text-slate-700 dark:text-slate-300">
                            {log.targetType || "System"}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-[10px] text-slate-500">
                          {log.targetId || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB: SYSTEM & AI HEALTH */}
      {activeTab === "system" && (
        <div className="space-y-6">
          {/* Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Registered AI Models
                </span>
                <span className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 block">
                  {asArray(modelsHealth).length}
                </span>
                <span className="text-[10px] text-slate-400">Google Gemini API models</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                <Cpu className="h-5 w-5" />
              </div>
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Available Models
                </span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
                  {asArray(modelsHealth).filter((m) => m.status === "ok").length}
                </span>
                <span className="text-[10px] text-slate-400">Ready for user requests</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle className="h-5 w-5" />
              </div>
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Exhausted / Cooling
                </span>
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">
                  {asArray(modelsHealth).filter((m) => m.status !== "ok").length}
                </span>
                <span className="text-[10px] text-slate-400">Waiting for Pacific reset</span>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </Card>
          </div>

          {/* Model Registry & Health Table */}
          <Card className="overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm">Gemini Model Routing & Quota Health</h3>
                <p className="text-xs text-slate-500">
                  Per-model rate pacing, daily limits (RPD), and automatic fallback chains. Daily caps reset at midnight Pacific Time.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleClearCooldowns()}
                  disabled={resettingCooldowns}
                  className="text-xs text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  {resettingCooldowns ? "Resetting..." : "Reset All Cooldowns"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchAdminData}
                  className="text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    <th className="p-3.5 font-bold">Model Identifier</th>
                    <th className="p-3 font-semibold">Tier</th>
                    <th className="p-3 font-semibold">Free Tier RPD</th>
                    <th className="p-3 font-semibold">Today&apos;s Usage</th>
                    <th className="p-3 font-semibold">Health Status</th>
                    <th className="p-3 font-semibold">Reset / Cooldown</th>
                    <th className="p-3 font-semibold text-right">Diagnostic Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {asArray(modelsHealth).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                        No model health telemetry recorded yet.
                      </td>
                    </tr>
                  ) : (
                    asArray(modelsHealth).map((m) => {
                      const isExhausted = m.status === "exhausted";
                      const isInvalid = m.status === "invalid";
                      const percent = m.rpd > 0 ? Math.min(100, Math.round((m.requestsToday / m.rpd) * 100)) : 0;

                      return (
                        <tr key={m.model} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                          <td className="p-3.5 font-mono font-semibold text-[12px] text-slate-800 dark:text-slate-200">
                            {m.model}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={m.tier === "light" ? "emerald" : "amber"}
                              className="text-[10px] uppercase font-bold"
                            >
                              {m.tier}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                            {m.rpd} req/day
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full ${
                                    percent >= 90 ? "bg-rose-500" : percent >= 60 ? "bg-amber-500" : "bg-teal-500"
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                {m.requestsToday} ({percent}%)
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            {isInvalid ? (
                              <Badge variant="destructive" className="text-[10px] flex items-center gap-1 w-fit">
                                <XCircle className="h-3 w-3" /> Deprecated / 404
                              </Badge>
                            ) : isExhausted ? (
                              <Badge variant="amber" className="text-[10px] flex items-center gap-1 w-fit">
                                <AlertTriangle className="h-3 w-3" /> Quota Exhausted
                              </Badge>
                            ) : (
                              <Badge variant="emerald" className="text-[10px] flex items-center gap-1 w-fit">
                                <CheckCircle className="h-3 w-3" /> Operational
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-500">
                            {isExhausted && m.exhaustedUntil ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {new Date(m.exhaustedUntil).toLocaleTimeString()}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isExhausted && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-[11px] h-7 px-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                  disabled={resettingCooldowns}
                                  onClick={() => handleClearCooldowns(m.model)}
                                >
                                  Unstick
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-[11px] h-7 px-2.5"
                                disabled={testingModel === m.model}
                                onClick={() => handleTestModel(m.model)}
                              >
                                {testingModel === m.model ? (
                                  <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                                ) : null}
                                Test Call
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Dynamic Model Task Assignments Card */}
          <Card className="p-5 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Dynamic Task Model Routing & Assignment
                </h3>
                <p className="text-xs text-slate-500">
                  Assign primary Gemini models to distinct platform workloads. Changes take effect across all serverless runtimes immediately.
                </p>
              </div>
              <Button
                size="sm"
                className="text-xs shrink-0"
                onClick={handleSaveModelAssignments}
                disabled={savingAssignments}
              >
                {savingAssignments ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                Save Model Routing
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
              {[
                { task: "tutor_chat", label: "Tutor & Dialogue (Text)", desc: "Student AI tutor chat & quick interactive explanations", defaultTier: "Light" },
                { task: "structured_spec", label: "Structure & Schema (JSON)", desc: "JSON schema extraction, flashcards, and concept maps", defaultTier: "Light" },
                { task: "class_build", label: "Classroom Builder (Heavy)", desc: "Course syllabus synthesis, map reconciliation, and lesson generation", defaultTier: "Heavy" },
                { task: "grading_high_stakes", label: "Grading & Quiz Evaluation", desc: "Boss quests, rubric scoring, and teach-the-bot evaluation", defaultTier: "Heavy" },
                { task: "long_document", label: "Long Document Processing", desc: "Textbook extraction, syllabus parsing, and lecture notes", defaultTier: "Light" },
                { task: "voice", label: "Voice Lab & Podcast", desc: "High-fidelity audio podcast generation and real-time dialogue", defaultTier: "Voice" },
              ].map(({ task, label, desc, defaultTier }) => (
                <div key={task} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">{label}</span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">{defaultTier}</Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">{desc}</p>
                  <select
                    className="w-full text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    value={modelAssignments[task] || ""}
                    onChange={(e) =>
                      setModelAssignments((prev) => ({
                        ...prev,
                        [task]: e.target.value,
                      }))
                    }
                  >
                    {modelAssignments[task] &&
                      !modelCatalog.some((m) => m.id === modelAssignments[task]) &&
                      !modelsHealth.some((m) => m.model === modelAssignments[task]) && (
                        <option value={modelAssignments[task]}>
                          {modelAssignments[task]} (Currently assigned)
                        </option>
                      )}
                    {(modelCatalog.length > 0
                      ? modelCatalog
                      : modelsHealth.map((m) => ({ id: m.model, tier: m.tier, rpd: m.rpd, notes: undefined }))
                    ).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id} ({m.rpd} RPD, {m.tier})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
