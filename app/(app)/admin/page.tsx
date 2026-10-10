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
} from "lucide-react";

interface AdminUserItem {
  uid: string;
  displayName: string;
  email: string;
  role: "student" | "teacher" | "admin";
  disabled: boolean;
  xp: number;
  streakDays: number;
  monthlyTokensUsed: number;
  monthlyTokenLimit: number;
  createdAt: string | null;
  lastActiveDate: string | null;
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

export default function AdminConsolePage() {
  const { user } = useUserStore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"users" | "usage">("users");
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [usageData, setUsageData] = useState<PlatformUsageData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, usageRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/usage"),
      ]);

      const usersJson = await usersRes.json();
      const usageJson = await usageRes.json();

      if (usersJson.ok) {
        setUsers(usersJson.data.users || []);
      }
      if (usageJson.ok) {
        setUsageData(usageJson.data);
      }
    } catch {
      setUsers([]);
      setUsageData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function initData() {
      try {
        const [usersRes, usageRes] = await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/admin/usage"),
        ]);
        const usersJson = await usersRes.json();
        const usageJson = await usageRes.json();

        if (!ignore) {
          if (usersJson.ok) setUsers(usersJson.data.users || []);
          if (usageJson.ok) setUsageData(usageJson.data);
        }
      } catch {
        // Fallback demo data
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    initData();
    return () => {
      ignore = true;
    };
  }, []);

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
  const filteredUsers = users.filter((u) => {
    const matchQuery =
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.uid.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchQuery) return false;
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    return true;
  });

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
            User directory, permission elevation, AI token usage metrics, and infrastructure billing oversight.
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
              Registered Accounts
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {usageData?.counts.totalUsers ?? users.length}
              </span>
              <span className="text-[10px] text-slate-400">
                ({usageData?.counts.students ?? 0} St &bull; {usageData?.counts.teachers ?? 0} Te)
              </span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5" />
          </div>
        </Card>

        {/* Card 2: AI Token Consumption */}
        <Card className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              AI Tokens Consumed
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
                {(usageData?.summary.totalTokens ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">Tokens</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Cpu className="h-5 w-5" />
          </div>
        </Card>

        {/* Card 3: Estimated Infrastructure Cost */}
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
              BKT Evidence Logs
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-amber-500">
                {usageData?.counts.evidenceLogs ?? 0}
              </span>
              <span className="text-[10px] text-slate-400">Submissions</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Flame className="h-5 w-5" />
          </div>
        </Card>
      </div>

      {/* CONSOLE TAB NAVIGATION */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-1">
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all ${
            activeTab === "users"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <Users className="h-4 w-4" /> User Management ({users.length})
        </button>

        <button
          onClick={() => setActiveTab("usage")}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all ${
            activeTab === "usage"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <BarChart3 className="h-4 w-4" /> AI Token Quotas & Usage Analytics
        </button>
      </div>

      {/* TAB 1: USER MANAGEMENT DIRECTORY */}
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
                    <th className="p-3 font-semibold text-center">Platform Role</th>
                    <th className="p-3 font-semibold text-center">Status</th>
                    <th className="p-3 font-semibold text-center">XP / Streak</th>
                    <th className="p-3 font-semibold text-center">Monthly AI Quota</th>
                    <th className="p-3 font-semibold text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => {
                    const isSelf = u.uid === user?.uid;
                    const isPendingAction = updatingUid === u.uid;

                    return (
                      <tr
                        key={u.uid}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors ${
                          u.disabled ? "opacity-60 bg-slate-50/40 dark:bg-slate-950/40" : ""
                        }`}
                      >
                        {/* User Identity Cell */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold flex items-center justify-center text-xs shrink-0">
                              {u.displayName[0]?.toUpperCase() || "U"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                                {u.displayName}
                                {isSelf && (
                                  <Badge variant="outline" className="text-[9px]">
                                    You
                                  </Badge>
                                )}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role Cell */}
                        <td className="p-3 text-center">
                          <Badge
                            variant={
                              u.role === "admin"
                                ? "destructive"
                                : u.role === "teacher"
                                ? "amber"
                                : "secondary"
                            }
                            className="text-[10px] capitalize font-bold"
                          >
                            {u.role}
                          </Badge>
                        </td>

                        {/* Status Cell */}
                        <td className="p-3 text-center">
                          {u.disabled ? (
                            <Badge variant="destructive" className="text-[10px]">
                              Disabled
                            </Badge>
                          ) : (
                            <Badge variant="emerald" className="text-[10px]">
                              Active
                            </Badge>
                          )}
                        </td>

                        {/* XP / Streak Cell */}
                        <td className="p-3 text-center font-mono">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {u.xp} XP
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {u.streakDays}d streak
                          </span>
                        </td>

                        {/* Monthly AI Quota Cell */}
                        <td className="p-3 text-center">
                          <span className="font-mono text-[11px] font-bold text-teal-600 dark:text-teal-400 block">
                            {u.monthlyTokensUsed.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            / {u.monthlyTokenLimit.toLocaleString()} limit
                          </span>
                        </td>

                        {/* Actions Cell */}
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            {/* Role Switcher Selector */}
                            <select
                              value={u.role}
                              disabled={isSelf || isPendingAction}
                              onChange={(e) =>
                                handleRoleChange(
                                  u.uid,
                                  e.target.value as "student" | "teacher" | "admin"
                                )
                              }
                              className="h-7 px-2 text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:opacity-50 cursor-pointer"
                            >
                              <option value="student">Student</option>
                              <option value="teacher">Teacher</option>
                              <option value="admin">Admin</option>
                            </select>

                            {/* Toggle Account Disabled */}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isSelf || isPendingAction}
                              onClick={() => handleToggleDisabled(u.uid, u.disabled)}
                              className={`h-7 px-2 text-[11px] ${
                                u.disabled
                                  ? "text-emerald-600 hover:bg-emerald-50 border-emerald-300"
                                  : "text-rose-600 hover:bg-rose-50 border-rose-300"
                              }`}
                            >
                              {u.disabled ? (
                                <>
                                  <UserCheck className="h-3 w-3 mr-1" /> Enable
                                </>
                              ) : (
                                <>
                                  <UserX className="h-3 w-3 mr-1" /> Disable
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: AI TOKEN QUOTAS & USAGE ANALYTICS */}
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
                    {usageData.monthlyBreakdown.map((row, i) => (
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
    </div>
  );
}
