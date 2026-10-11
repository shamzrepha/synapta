"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  DollarSign,
  Zap,
  Filter,
  Check,
  X,
  Edit,
  Plus,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { REPRESENTATIONS, Representation, REPRESENTATION_METADATA } from "@/lib/teacher/representations";

interface ContentItem {
  hash: string;
  kcId: string;
  kcTitle?: string;
  kind: "explanation" | "quiz" | "flashcards" | "worked_example";
  representation?: string;
  level: string;
  content: unknown;
  status: "draft" | "approved" | "rejected";
  qualityReport?: {
    score: number;
    passed: boolean;
    issues: string[];
  };
  cacheHits: number;
  version: number;
  createdAt: string | null;
}

interface Metrics {
  totalItems: number;
  approvedItems: number;
  draftItems: number;
  totalCacheHits: number;
  estimatedTokensSaved: number;
  estimatedCostSavedUsd: string;
}

interface KCItem {
  id: string;
  title: string;
}

export default function TeacherContentStudioPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = use(params);
  const { toast } = useToast();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [kcs, setKcs] = useState<KCItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "approved" | "rejected">("all");
  const [selectedKcId, setSelectedKcId] = useState<string>("all");

  // Generate Modal
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [genKcId, setGenKcId] = useState("");
  const [genKind, setGenKind] = useState<"explanation" | "quiz" | "flashcards" | "worked_example">("explanation");
  const [genRepresentation, setGenRepresentation] = useState<Representation>("worked_example");
  const [genLevel, setGenLevel] = useState<"beginner" | "standard" | "advanced">("standard");
  const [generating, setGenerating] = useState(false);

  // Edit Modal
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [reloadTick, setReloadTick] = useState(0);
  const triggerReload = () => setReloadTick((t) => t + 1);

  useEffect(() => {
    let ignore = false;
    async function fetchContent() {
      try {
        const [contentRes, classRes] = await Promise.all([
          fetch(`/api/classes/${classId}/content`),
          fetch(`/api/classes/${classId}`),
        ]);

        const contentJson = await contentRes.json();
        const classJson = await classRes.json();

        if (!ignore) {
          if (contentJson.ok) {
            setItems(contentJson.data.items || []);
            setMetrics(contentJson.data.metrics || null);
          }

          if (classJson.ok && Array.isArray(classJson.data?.kcs)) {
            setKcs(classJson.data.kcs);
            if (classJson.data.kcs.length > 0) {
              setGenKcId((prev) => prev || classJson.data.kcs[0].id);
            }
          }
        }
      } catch {
        if (!ignore) {
          toast({
            title: "Connection Error",
            description: "Failed to load content studio data.",
            variant: "destructive",
          });
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchContent();
    return () => {
      ignore = true;
    };
  }, [classId, reloadTick, toast]);

  const handleUpdateStatus = async (hash: string, newStatus: "approved" | "rejected") => {
    try {
      const res = await fetch(`/api/classes/${classId}/content/${hash}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: newStatus === "approved" ? "Approved!" : "Rejected",
          description: newStatus === "approved" ? "This module is now live and served to all enrolled students." : "Draft rejected.",
          variant: newStatus === "approved" ? "success" : "default",
        });
        triggerReload();
      } else {
        toast({
          title: "Update failed",
          description: json.error?.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Network error updating status.",
        variant: "destructive",
      });
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genKcId) return;

    setGenerating(true);
    try {
      const res = await fetch(`/api/classes/${classId}/kcs/${genKcId}/content/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: genKind,
          representation: genRepresentation,
          level: genLevel,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Module Drafted!",
          description: "New learning module generated and queued for your approval.",
          variant: "success",
        });
        setGenerateModalOpen(false);
        triggerReload();
      } else {
        toast({
          title: "Generation Failed",
          description: json.error?.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to generate module.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSavingEdit(true);
    try {
      let parsedContent: unknown = editText;
      if (editItem.kind === "quiz" || editItem.kind === "flashcards") {
        try {
          parsedContent = JSON.parse(editText);
        } catch {
          toast({
            title: "Invalid JSON",
            description: "Please fix JSON syntax before saving.",
            variant: "destructive",
          });
          setSavingEdit(false);
          return;
        }
      }

      const res = await fetch(`/api/classes/${classId}/content/${editItem.hash}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: parsedContent }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Edits Saved",
          description: "Draft content updated.",
          variant: "success",
        });
        setEditItem(null);
        triggerReload();
      }
    } catch {
      toast({
        title: "Save Failed",
        description: "Could not update content.",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const filteredItems = items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (selectedKcId !== "all" && item.kcId !== selectedKcId) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href={`/classes/${classId}/manage`}
            className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Class Management
          </Link>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Curriculum Content Studio
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Teacher-in-the-loop content generation with automated quality checks and student cache reuse.
          </p>
        </div>

        <Button size="sm" onClick={() => setGenerateModalOpen(true)} className="text-xs">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Draft New Module
        </Button>
      </div>

      {/* Cost Saved & Cache Performance Banner */}
      {metrics && (
        <Card className="border-teal-500/20 bg-teal-500/[0.04]">
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Cache Hits</span>
              <p className="text-xl font-bold text-teal-600 dark:text-teal-400 mt-0.5">
                {metrics.totalCacheHits}
              </p>
              <p className="text-[10px] text-slate-500">Student requests served free</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Estimated Tokens Saved</span>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                {(metrics.estimatedTokensSaved / 1000).toFixed(0)}k
              </p>
              <p className="text-[10px] text-slate-500">Zero Gemini call overhead</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Approved Live Modules</span>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {metrics.approvedItems}
              </p>
              <p className="text-[10px] text-slate-500">Active in student curriculums</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Estimated Savings</span>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                ${metrics.estimatedCostSavedUsd}
              </p>
              <p className="text-[10px] text-slate-500">Cached API cost reduction</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Status:</span>
          {(["all", "draft", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors capitalize",
                statusFilter === s
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {kcs.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Topic:</span>
            <select
              value={selectedKcId}
              onChange={(e) => setSelectedKcId(e.target.value)}
              className="text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5"
            >
              <option value="all">All Topics ({kcs.length})</option>
              {kcs.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Content Items List */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="p-12 text-center text-xs text-slate-400 space-y-3">
          <Sparkles className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-700" />
          <p>No content modules matching current filters.</p>
          <Button size="sm" variant="outline" onClick={() => setGenerateModalOpen(true)}>
            Draft First Learning Module
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => (
            <Card key={item.hash} className="border-slate-200 dark:border-slate-800 p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase font-bold">
                      {item.kind.replace("_", " ")}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {item.level}
                    </Badge>
                    {item.representation && (
                      <Badge variant="secondary" className="text-[10px]">
                        {item.representation.replace("_", " ")}
                      </Badge>
                    )}
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                        item.status === "approved"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : item.status === "rejected"
                          ? "bg-rose-500/10 text-rose-600"
                          : "bg-amber-500/10 text-amber-600"
                      )}
                    >
                      {item.status.toUpperCase()}
                    </span>
                    {item.qualityReport && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        Quality Score: <strong>{item.qualityReport.score}/100</strong>
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1">
                    {item.kcTitle || "Knowledge Component Module"}
                  </h3>

                  <p className="text-xs text-slate-500 line-clamp-2">
                    {typeof item.content === "string"
                      ? item.content.slice(0, 160)
                      : JSON.stringify(item.content).slice(0, 160)}
                    ...
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      setEditItem(item);
                      setEditText(
                        typeof item.content === "string"
                          ? item.content
                          : JSON.stringify(item.content, null, 2)
                      );
                    }}
                  >
                    <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>

                  {item.status !== "approved" && (
                    <Button
                      size="sm"
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleUpdateStatus(item.hash, "approved")}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                  )}

                  {item.status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                      onClick={() => handleUpdateStatus(item.hash, "rejected")}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Generate Module Modal */}
      {generateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-white dark:bg-slate-950 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold">Draft Pedagogical Module</CardTitle>
              <button onClick={() => setGenerateModalOpen(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Knowledge Component
                </label>
                <select
                  value={genKcId}
                  onChange={(e) => setGenKcId(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5"
                  required
                >
                  {kcs.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Content Type
                  </label>
                  <select
                    value={genKind}
                    onChange={(e) => setGenKind(e.target.value as typeof genKind)}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5"
                  >
                    <option value="worked_example">Worked Example</option>
                    <option value="explanation">Lesson Explanation</option>
                    <option value="quiz">Adaptive Quiz</option>
                    <option value="flashcards">Recall Flashcards</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Academic Level
                  </label>
                  <select
                    value={genLevel}
                    onChange={(e) => setGenLevel(e.target.value as typeof genLevel)}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5"
                  >
                    <option value="beginner">Beginner (Foundations)</option>
                    <option value="standard">Standard (Core)</option>
                    <option value="advanced">Advanced (Deep Dive)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Pedagogical Representation Format
                </label>
                <select
                  value={genRepresentation}
                  onChange={(e) => setGenRepresentation(e.target.value as Representation)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5"
                >
                  {REPRESENTATIONS.map((r) => (
                    <option key={r} value={r}>
                      {REPRESENTATION_METADATA[r].label} - {REPRESENTATION_METADATA[r].shortDescription}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGenerateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={generating}>
                  {generating ? "Drafting & Evaluating..." : "Generate Draft"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Edit Content Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl bg-white dark:bg-slate-950 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold">Edit Draft Module</CardTitle>
              <button onClick={() => setEditItem(null)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <CardDescription className="text-xs">
              Make manual teacher corrections or adjustments before publishing live to students.
            </CardDescription>

            <Textarea
              rows={12}
              value={editText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditText(e.target.value)}
              className="font-mono text-xs"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditItem(null)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
