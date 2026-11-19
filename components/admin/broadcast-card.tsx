"use client";

import React, { useState, useEffect } from "react";
import { Megaphone, Send, Users, Filter, School, GraduationCap, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sprout, type BotPose } from "@/components/bot/sprout";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const QUICK_LEVELS = [
  "",
  "Primary 1",
  "Primary 2",
  "Primary 3",
  "Primary 4",
  "Primary 5",
  "Primary 6",
  "JSS 1",
  "JSS 2",
  "JSS 3",
  "SS 1",
  "SS 2",
  "SS 3",
  "100L",
  "200L",
  "300L",
  "400L",
  "500L",
  "Postgraduate",
];

const QUICK_INTERESTS = [
  { id: "", label: "Any Interest" },
  { id: "past_questions", label: "Past Questions & Exam Drills" },
  { id: "programming", label: "Programming & Hackathons" },
  { id: "circuits", label: "3D Circuits & Robotics" },
  { id: "math", label: "Mathematics & Calculus" },
  { id: "sciences", label: "Sciences & Chemistry" },
  { id: "business", label: "Business & Economics" },
];

const MOOD_OPTIONS: { id: "idle" | "wave" | "jump" | "dance" | "think" | "search"; label: string }[] = [
  { id: "jump", label: "Excited (Jump)" },
  { id: "wave", label: "Friendly (Wave)" },
  { id: "dance", label: "Celebration (Dance)" },
  { id: "search", label: "Discovery (Search)" },
  { id: "think", label: "Study Alert (Think)" },
];

export function AdminBroadcastCard() {
  const { toast } = useToast();

  const [target, setTarget] = useState<"all" | "selective">("selective");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("/events");
  const [sproutMood, setSproutMood] = useState<"idle" | "wave" | "jump" | "dance" | "think" | "search">("jump");

  // Selective filters
  const [institution, setInstitution] = useState("");
  const [registeredSchools, setRegisteredSchools] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState("");
  const [interest, setInterest] = useState("");

  useEffect(() => {
    fetch("/api/schools?mode=directory")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.data?.registeredSchools)) {
          setRegisteredSchools(j.data.registeredSchools);
        }
      })
      .catch(() => null);
  }, []);

  const [sending, setSending] = useState(false);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          href: href.trim() || "/dashboard",
          sproutMood,
          target,
          filters:
            target === "selective"
              ? {
                  institution: institution.trim() || undefined,
                  department: department.trim() || undefined,
                  level: level.trim() || undefined,
                  interest: interest.trim() || undefined,
                }
              : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        toast({
          title: "Broadcast failed",
          description: j?.error?.message || "Could not send notifications",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Broadcast Delivered",
        description: j.data?.message || `Delivered to ${j.data?.deliveredCount ?? 0} students.`,
        variant: "success",
      });
      // Trigger heads-up preview notification immediately on dispatch
      window.dispatchEvent(
        new CustomEvent("sunroot:show-notice", {
          detail: {
            id: "broadcast_" + Date.now(),
            title: title.trim(),
            body: body.trim(),
            href: href.trim() || "/dashboard",
            sproutMood,
          },
        })
      );
      setTitle("");
      setBody("");
    } catch {
      toast({ title: "Network error", description: "Failed to reach broadcast endpoint", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-6 space-y-5 border border-brand-500/25">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-500/10 text-brand-600 flex items-center justify-center shrink-0">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
              Targeted Campus & Hackathon Broadcast Dispatcher
            </h3>
            <p className="text-xs text-muted-foreground">
              Push real-time Sprout notifications to all students or filter by University (e.g. FUTO, UNILAG), Level (e.g. 100L), Department, or Interest.
            </p>
          </div>
        </div>

        {/* Target Audience Toggle */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setTarget("selective")}
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5",
              target === "selective"
                ? "bg-brand-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Filter className="h-3.5 w-3.5" /> Selective Cohort
          </button>
          <button
            type="button"
            onClick={() => setTarget("all")}
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5",
              target === "all" ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" /> All Users
          </button>
        </div>
      </div>

      <form onSubmit={handleDispatch} className="space-y-4">
        {/* Selective Filters */}
        {target === "selective" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-border">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                <School className="h-3 w-3 text-brand-600" /> Registered School / Campus
              </label>
              <Input
                list="registered-schools-list"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="All Schools (or type/pick school)"
                className="h-9 text-xs"
              />
              <datalist id="registered-schools-list">
                {registeredSchools.map((sch) => (
                  <option key={sch.id} value={sch.name}>
                    {sch.name} ({sch.kind})
                  </option>
                ))}
              </datalist>
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                <GraduationCap className="h-3 w-3 text-brand-600" /> Study Level
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full h-9 px-2.5 text-xs rounded-lg border border-border bg-card text-foreground"
              >
                <option value="">All Levels (100L–500L)</option>
                {QUICK_LEVELS.filter(Boolean).map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground block mb-1">Department</label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Computer Science"
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                <Sparkles className="h-3 w-3 text-amber-500" /> Interest / Challenge Match
              </label>
              <select
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                className="w-full h-9 px-2.5 text-xs rounded-lg border border-border bg-card text-foreground"
              >
                {QUICK_INTERESTS.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Message Content & Sprout Preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Alert Headline</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. FUTO & UNILAG AI Hackathon Registration Open!"
                  required
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Destination Link</label>
                <Input
                  value={href}
                  onChange={(e) => setHref(e.target.value)}
                  placeholder="/events or /classes"
                  className="text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Notification Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                required
                placeholder="Write the message students will see in their notification bell..."
                className="w-full rounded-xl border border-border bg-background p-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          {/* Live Sprout Mood Preview */}
          <div className="rounded-xl border border-border bg-slate-50 dark:bg-slate-900/50 p-4 flex flex-col justify-between space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Sprout Mood Pose</label>
              <select
                value={sproutMood}
                onChange={(e) =>
                  setSproutMood(e.target.value as "idle" | "wave" | "jump" | "dance" | "think" | "search")
                }
                className="w-full h-8 px-2 text-xs rounded-lg border border-border bg-card text-foreground"
              >
                {MOOD_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-card border border-border">
              <div className="relative w-10 h-12 shrink-0 flex items-center justify-center">
                <Sprout pose={sproutMood as BotPose} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{title || "Preview Headline"}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {body || "Your targeted student alert will appear here with Sprout."}
                </p>
              </div>
            </div>

            <Button
              type="submit"
              size="sm"
              isLoading={sending}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> Send Targeted Alert
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
