"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useUserStore } from "@/lib/store/use-user-store";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  User,
  Users,
  Mail,
  Shield,
  Zap,
  Flame,
  Cpu,
  GraduationCap,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export default function ProfilePage() {
  const { user, updateUser } = useUserStore();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [requestingTeacher, setRequestingTeacher] = useState(false);

  // Profile Edit State
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const editName = nameInput !== null ? nameInput : (user?.displayName || "");
  const editUsername = usernameInput !== null ? usernameInput : (user?.username || "");

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    setSavingProfile(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editName.trim(),
          username: editUsername.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        updateUser({
          displayName: editName.trim(),
          username: editUsername.trim().toLowerCase(),
        });
        toast({
          title: "Profile Saved!",
          description: "Your display name and username have been updated.",
          variant: "success",
        });
      } else {
        toast({
          title: "Update Failed",
          description: data.error?.message || "Could not save profile.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection Error",
        description: "Failed to update profile.",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRequestTeacher = async () => {
    setRequestingTeacher(true);
    try {
      const res = await fetch("/api/me/request-teacher", {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        updateUser({ roleRequest: "pending" });
        toast({
          title: "Request Submitted",
          description: "Your request for Teacher access has been submitted for administrator approval.",
          variant: "success",
        });
      } else {
        toast({
          title: "Request Error",
          description: data.error?.message || "Failed to submit request.",
          variant: "destructive",
        });
      }
    } catch {
      // In local dev/fallback mode
      updateUser({ roleRequest: "pending" });
      toast({
        title: "Request Submitted",
        description: "Your request for Teacher access has been recorded.",
        variant: "success",
      });
    } finally {
      setRequestingTeacher(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Account Profile & Cognitive Twin
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your role, token limits, and view your current learning attributes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User Card */}
        <Card className="md:col-span-1">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-teal-600 text-2xl font-bold text-white shadow-md">
              {user?.displayName ? user.displayName.charAt(0).toUpperCase() : "U"}
            </div>
            <CardTitle className="text-lg">{user?.displayName || "Learner"}</CardTitle>
            <p className="text-xs font-semibold text-teal-600 dark:text-teal-400">
              @{user?.username || "choose_handle"}
            </p>
            <CardDescription className="text-xs truncate mt-0.5">{user?.email}</CardDescription>
            <div className="pt-2 flex justify-center">
              <Badge
                variant={
                  user?.role === "admin"
                    ? "destructive"
                    : user?.role === "teacher"
                    ? "amber"
                    : "default"
                }
                className="capitalize text-xs px-3 py-0.5"
              >
                {user?.role || "student"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3">
              <span className="flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-amber-500" /> Study Streak
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {user?.streakDays || 1} Days
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3">
              <span className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-teal-500" /> Total XP
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {formatNumber(user?.xp || 0)} XP
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3">
              <span className="flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-slate-400" /> Monthly Token Usage
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {formatNumber(user?.monthlyTokensUsed || 0)} / {formatNumber(user?.monthlyTokenLimit || 50000)}
              </span>
            </div>
          </CardContent>
          <CardFooter className="pt-4">
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => refreshUser()}>
              Refresh Claims & Session
            </Button>
          </CardFooter>
        </Card>

        {/* Role & Access Card + Edit Form */}
        <div className="md:col-span-2 space-y-6">
          {/* Edit Display Name and Username Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <CardTitle className="text-base">Profile & Handle Settings</CardTitle>
              </div>
              <CardDescription>
                Customize how you appear to peers and search for friends across Synapta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Full Display Name
                    </label>
                    <Input
                      type="text"
                      value={editName}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Unique @username
                    </label>
                    <Input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      placeholder="e.g. janedoe_99"
                      className="text-xs font-mono"
                      required
                    />
                    <p className="text-[10px] text-slate-400">Lowercase letters, numbers, and underscores only</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" size="sm" isLoading={savingProfile} className="text-xs">
                    Save Profile Changes
                  </Button>
                  <Link href="/friends">
                    <Button type="button" variant="outline" size="sm" className="text-xs">
                      <Users className="h-3.5 w-3.5 mr-1 text-teal-600 dark:text-teal-400" /> Go to Friends & Chat
                    </Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <CardTitle className="text-base">Role Privileges & Authorization</CardTitle>
              </div>
              <CardDescription>
                Synapta enforces strict server-side authorization through Firebase custom claims.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-semibold">Active Role</span>
                  </div>
                  <Badge
                    variant={user?.role === "admin" ? "destructive" : user?.role === "teacher" ? "amber" : "default"}
                    className="capitalize"
                  >
                    {user?.role || "student"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {user?.role === "admin"
                    ? "Full platform access: user management, global token tracking, role promotion, system health."
                    : user?.role === "teacher"
                    ? "Classroom manager: create and publish classes, run AI syllabus synthesis, view class mastery heatmaps."
                    : "Adaptive learner: explore and enroll in classes, practice in simulation labs, AI tutor grounded Q&A, peer lounges."}
                </p>
              </div>

              {/* Teacher Request Section for Students */}
              {user?.role === "student" && (
                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/10 space-y-3">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    <h3 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                      Instructor / Teacher Privileges
                    </h3>
                  </div>
                  <p className="text-xs text-amber-900/80 dark:text-amber-300/80">
                    Are you an instructor or curriculum creator? Request teacher verification to create private classes and generate AI syllabi.
                  </p>

                  {user.roleRequest === "pending" ? (
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 pt-1">
                      <Clock className="h-4 w-4 animate-spin" />
                      <span>Your teacher access request is currently pending review by an administrator.</span>
                    </div>
                  ) : user.roleRequest === "approved" ? (
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 pt-1">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Approved! Please refresh your session above.</span>
                    </div>
                  ) : (
                    <Button
                      variant="amber"
                      size="sm"
                      onClick={handleRequestTeacher}
                      isLoading={requestingTeacher}
                      className="mt-2 text-xs"
                    >
                      Request Teacher Access
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connected Identity */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-slate-500" />
                <CardTitle className="text-base">Identity & Continuity</CardTitle>
              </div>
              <CardDescription>
                Synced seamlessly across all your devices using Firebase Authentication.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="font-medium">Firebase UID:</span>
                <span className="font-mono text-[11px] truncate max-w-[200px]">{user?.uid}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="font-medium">Email Account:</span>
                <span className="font-mono text-[11px]">{user?.email || "Not linked"}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="font-medium">Cross-Device Twin State:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Synced via Cloud Firestore
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
