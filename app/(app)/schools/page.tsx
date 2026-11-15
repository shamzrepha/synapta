"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  School,
  Users,
  TrendingUp,
  AlertTriangle,
  Copy,
  Check,
  UserPlus,
  Crown,
  Sparkles,
  Search,
  ShieldCheck,
  Clock,
  Flame,
  GraduationCap,
  Newspaper,
  Megaphone,
  Download,
  Share2,
  Printer,
  QrCode,
  Layers,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Sprout } from "@/components/bot/sprout";
import { useUserStore } from "@/lib/store/use-user-store";
import { cn, formatNumber } from "@/lib/utils";
import type { SchoolStudentRow, InterUniStanding } from "@/app/api/schools/route";

interface SchoolView {
  id: string;
  name: string;
  kind: string;
  department: string;
  principalUid: string;
  principalName: string;
  inviteCode?: string;
  seatLimit: number;
  enrolledCount: number;
  teacherCount: number;
  seatExpiresAt: string | null;
  isActiveLicense: boolean;
  isManager: boolean;
  avgReadiness: number;
  atRiskCount: number;
  totalStudyMinutes: number;
  roster: SchoolStudentRow[];
}

interface AdminSchoolSummary {
  id: string;
  name: string;
  kind: string;
  department: string;
  inviteCode: string;
  seatLimit: number;
  studentCount: number;
  seatExpiresAt: string | null;
  isActiveLicense: boolean;
}

export default function SchoolsPortalPage() {
  const { user, updateUser } = useUserStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [mySchool, setMySchool] = useState<SchoolView | null>(null);
  const [standings, setStandings] = useState<InterUniStanding[]>([]);
  const [allSchools, setAllSchools] = useState<AdminSchoolSummary[]>([]);

  // Active view tab
  const [activeTab, setActiveTab] = useState<"portal" | "inter_uni">("portal");

  // Create School state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [schoolKind, setSchoolKind] = useState<"primary" | "secondary" | "university" | "polytechnic" | "college" | "academy">("secondary");
  const [schoolDept, setSchoolDept] = useState("");
  const [schoolSeats, setSchoolSeats] = useState(100);
  const [creatingSchool, setCreatingSchool] = useState(false);

  // Join by invite code state
  const [joinCode, setJoinCode] = useState("");
  const [joiningSchool, setJoiningSchool] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Bulk Register Students / Teachers state
  const [showRegisterPanel, setShowRegisterPanel] = useState(false);
  const [regRole, setRegRole] = useState<"student" | "teacher">("student");
  const [regList, setRegList] = useState("");
  const [regLevel, setRegLevel] = useState("100L");
  const [regDept, setRegDept] = useState("");
  const [registering, setRegistering] = useState(false);

  // School-wide Principal Announcement state
  const [showAnnouncePanel, setShowAnnouncePanel] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [sendingAnnounce, setSendingAnnounce] = useState(false);

  // Roster filter & search
  const [rosterFilter, setRosterFilter] = useState<"all" | "at_risk" | "teachers">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Admin seat grant state
  const [grantingSchoolId, setGrantingSchoolId] = useState<string | null>(null);

  // Rotating 60-second Physical Lecture / Lab Hall Attendance Code
  const [hallPin, setHallPin] = useState("482-910");
  useEffect(() => {
    const computePin = () => {
      const bucket = Math.floor(Date.now() / 60_000);
      const n = ((bucket * 2654435761) >>> 0) % 900000 + 100000;
      const s = String(n);
      setHallPin(`${s.slice(0, 3)}-${s.slice(3)}`);
    };
    const t = setTimeout(computePin, 0);
    const iv = setInterval(computePin, 15_000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, []);

  const sendParentWhatsAppReport = (student: SchoolStudentRow) => {
    if (!mySchool) return;
    const msg = [
      `*${mySchool.name} — Official Student Progress Report*`,
      `Student: ${student.displayName} (${student.level} • ${student.department})`,
      `Predicted Exam Readiness: *${student.predictedReadiness}%* (+${student.weeklyGain}%/wk trend)`,
      `Learning Style Cohort: ${student.cohortLabel}`,
      `Study Activity: ${student.totalStudyMinutes} mins logged • ${student.totalQuestionsAttempted} past questions practiced • ${student.streakDays}-day streak`,
      student.weakTopics.length > 0
        ? `Focus Areas for Revision: ${student.weakTopics.join(", ")}`
        : `Status: Excelling across all syllabus topics`,
      `Verified via SunRoot Institutional Portal`,
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  };

  const loadData = useCallback(async (targetSchoolId?: string) => {
    try {
      const qs = targetSchoolId ? `?schoolId=${encodeURIComponent(targetSchoolId)}` : "";
      const res = await fetch(`/api/schools${qs}`);
      const j = await res.json();
      if (j.ok && j.data) {
        setMySchool(j.data.mySchool || null);
        setStandings(Array.isArray(j.data.interUniStandings) ? j.data.interUniStandings : []);
        setAllSchools(Array.isArray(j.data.allSchools) ? j.data.allSchools : []);
      }
    } catch {
      // ignore network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (schoolName.trim().length < 3) return;
    setCreatingSchool(true);
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_school",
          name: schoolName.trim(),
          kind: schoolKind,
          department: schoolDept.trim(),
          seatLimit: Math.max(10, Number(schoolSeats) || 50),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        toast({
          title: "Could not create school",
          description: j?.error?.message || "Please try again",
          variant: "destructive",
        });
        return;
      }
      updateUser({ institution: schoolName.trim() });
      toast({
        title: "School Account Activated!",
        description: j.data.message,
        variant: "success",
      });
      setShowCreateModal(false);
      await loadData(j.data.schoolId);
    } finally {
      setCreatingSchool(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoiningSchool(true);
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join_by_code",
          inviteCode: joinCode.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        toast({
          title: "Could not join school",
          description: j?.error?.message || "Check your invite code",
          variant: "destructive",
        });
        return;
      }
      updateUser({ institution: j.data.schoolName });
      toast({
        title: "School Sponsorship Active!",
        description: j.data.message,
        variant: "success",
      });
      setJoinCode("");
      await loadData(j.data.schoolId);
    } finally {
      setJoiningSchool(false);
    }
  };

  const handleBulkRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mySchool || !regList.trim()) return;
    const identifiers = regList
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (identifiers.length === 0) return;

    setRegistering(true);
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_members",
          schoolId: mySchool.id,
          role: regRole,
          identifiers,
          defaultLevel: regLevel || undefined,
          defaultDepartment: regDept.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        toast({
          title: "Registration notice",
          description: j?.error?.message || "Could not register accounts",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Members Sponsored & Added!",
        description: j.data.message,
        variant: "success",
      });
      setRegList("");
      setShowRegisterPanel(false);
      await loadData(mySchool.id);
    } finally {
      setRegistering(false);
    }
  };

  const handleAdminGrantSemester = async (schoolId: string, seats = 250) => {
    setGrantingSchoolId(schoolId);
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "admin_grant_seats",
          schoolId,
          seatLimit: seats,
          days: 135,
        }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        toast({
          title: "Semester License Activated (135 Days)",
          description: `Upgraded school to ${seats} seats and sponsored ${j.data.upgradedMembers} enrolled members.`,
          variant: "success",
        });
        await loadData(schoolId);
      }
    } finally {
      setGrantingSchoolId(null);
    }
  };

  const copyInviteCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleSchoolAnnounce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mySchool || !announceTitle.trim() || !announceBody.trim()) return;
    setSendingAnnounce(true);
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "school_announce",
          schoolId: mySchool.id,
          title: announceTitle.trim(),
          body: announceBody.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        toast({
          title: "Could not send alert",
          description: j?.error?.message || "Try again shortly",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "School Alert Dispatched!",
        description: j.data.message,
        variant: "success",
      });
      setAnnounceTitle("");
      setAnnounceBody("");
      setShowAnnouncePanel(false);
    } finally {
      setSendingAnnounce(false);
    }
  };

  const exportRosterCsv = () => {
    if (!mySchool || mySchool.roster.length === 0) return;
    const headers = [
      "Full Name",
      "Username",
      "Email",
      "Role",
      "Level/Grade",
      "Department",
      "Predicted Exam Readiness (%)",
      "Weekly Gain (%)",
      "Learning Style Cohort",
      "Questions Attempted",
      "Study Time (Minutes)",
      "Streak Days",
      "Total XP",
      "Weak Topics",
    ];
    const escapeCsv = (val: string | number | null | undefined) => {
      const s = String(val ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(","),
      ...mySchool.roster.map((r) =>
        [
          r.displayName,
          r.username ? `@${r.username}` : "",
          r.email || "",
          r.role,
          r.level,
          r.department,
          r.predictedReadiness,
          r.weeklyGain,
          r.cohortLabel,
          r.totalQuestionsAttempted,
          r.totalStudyMinutes,
          r.streakDays,
          r.xp,
          r.weakTopics.join("; "),
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mySchool.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-student-progress.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  const filteredRoster = (mySchool?.roster || []).filter((r) => {
    if (rosterFilter === "at_risk" && (!r.atRisk || r.role !== "student")) return false;
    if (rosterFilter === "teachers" && r.role === "student") return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = `${r.displayName} ${r.username || ""} ${r.email || ""} ${r.department} ${r.level}`.toLowerCase();
      return hay.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono tracking-widest text-brand-600 uppercase">
            B2B SCHOOLS, PRINCIPAL PORTAL & INTER-UNI CUP
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2.5 mt-0.5">
            <School className="h-7 w-7 text-brand-600 shrink-0" />
            {mySchool ? mySchool.name : "Schools & Inter-University Hub"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            School-sponsored student accounts, Principal & Teacher cross-class progress dashboards, and the Pan-African Inter-University Championship.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex rounded-xl border border-border bg-slate-100/80 dark:bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("portal")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                activeTab === "portal"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Building2 className="h-3.5 w-3.5" /> School & Principal Portal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("inter_uni")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                activeTab === "inter_uni"
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Crown className="h-3.5 w-3.5" /> Inter-Uni Cup ({standings.length})
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCreateModal(true)}
            className="text-xs font-semibold"
          >
            <Building2 className="mr-1.5 h-3.5 w-3.5 text-brand-600" />
            {mySchool ? "New School Account" : "Create School Account"}
          </Button>
        </div>
      </div>

      {/* Quick Join by School Invite Code (for Students & Teachers) */}
      {!mySchool && (
        <Card className="p-4 sm:p-5 border-2 border-brand-500/30 bg-gradient-to-br from-brand-500/10 via-card to-card">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-center">
            <div className="flex items-start gap-3.5">
              <div className="relative w-12 h-14 shrink-0 flex items-center justify-center">
                <Sprout pose="wave" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-600 text-white inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> School-Sponsored Access
                </span>
                <h2 className="text-base font-extrabold text-foreground">
                  Did your School, Principal, or University Department sponsor SunRoot?
                </h2>
                <p className="text-xs text-muted-foreground">
                  Enter your school&apos;s invite code (e.g. <code className="font-mono">SCH-UNIL-4821</code>) to unlock full School Plan AI access paid for by your institution — or launch a new School Portal if you are a Principal, Dean, or Teacher.
                </p>
              </div>
            </div>

            <form onSubmit={handleJoinByCode} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter School Code (e.g. SCH-UNIL-1234)"
                className="font-mono uppercase text-xs h-10"
              />
              <Button
                type="submit"
                isLoading={joiningSchool}
                disabled={joinCode.trim().length < 4}
                className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shrink-0 h-10 px-4"
              >
                Activate School Pass
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* TAB 1: SCHOOL & PRINCIPAL PORTAL */}
      {activeTab === "portal" && (
        <>
          {mySchool ? (
            <div className="space-y-5">
              {/* School License & Principal Action Bar */}
              <Card className="p-5 border-2 border-brand-500/30 bg-gradient-to-br from-brand-500/10 via-card to-card space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand-600 text-white">
                        {mySchool.kind.toUpperCase()} LICENSE
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full",
                          mySchool.isActiveLicense
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-rose-500/15 text-rose-600"
                        )}
                      >
                        {mySchool.isActiveLicense
                          ? `Active until ${new Date(mySchool.seatExpiresAt!).toLocaleDateString()}`
                          : "License Expired"}
                      </span>
                      {mySchool.department && (
                        <span className="text-xs font-semibold text-muted-foreground">
                          • {mySchool.department}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg sm:text-xl font-extrabold text-foreground">{mySchool.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      Principal / Lead Admin: <strong>{mySchool.principalName}</strong> • All registered students receive full School Plan AI access sponsored by the institution.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {mySchool.inviteCode && (
                      <button
                        type="button"
                        onClick={() => void copyInviteCode(mySchool.inviteCode!)}
                        className="h-9 px-3 rounded-xl border border-brand-500/40 bg-card text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-brand-500/10 transition"
                        title="Copy School Invite Code for students"
                      >
                        <span>Code: {mySchool.inviteCode}</span>
                        {copiedCode ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-brand-600" />
                        )}
                      </button>
                    )}

                    <Link href="/feed?scope=school">
                      <Button size="sm" variant="outline" className="h-9 text-xs font-semibold">
                        <Newspaper className="mr-1.5 h-3.5 w-3.5 text-brand-600" /> Campus Feed
                      </Button>
                    </Link>

                    {mySchool.isManager && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowAnnouncePanel((v) => !v)}
                          className="h-9 text-xs font-semibold"
                        >
                          <Megaphone className="mr-1.5 h-3.5 w-3.5 text-amber-500" /> Principal Alert
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setShowRegisterPanel((v) => !v)}
                          className="h-9 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold"
                        >
                          <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Register Students / Teachers
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Principal School-Wide Alert Drawer */}
                {mySchool.isManager && showAnnouncePanel && (
                  <form
                    onSubmit={handleSchoolAnnounce}
                    className="p-4 rounded-xl border border-amber-500/35 bg-card space-y-3 animate-in fade-in duration-150"
                  >
                    <div>
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        <Megaphone className="h-4 w-4 text-amber-500" />
                        Broadcast Principal / HOD Alert to All {mySchool.name} Members
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Send an instant notification to every student and teacher in your school (e.g., exam schedules, lab venues, or assembly notices).
                      </p>
                    </div>
                    <Input
                      required
                      value={announceTitle}
                      onChange={(e) => setAnnounceTitle(e.target.value)}
                      placeholder="Headline, e.g. Mid-Semester CBT Mock Exam Starts Monday at 9 AM"
                      className="text-xs"
                    />
                    <textarea
                      required
                      rows={2}
                      value={announceBody}
                      onChange={(e) => setAnnounceBody(e.target.value)}
                      placeholder="Write the announcement details for your students and teachers..."
                      className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
                    />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowAnnouncePanel(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        isLoading={sendingAnnounce}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold"
                      >
                        Send School Alert
                      </Button>
                    </div>
                  </form>
                )}

                {/* Bulk Student & Teacher Registration Drawer (School Pays for Usage) */}
                {mySchool.isManager && showRegisterPanel && (
                  <form
                    onSubmit={handleBulkRegister}
                    className="p-4 rounded-xl border border-border bg-card space-y-3 animate-in fade-in duration-150"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">
                          Sponsor & Register Students or Teachers into {mySchool.name}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Paste student or teacher <code className="font-mono">@usernames</code> or email addresses (separated by commas or new lines). Their accounts will immediately be upgraded to your school&apos;s paid license.
                        </p>
                      </div>
                      <div className="inline-flex rounded-lg border border-border p-0.5 bg-slate-100 dark:bg-slate-900">
                        {(["student", "teacher"] as const).map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setRegRole(r)}
                            className={cn(
                              "px-2.5 py-1 rounded-md text-xs font-bold capitalize",
                              regRole === r ? "bg-brand-600 text-white" : "text-muted-foreground"
                            )}
                          >
                            {r}s
                          </button>
                        ))}
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      value={regList}
                      onChange={(e) => setRegList(e.target.value)}
                      placeholder="e.g. @chidi_unilag, @amina_cs, student1@school.edu.ng, student2@school.edu.ng"
                      className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-600"
                      required
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                          Assign Study Level / Grade
                        </label>
                        <Input
                          value={regLevel}
                          onChange={(e) => setRegLevel(e.target.value)}
                          placeholder="e.g. 200L or SS3"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                          Department / Class Stream
                        </label>
                        <Input
                          value={regDept}
                          onChange={(e) => setRegDept(e.target.value)}
                          placeholder="e.g. Computer Science or Science"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowRegisterPanel(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          isLoading={registering}
                          className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
                        >
                          Sponsor & Add to School
                        </Button>
                      </div>
                    </div>
                  </form>
                )}

                {/* School-Wide Principal KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <div className="p-3.5 rounded-xl bg-card border border-border">
                    <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-brand-600" /> Sponsored Student Seats
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-xl font-black text-foreground">
                        {mySchool.enrolledCount} / {mySchool.seatLimit}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        ({mySchool.teacherCount} teacher{mySchool.teacherCount === 1 ? "" : "s"})
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-card border border-border">
                    <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Avg School Exam Readiness
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-xl font-black text-emerald-600">{mySchool.avgReadiness}%</span>
                      <span className="text-[11px] text-emerald-600 font-semibold">across all classes</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-card border border-border">
                    <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-brand-600" /> Total Study Time Logged
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-xl font-black text-foreground">
                        {formatNumber(mySchool.totalStudyMinutes)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">active minutes</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-card border border-border">
                    <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Students Needing Support
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span
                        className={cn(
                          "text-xl font-black",
                          mySchool.atRiskCount > 0 ? "text-amber-600" : "text-emerald-600"
                        )}
                      >
                        {mySchool.atRiskCount}
                      </span>
                      <span className="text-[11px] text-muted-foreground">&lt;55% readiness</span>
                    </div>
                  </div>
                </div>

                {/* Physical Lecture Hall Check-In Code & Faculty/Department Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-1">
                  <div className="p-3.5 rounded-xl border border-brand-500/30 bg-brand-500/5 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600 flex items-center gap-1">
                        <QrCode className="h-3 w-3" /> Physical Hall Live Check-In Code
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Project in lecture hall (rotates every 60s)
                      </p>
                    </div>
                    <span className="font-mono text-base sm:text-lg font-black px-3 py-1 rounded-xl bg-card border border-brand-500/40 text-brand-600 shrink-0">
                      {hallPin}
                    </span>
                  </div>

                  <div className="lg:col-span-2 p-3.5 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <Layers className="h-4 w-4 text-brand-600 shrink-0" />
                      <span>Departmental Breakdown:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(
                        mySchool.roster.reduce((map, r) => {
                          const d = r.department || "General";
                          const cur = map.get(d) || { count: 0, sum: 0 };
                          cur.count += 1;
                          cur.sum += r.predictedReadiness;
                          map.set(d, cur);
                          return map;
                        }, new Map<string, { count: number; sum: number }>())
                      )
                        .slice(0, 4)
                        .map(([deptName, info]) => (
                          <span
                            key={deptName}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 font-semibold text-foreground"
                          >
                            {deptName}: {info.count} ({Math.round(info.sum / Math.max(1, info.count))}% ready)
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Cross-Class Student Progress Roster (Principal & Teacher View) */}
              <Card className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-brand-600" />
                      Cross-Class Student Progress & Learning Telemetry Roster
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Principals, HODs, and teachers can monitor every student&apos;s exam readiness, learning style cohort, study time, and weak topics across all classes.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => window.print()}
                      className="h-8 text-xs font-semibold"
                    >
                      <Printer className="mr-1.5 h-3.5 w-3.5 text-brand-600" /> Print Transcript
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={exportRosterCsv}
                      className="h-8 text-xs font-semibold"
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5 text-brand-600" /> Export CSV Report
                    </Button>
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search student or dept..."
                        className="h-8 pl-8 text-xs w-48"
                      />
                    </div>
                    <div className="inline-flex rounded-lg border border-border p-0.5 bg-slate-100 dark:bg-slate-900">
                      {[
                        { id: "all", label: `All (${mySchool.roster.length})` },
                        { id: "at_risk", label: `Needs Help (${mySchool.atRiskCount})` },
                        { id: "teachers", label: `Teachers (${mySchool.teacherCount})` },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setRosterFilter(tab.id as "all" | "at_risk" | "teachers")}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[11px] font-bold transition",
                            rosterFilter === tab.id ? "bg-brand-600 text-white" : "text-muted-foreground"
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2.5 pr-3 font-bold">Student / Member</th>
                        <th className="py-2.5 px-2 font-bold">Level & Dept</th>
                        <th className="py-2.5 px-2 font-bold">FYP Learning Cohort</th>
                        <th className="py-2.5 px-2 font-bold">Weak Topics Detected</th>
                        <th className="py-2.5 px-2 font-bold text-center">Activity</th>
                        <th className="py-2.5 px-2 font-bold text-right">Exam Readiness</th>
                        <th className="py-2.5 pl-2 font-bold text-right">Parent / Sponsor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredRoster.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-muted-foreground">
                            No members match that filter yet.
                          </td>
                        </tr>
                      ) : (
                        filteredRoster.map((r) => (
                          <tr key={r.uid} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                            <td className="py-3 pr-3">
                              <div className="font-bold text-foreground flex items-center gap-1.5">
                                <span>{r.displayName}</span>
                                {r.role !== "student" && (
                                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-600 font-extrabold">
                                    {r.role}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {r.username ? `@${r.username}` : ""}
                                {r.email ? ` • ${r.email}` : ""}
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <span className="font-semibold text-foreground">{r.level}</span>
                              <span className="block text-[11px] text-muted-foreground truncate max-w-[160px]">
                                {r.department}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-300 font-semibold text-[11px]">
                                <Sparkles className="h-3 w-3 shrink-0" /> {r.cohortLabel}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              {r.weakTopics.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {r.weakTopics.map((wt) => (
                                    <span
                                      key={wt}
                                      className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-semibold"
                                    >
                                      {wt}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[11px] text-emerald-600 font-medium">On track</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <span className="font-bold text-foreground">{formatNumber(r.xp)} XP</span>
                              <span className="block text-[11px] text-muted-foreground">
                                {r.totalQuestionsAttempted} Qs • {r.totalStudyMinutes}m
                                {r.streakDays > 0 ? ` • ${r.streakDays}d streak` : ""}
                              </span>
                            </td>
                            <td className="py-3 pl-2 text-right">
                              <div className="inline-flex flex-col items-end gap-1 w-28">
                                <span
                                  className={cn(
                                    "font-extrabold text-xs",
                                    r.predictedReadiness >= 70
                                      ? "text-emerald-600"
                                      : r.predictedReadiness >= 55
                                      ? "text-brand-600"
                                      : "text-rose-600"
                                  )}
                                >
                                  {r.predictedReadiness}% (+{r.weeklyGain}%/wk)
                                </span>
                                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      r.predictedReadiness >= 70
                                        ? "bg-emerald-500"
                                        : r.predictedReadiness >= 55
                                        ? "bg-brand-500"
                                        : "bg-rose-500"
                                    )}
                                    style={{ width: `${Math.min(100, Math.max(10, r.predictedReadiness))}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-3 pl-2 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => sendParentWhatsAppReport(r)}
                                className="h-7 px-2.5 text-[11px] font-semibold text-emerald-600"
                                title="Send WhatsApp Progress Report to Parent or Sponsor"
                              >
                                <Share2 className="mr-1 h-3 w-3" /> WhatsApp Report
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ) : (
            <Card className="p-8 text-center space-y-3">
              <Building2 className="h-10 w-10 text-brand-600 mx-auto" />
              <h3 className="text-lg font-extrabold">Launch a School or University Department Account</h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
                Are you pitching a Secondary School Principal, University Dean, or Head of Department? Create a School Account in 10 seconds to get a unique school invite code, sponsor student accounts in bulk, and track student progress across every class.
              </p>
              <div className="pt-2">
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
                >
                  <Building2 className="mr-1.5 h-4 w-4" /> Create School Account (14-Day Pilot)
                </Button>
              </div>
            </Card>
          )}

          {/* Platform Admin B2B School License Control (Only visible to Platform Admin) */}
          {user?.role === "admin" && allSchools.length > 0 && (
            <Card className="p-5 space-y-3 border border-amber-500/35">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-amber-500" />
                    Founder / Platform Admin: B2B School Accounts ({allSchools.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    When a school pays their semester invoice after your pitch, click &ldquo;Activate 250-Seat Semester&rdquo; to unlock 135 days for all their students.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {allSchools.map((sch) => (
                  <div
                    key={sch.id}
                    className="p-3.5 rounded-xl border border-border bg-card flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => void loadData(sch.id)}
                        className="text-xs font-bold text-foreground hover:underline text-left truncate block"
                      >
                        {sch.name}
                      </button>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        Code: {sch.inviteCode} • {sch.studentCount}/{sch.seatLimit} seats
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={grantingSchoolId === sch.id}
                      onClick={() => void handleAdminGrantSemester(sch.id, Math.max(250, sch.seatLimit))}
                      className="h-8 text-xs font-bold text-emerald-600 shrink-0"
                    >
                      Activate 250-Seat Semester
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* TAB 2: PAN-AFRICAN INTER-UNIVERSITY & INTER-SCHOOL CHAMPIONSHIP CUP */}
      {activeTab === "inter_uni" && (
        <Card className="p-5 space-y-4 border-2 border-amber-500/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <Crown className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-foreground">
                  Pan-African Inter-University & Inter-School Championship Cup
                </h2>
                <p className="text-xs text-muted-foreground">
                  Every past question solved, quiz sprint won, and 3D circuit built earns XP for your university or school!
                </p>
              </div>
            </div>
            <Link href="/challenges">
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold">
                <Flame className="mr-1.5 h-3.5 w-3.5" /> Enter Live Battles
              </Button>
            </Link>
          </div>

          {standings.length === 0 ? (
            <p className="text-center py-8 text-xs text-muted-foreground">
              No campus standings yet. Set your institution in your profile to put your school on the leaderboard!
            </p>
          ) : (
            <div className="space-y-2.5">
              {standings.map((st) => {
                const isMyCampus =
                  user?.institution && user.institution.toLowerCase() === st.institution.toLowerCase();
                return (
                  <div
                    key={st.institution}
                    className={cn(
                      "p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition",
                      isMyCampus
                        ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500"
                        : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cn(
                          "h-8 w-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0",
                          st.rank === 1
                            ? "bg-amber-500 text-slate-950"
                            : st.rank === 2
                            ? "bg-slate-300 dark:bg-slate-700 text-foreground"
                            : st.rank === 3
                            ? "bg-amber-700/80 text-white"
                            : "bg-slate-100 dark:bg-slate-800 text-muted-foreground"
                        )}
                      >
                        #{st.rank}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-extrabold text-foreground truncate flex items-center gap-1.5">
                          <span>{st.institution}</span>
                          {isMyCampus && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-600 text-white font-bold">
                              Your Campus
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {st.studentCount} active scholar{st.studentCount === 1 ? "" : "s"} • Avg Readiness:{" "}
                          <strong className="text-emerald-600">{st.avgReadiness}%</strong> • MVP:{" "}
                          <strong>{st.topScholarName}</strong> ({formatNumber(st.topScholarXp)} XP)
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm sm:text-base font-black text-amber-600 dark:text-amber-400">
                        {formatNumber(st.totalXp)} XP
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {formatNumber(st.avgXp)} XP / student
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Create School Account Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand-600 text-white">
                B2B School & Principal Onboarding
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-foreground mt-1">
                Create a School / Departmental Account
              </h3>
              <p className="text-xs text-muted-foreground">
                Includes an instant 14-day pilot license, unique invite code, bulk student sponsorship, and Principal analytics.
              </p>
            </div>

            <form onSubmit={handleCreateSchool} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  School or University Name *
                </label>
                <Input
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. King's College Lagos or UNILAG Engineering"
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Institution Type</label>
                  <select
                    value={schoolKind}
                    onChange={(e) =>
                      setSchoolKind(
                        e.target.value as "primary" | "secondary" | "university" | "polytechnic" | "college" | "academy"
                      )
                    }
                    className="w-full h-9 px-2.5 text-xs rounded-lg border border-border bg-card text-foreground"
                  >
                    <option value="primary">Primary / Elementary School</option>
                    <option value="secondary">Secondary / High School</option>
                    <option value="university">University / Faculty</option>
                    <option value="polytechnic">Polytechnic / Monotechnic</option>
                    <option value="college">College of Education</option>
                    <option value="academy">Academy / Tutorial Center</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Target Seats</label>
                  <Input
                    type="number"
                    min={10}
                    max={10000}
                    value={schoolSeats}
                    onChange={(e) => setSchoolSeats(Math.max(10, Number(e.target.value) || 50))}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Department / Faculty / Arm (Optional)
                </label>
                <Input
                  value={schoolDept}
                  onChange={(e) => setSchoolDept(e.target.value)}
                  placeholder="e.g. Faculty of Science or SS1–SS3 STEM"
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  isLoading={creatingSchool}
                  className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
                >
                  Launch School Portal
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
