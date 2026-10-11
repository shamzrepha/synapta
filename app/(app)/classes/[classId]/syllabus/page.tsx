"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  ArrowLeft,
  Edit3,
  Trash2,
  X,
  Save,
} from "lucide-react";

interface KCItem {
  id: string;
  order: number;
  title: string;
  description: string;
  lessonMarkdown?: string;
  prerequisiteIds?: string[];
  objectives?: string[];
  bkt?: { pL0: number; pT: number; pG: number; pS: number };
  lab?: { type: string; config?: Record<string, unknown> };
}

export default function SyllabusEditorPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);
  const { toast } = useToast();

  const [kcs, setKcs] = useState<KCItem[]>([]);
  const [classTitle, setClassTitle] = useState("");
  const [loading, setLoading] = useState(true);

  // AI Synthesis modal
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [durationWeeks, setDurationWeeks] = useState(6);
  const [teacherNotes, setTeacherNotes] = useState("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  // Edit KC modal
  const [editingKc, setEditingKc] = useState<KCItem | null>(null);
  const [isSavingKc, setIsSavingKc] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch(`/api/classes/${classId}`);
        const data = await res.json();
        if (!ignore && data.ok) {
          setClassTitle(data.data.class?.title || "Class");
          setKcs(data.data.kcs || []);
        }
      } catch {
        // Fail gracefully without injecting fake mock data
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [classId]);

  const handleSynthesizeSyllabus = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSynthesizing(true);
    try {
      const res = await fetch(`/api/classes/${classId}/syllabus/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeks: durationWeeks,
          teacherNotes,
        }),
      });
      const data = await res.json();

      if (data.ok && Array.isArray(data.data?.kcs)) {
        setKcs(data.data.kcs);
        toast({
          title: "Syllabus Synthesized!",
          description: `Generated ${data.data.kcs.length} Knowledge Components using Gemini.`,
          variant: "success",
        });
        setIsAiModalOpen(false);
      } else {
        toast({
          title: "Synthesis Error",
          description: data.error?.message || "Failed to generate syllabus.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Synthesis Error",
        description: "Network error calling Gemini AI.",
        variant: "destructive",
      });
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSaveKc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKc) return;

    setIsSavingKc(true);
    try {
      const res = await fetch(`/api/classes/${classId}/kcs/${editingKc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingKc),
      });
      const data = await res.json();
      if (data.ok) {
        setKcs((prev) => prev.map((k) => (k.id === editingKc.id ? editingKc : k)));
        toast({ title: "Saved!", description: "Knowledge Component updated.", variant: "success" });
        setEditingKc(null);
      } else {
        toast({
          title: "Save Error",
          description: data.error?.message || "Failed to save KC.",
          variant: "destructive",
        });
      }
    } catch {
      setKcs((prev) => prev.map((k) => (k.id === editingKc.id ? editingKc : k)));
      toast({ title: "Saved!", description: "Updated locally.", variant: "success" });
      setEditingKc(null);
    } finally {
      setIsSavingKc(false);
    }
  };

  const handleDeleteKc = async (kcId: string) => {
    try {
      await fetch(`/api/classes/${classId}/kcs/${kcId}`, { method: "DELETE" });
      setKcs((prev) => prev.filter((k) => k.id !== kcId));
      toast({ title: "Deleted", description: "Knowledge Component removed." });
    } catch {
      setKcs((prev) => prev.filter((k) => k.id !== kcId));
    }
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
      {/* Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link href={`/classes/${classId}`} className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Class Overview
        </Link>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsAiModalOpen(true)} size="sm">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            AI Syllabus Synthesis
          </Button>
        </div>
      </div>

      {/* Header Banner */}
      <Card>
        <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <Badge variant="outline" className="text-xs mb-1">Curriculum Architect</Badge>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
              Syllabus & Knowledge Components: {classTitle}
            </h1>
            <p className="text-xs text-slate-500">
              {kcs.length} Knowledge Components configured in dependency order.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* KCs List */}
      <div className="space-y-3">
        {kcs.map((kc, idx) => (
          <Card key={kc.id} className="border-slate-200 dark:border-slate-800 p-5">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 font-bold text-teal-600 dark:text-teal-400 text-xs">
                  {idx + 1}
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{kc.title}</h3>
                    {kc.lab && kc.lab.type !== "none" && (
                      <Badge variant="amber" className="text-[10px]">
                        Lab: {kc.lab.type}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {kc.description}
                  </p>
                  {kc.objectives && kc.objectives.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {kc.objectives.map((o, i) => (
                        <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">
                          ✓ {o}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setEditingKc(kc)}>
                  <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit KC
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  onClick={() => handleDeleteKc(kc.id)}
                  aria-label="Delete Knowledge Component"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* AI Synthesis Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <h3 className="font-bold text-lg">AI Syllabus Synthesis</h3>
              </div>
              <button onClick={() => setIsAiModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSynthesizeSyllabus} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Duration (Weeks)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={16}
                  value={durationWeeks}
                  onChange={(e) => setDurationWeeks(parseInt(e.target.value) || 6)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Pedagogical Goals & Teacher Notes (Optional)
                </label>
                <textarea
                  rows={4}
                  placeholder="e.g. Focus heavily on practical simulation labs, include intuitive analogies before equations, cover DC circuits then transient RC filters..."
                  value={teacherNotes}
                  onChange={(e) => setTeacherNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" variant="ghost" onClick={() => setIsAiModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSynthesizing}>
                  <Sparkles className="h-4 w-4 mr-1.5" /> Synthesize Curriculum
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit KC Modal */}
      {editingKc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <h3 className="font-bold text-lg">Edit Knowledge Component</h3>
              </div>
              <button onClick={() => setEditingKc(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveKc} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Title</label>
                <Input
                  type="text"
                  value={editingKc.title}
                  onChange={(e) => setEditingKc({ ...editingKc, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Description</label>
                <Input
                  type="text"
                  value={editingKc.description}
                  onChange={(e) => setEditingKc({ ...editingKc, description: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Lesson Content (Markdown with LaTeX)
                </label>
                <textarea
                  rows={8}
                  value={editingKc.lessonMarkdown || ""}
                  onChange={(e) => setEditingKc({ ...editingKc, lessonMarkdown: e.target.value })}
                  className="w-full font-mono text-xs rounded-xl border border-slate-300 bg-white p-3 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">In-Situ Lab Simulation</label>
                  <select
                    value={editingKc.lab?.type || "none"}
                    onChange={(e) =>
                      setEditingKc({
                        ...editingKc,
                        lab: { type: e.target.value, config: editingKc.lab?.config || {} },
                      })
                    }
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="none">No Lab</option>
                    <option value="ohms_law">Ohm&apos;s Law Circuit</option>
                    <option value="rc_filter">RC Low-Pass Filter</option>
                    <option value="logic_gates">Logic Gates & Half Adder</option>
                    <option value="projectile">Kinematic Projectile</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    BKT Learn Probability: pT
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="0.99"
                    value={editingKc.bkt?.pT ?? 0.15}
                    onChange={(e) =>
                      setEditingKc({
                        ...editingKc,
                        bkt: {
                          pL0: editingKc.bkt?.pL0 ?? 0.2,
                          pT: parseFloat(e.target.value) || 0.15,
                          pG: editingKc.bkt?.pG ?? 0.2,
                          pS: editingKc.bkt?.pS ?? 0.1,
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button type="button" variant="ghost" onClick={() => setEditingKc(null)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSavingKc}>
                  <Save className="h-4 w-4 mr-1.5" /> Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
