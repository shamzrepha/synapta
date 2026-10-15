"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/lib/store/use-user-store";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Compass,
  Search,
  Plus,
  Users,
  Lock,
  Globe,
  BookOpen,
  CheckCircle2,
  Clock,
  Sparkles,
  X,
  Headphones,
} from "lucide-react";
import { asArray } from "@/lib/api/client";
import { ClassroomPlanView, outlineToText, type ClassroomPlan } from "@/components/teacher/classroom-plan";

interface ClassItem {
  id: string;
  title: string;
  subject: string;
  description: string;
  teacherId: string;
  teacherName: string;
  visibility: "public" | "private";
  studentCount: number;
  status: "draft" | "published";
  joinCode?: string;
  userEnrollmentStatus?: "active" | "pending" | "rejected" | "none";
  isOwner?: boolean;
}

export default function ExplorePage() {
  const { user } = useUserStore();
  const { toast } = useToast();
  const router = useRouter();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"explore" | "mine">("explore");

  // Create class wizard state (A4.1)
  const [isModalOpen, setIsModalOpen] = useState(false);

  // /explore?create=1 (from "Create class" buttons elsewhere) opens the wizard directly
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const openCreate = params.has("create");
    if (!q && !openCreate) return;
    const t = setTimeout(() => {
      if (q) setSearch(q);
      if (openCreate) setIsModalOpen(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [createTitle, setCreateTitle] = useState("");
  const [createSubject, setCreateSubject] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createLevel, setCreateLevel] = useState<"school" | "undergrad" | "professional">("undergrad");
  const [createWeeks, setCreateWeeks] = useState(4);
  const [createAudienceTags, setCreateAudienceTags] = useState<string[]>([]);
  const [seedText, setSeedText] = useState("");
  const [buildWithAi, setBuildWithAi] = useState(true);
  const [audioLessons, setAudioLessons] = useState(true);
  const [narratorVoice, setNarratorVoice] = useState<"female" | "male">("female");
  const [plan, setPlan] = useState<ClassroomPlan | null>(null);
  const [recommending, setRecommending] = useState(false);
  const [createVisibility, setCreateVisibility] = useState<"public" | "private">("public");
  const [isCreating, setIsCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch(`/api/classes?scope=${activeTab}`);
        const data = await res.json();
        if (!ignore && data.ok) {
          setClasses(asArray<ClassItem>(data.data));
        } else if (!ignore) {
          setClasses([]);
        }
      } catch {
        if (!ignore) {
          setClasses([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [activeTab]);

  const handleJoinClass = async (classItem: ClassItem) => {
    setJoiningId(classItem.id);
    try {
      const res = await fetch(`/api/classes/${classItem.id}/join`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.ok) {
        const newStatus = data.data.status;
        toast({
          title: newStatus === "active" ? "Enrolled Successfully!" : "Join Request Sent",
          description: data.data.message || (newStatus === "active" ? "You have access to this course." : "Waiting for teacher approval."),
          variant: newStatus === "active" ? "success" : "amber",
        });

        // Update local state
        setClasses((prev) =>
          prev.map((c) =>
            c.id === classItem.id
              ? {
                  ...c,
                  userEnrollmentStatus: newStatus,
                  studentCount: newStatus === "active" ? c.studentCount + 1 : c.studentCount,
                }
              : c
          )
        );
      } else {
        toast({
          title: "Join Error",
          description: data.error?.message || "Failed to join class.",
          variant: "destructive",
        });
      }
    } catch {
      // Local demo mode
      const newStatus = classItem.visibility === "public" ? "active" : "pending";
      toast({
        title: newStatus === "active" ? "Enrolled Successfully!" : "Join Request Sent",
        description: newStatus === "active" ? "Enrolled in class!" : "Join request submitted to teacher.",
        variant: newStatus === "active" ? "success" : "amber",
      });
      setClasses((prev) =>
        prev.map((c) =>
          c.id === classItem.id ? { ...c, userEnrollmentStatus: newStatus } : c
        )
      );
    } finally {
      setJoiningId(null);
    }
  };

  const getRecommendations = async () => {
    if (!createTitle || !createSubject) {
      toast({ title: "Add a title and subject first", variant: "destructive" });
      return;
    }
    setRecommending(true);
    try {
      const res = await fetch("/api/classes/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle,
          subject: createSubject,
          description: createDescription,
          level: createLevel,
          durationWeeks: createWeeks,
          seedText: seedText || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) setPlan(data.data);
      else toast({ title: "Couldn't get recommendations", description: data.error?.message, variant: "destructive" });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setRecommending(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle || !createSubject || !createDescription) return;

    setIsCreating(true);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle,
          subject: createSubject,
          description: createDescription,
          level: createLevel,
          durationWeeks: createWeeks,
          audienceTags: createAudienceTags,
          visibility: createVisibility,
          status: buildWithAi ? "draft" : "published",
          buildState: buildWithAi ? "drafting" : "empty",
          audioLessons,
          narratorVoice,
          ...(plan ? { recommendedPlan: plan } : {}),
        }),
      });
      const data = await res.json();

      if (data.ok && data.data) {
        const createdClass = data.data.class || data.data;

        toast({
          title: "Class created!",
          description: buildWithAi
            ? "Your AI co-teacher is drafting the curriculum — watch it build live."
            : `"${createdClass.title}" is published and ready for students.`,
          variant: "success",
        });

        if (buildWithAi) {
          // Trigger asynchronous AI Co-Teacher build
          fetch(`/api/classes/${createdClass.id}/build`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: createTitle,
              subject: createSubject,
              description: createDescription,
              level: createLevel,
              durationWeeks: createWeeks,
              audienceTags: createAudienceTags,
              seedMaterialText: seedText,
            }),
          }).catch((err) => console.error("Background build trigger error:", err));
        }

        setIsModalOpen(false);
        setCreateTitle("");
        setCreateSubject("");
        setCreateDescription("");
        setSeedText("");
        setWizardStep(1);
        setClasses((prev) => [{ ...createdClass, isOwner: true, userEnrollmentStatus: "none" }, ...prev]);
        // Take the teacher straight to the new class so they can follow the build and publish
        router.push(`/classes/${createdClass.id}`);
      } else {
        toast({
          title: "Creation Error",
          description: data.error?.message || "Failed to create class.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Creation Error",
        description: "Network error creating class.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const subjects = Array.from(new Set(asArray(classes).map((c) => c.subject).filter(Boolean)));

  const filtered = asArray(classes).filter((c) => {
    const matchesSearch =
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.subject.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    const matchesSubject = selectedSubject === "all" || c.subject === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Compass className="h-7 w-7 text-teal-600 dark:text-teal-400" />
            Explore Courses & Labs
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Browse public classes or manage your enrolled learning tracks.
          </p>
        </div>

        {/* Teacher / Admin Action Button */}
        {(user?.role === "teacher" || user?.role === "admin") && (
          <Button onClick={() => setIsModalOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Class
          </Button>
        )}
      </div>

      {/* Tabs and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("explore")}
            className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-colors ${
              activeTab === "explore"
                ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
            }`}
          >
            All Courses ({classes.length})
          </button>
          <button
            onClick={() => setActiveTab("mine")}
            className={`px-4 py-2 text-xs md:text-sm font-semibold rounded-xl transition-colors ${
              activeTab === "mine"
                ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
            }`}
          >
            {user?.role === "teacher" ? "My Created Classes" : "My Enrolled Classes"}
          </button>
        </div>

        {/* Search & Subject Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              placeholder="Filter by title or topic..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Classes Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-6 w-3/4 mb-3" />
              <Skeleton className="h-4 w-1/2 mb-4" />
              <Skeleton className="h-16 w-full mb-4" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border rounded-2xl border-dashed border-slate-300 dark:border-slate-800 space-y-3">
          <BookOpen className="h-10 w-10 text-slate-400 mx-auto" />
          <h2 className="text-lg font-bold">No classes match your filter</h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search query or subject filter, or create a new class.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((item) => (
            <Card
              key={item.id}
              className="flex flex-col border-slate-200 dark:border-slate-800 hover:border-teal-500/40 transition-all shadow-sm"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                    {item.subject}
                  </Badge>
                  <div className="flex items-center gap-1.5">
                    {item.visibility === "private" ? (
                      <Badge variant="amber" className="text-[10px] flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Private
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                        <Globe className="h-3 w-3" /> Public
                      </Badge>
                    )}
                  </div>
                </div>
                <CardTitle className="text-base font-bold line-clamp-1">{item.title}</CardTitle>
                <CardDescription className="text-xs">
                  Instructor: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.teacherName}</span>
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 pb-4">
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                  {item.description}
                </p>
                <div className="mt-4 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {item.studentCount} students
                  </span>
                </div>
              </CardContent>

              <CardFooter className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
                <Link href={`/classes/${item.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    View Syllabus
                  </Button>
                </Link>

                {item.userEnrollmentStatus === "active" ? (
                  <Link href={`/classes/${item.id}`}>
                    <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Enrolled
                    </Button>
                  </Link>
                ) : item.userEnrollmentStatus === "pending" ? (
                  <Button size="sm" variant="amber" disabled className="text-xs">
                    <Clock className="h-3.5 w-3.5 mr-1" /> Pending
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={() => handleJoinClass(item)}
                    isLoading={joiningId === item.id}
                  >
                    {item.visibility === "private" ? "Request Access" : "Join Class"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create Class Multi-Step Wizard (A4.1) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <h3 className="font-bold text-lg">AI Co-Teacher: Create Class</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Stepper indicator */}
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 pb-2">
              <span className={wizardStep === 1 ? "text-teal-600 font-bold" : ""}>1. Basics</span>
              <span>→</span>
              <span className={wizardStep === 2 ? "text-teal-600 font-bold" : ""}>2. Seed Material</span>
              <span>→</span>
              <span className={wizardStep === 3 ? "text-teal-600 font-bold" : ""}>3. AI Build</span>
            </div>

            <form onSubmit={handleCreateClass} className="space-y-4">
              {wizardStep === 1 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Class Title *
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Linear Control Systems & State-Space"
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Subject Category *
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Electrical Engineering, Robotics"
                      value={createSubject}
                      onChange={(e) => setCreateSubject(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      What should students be able to do after this class? *
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Model dynamical systems, design PID controllers, and evaluate closed-loop stability using Bode and Nyquist plots."
                      value={createDescription}
                      onChange={(e) => setCreateDescription(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Level</label>
                      <select
                        value={createLevel}
                        onChange={(e) => setCreateLevel(e.target.value as "school" | "undergrad" | "professional")}
                        className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="school">School / K-12</option>
                        <option value="undergrad">Undergraduate</option>
                        <option value="professional">Professional / Mastery</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Duration (Weeks)</label>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        value={createWeeks}
                        onChange={(e) => setCreateWeeks(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Audience Adaptation Tags
                    </label>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {[
                        { id: "engineering_rigor", label: "Engineers (Rigorous)" },
                        { id: "kids", label: "Kids (Teach-The-Bot)" },
                        { id: "adhd_friendly", label: "ADHD-Friendly (Micro-Steps)" },
                        { id: "literal_mode", label: "Literal (Autism-Friendly)" },
                      ].map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            setCreateAudienceTags((prev) =>
                              prev.includes(tag.id) ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg border transition-all ${
                            createAudienceTags.includes(tag.id)
                              ? "border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300 font-semibold"
                              : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {tag.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="button"
                      disabled={!createTitle || !createSubject || !createDescription}
                      onClick={() => setWizardStep(2)}
                    >
                      Next: Seed Material →
                    </Button>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Course Outline / Syllabus Notes (Outline-First Mode)
                      </label>
                      <label className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold cursor-pointer hover:underline">
                        Upload outline file
                        <input
                          type="file"
                          accept=".txt,.md,.json,.csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const text = ev.target?.result;
                                if (typeof text === "string") setSeedText(text);
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                      </label>
                    </div>

                    <textarea
                      rows={6}
                      placeholder={`1. Introduction to Feedback Control\n2. Frequency Domain Analysis & Transfer Functions\n3. Stability Criteria & Root Locus\n4. PID Controller Design & Tuning`}
                      value={seedText}
                      onChange={(e) => setSeedText(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 font-mono"
                    />

                    {seedText.trim().length > 0 && (
                      <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-between text-xs">
                        <span className="font-semibold text-teal-800 dark:text-teal-200">
                          ✓ Outline-First Mapping: Detected {seedText.split("\n").filter((l) => l.trim().length >= 3).length} curriculum headings.
                        </span>
                        <span className="text-[10px] text-slate-500">Mapped 1:1 to modules/KCs</span>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">Not sure what to build?</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                          The AI reads your description and any outline or notes above, then recommends topics, simulations, quiz sprints and more.
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={getRecommendations} isLoading={recommending}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> {plan ? "Refresh ideas" : "Get AI recommendations"}
                      </Button>
                    </div>
                    {plan && (
                      <>
                        <div className="max-h-[45vh] overflow-y-auto pr-1">
                          <ClassroomPlanView plan={plan} compact />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const outline = outlineToText(plan);
                            setSeedText((prev) => (prev.trim() ? `${outline}\n\n${prev}` : outline));
                          }}
                        >
                          Use this outline
                        </Button>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Button type="button" variant="ghost" onClick={() => setWizardStep(1)}>
                      ← Back
                    </Button>
                    <Button type="button" onClick={() => setWizardStep(3)}>
                      Next: AI Build →
                    </Button>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-teal-500/30 bg-teal-500/10 space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                      <span className="text-xs font-bold text-teal-900 dark:text-teal-100">
                        Autonomous AI Co-Teacher
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Sunroot drafts your topics, their order and learning objectives in under a minute. Full lessons, quizzes, flashcards and an interactive simulation are generated for each topic the first time it&apos;s opened. Nothing is visible to students until you click <strong>Publish</strong>.
                    </p>
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={buildWithAi}
                        onChange={(e) => setBuildWithAi(e.target.checked)}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      <span>Build my class with AI automatically</span>
                    </label>
                  </div>

                  <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/5 space-y-2">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span>
                        <span className="flex items-center gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-100">
                          <Headphones className="h-4 w-4" /> Audio lessons
                        </span>
                        <span className="block text-[11px] text-slate-600 dark:text-slate-400">
                          Every topic gets a narrated teacher–student conversation students can listen to (free neural voices, recorded once per topic).
                        </span>
                      </span>
                      <input type="checkbox" checked={audioLessons} onChange={(e) => setAudioLessons(e.target.checked)} className="h-4 w-4 rounded text-purple-600" />
                    </label>
                    {audioLessons && (
                      <div className="flex gap-2">
                        {(["female", "male"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setNarratorVoice(v)}
                            className={`flex-1 p-2 rounded-lg border text-[11px] font-semibold ${
                              narratorVoice === v
                                ? "border-purple-500 bg-purple-500/10 text-purple-900 dark:text-purple-200"
                                : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {v === "female" ? "Lead voice: Ms. Nova (female)" : "Lead voice: Mr. Ade (male)"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Access Visibility
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCreateVisibility("public")}
                        className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 ${
                          createVisibility === "public"
                            ? "border-teal-500 bg-teal-500/10 text-teal-900 dark:text-teal-200 ring-2 ring-teal-500/30"
                            : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        <Globe className="h-4 w-4" /> Public (Instant Join)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateVisibility("private")}
                        className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 ${
                          createVisibility === "private"
                            ? "border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/30"
                            : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        <Lock className="h-4 w-4" /> Private (Approval Required)
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                    <Button type="button" variant="ghost" onClick={() => setWizardStep(2)}>
                      ← Back
                    </Button>
                    <Button type="submit" isLoading={isCreating}>
                      Create Class & Launch Studio
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
