"use client";

import React, { useEffect, useState } from "react";
import { GitCommit, RotateCcw, Sparkles, GitFork, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { asArray } from "@/lib/api/client";
import { timeAgo, exactTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Commit {
  id: string;
  parentId: string | null;
  authorUid: string;
  authorName: string;
  message: string;
  source: string;
  diff: { lines: string[]; added: number; removed: number; changed: number };
  createdAt: string | null;
}

async function fetchCommits(id: string): Promise<Commit[] | null> {
  try {
    const j = await fetch(`/api/studio/designs/${id}/commits`).then((r) => r.json());
    return j.ok ? asArray<Commit>(j.data.commits) : null;
  } catch {
    return null;
  }
}

const SOURCE_ICON: Record<string, React.ReactNode> = {
  ai: <Sparkles className="h-3.5 w-3.5 text-violet-500" />,
  fork: <GitFork className="h-3.5 w-3.5 text-sky-500" />,
  revert: <RotateCcw className="h-3.5 w-3.5 text-amber-500" />,
};

/**
 * Git-style history: every save with author, message and what changed; preview or restore any
 * version (restoring adds a new version, so nothing is ever lost). Contributor counts on top.
 */
export function HistoryPanel({
  designId,
  headCommitId,
  version,
  canEdit,
  contributors,
  onRestore,
  onPreview,
}: {
  designId: string;
  headCommitId: string;
  version: number;
  canEdit: boolean;
  contributors: Array<{ uid: string; name: string; commits: number }>;
  onRestore: (commitId: string) => Promise<void>;
  onPreview: (commitId: string | null) => void;
}) {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    fetchCommits(designId).then(setCommits);
  }, [designId, version]);

  const total = contributors.reduce((n, c) => n + c.commits, 0) || 1;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold mb-2">Contributors</p>
        <div className="space-y-1.5">
          {contributors.map((c) => (
            <div key={c.uid} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate font-semibold">{c.name}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-teal-500" style={{ width: `${(c.commits / total) * 100}%` }} />
              </div>
              <span className="font-mono w-16 text-right">
                {c.commits} commit{c.commits === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-bold mb-2">History</p>
        {commits === null ? (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        ) : (
          <ol className="relative border-l border-slate-200 dark:border-slate-800 ml-2 space-y-3">
            {commits.map((c) => {
              const isHead = c.id === headCommitId;
              return (
                <li key={c.id} className="ml-4">
                  <span className={cn("absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-950", isHead ? "bg-teal-500" : "bg-slate-300 dark:bg-slate-700")} />
                  <div className="flex items-start gap-1.5">
                    {SOURCE_ICON[c.source] || <GitCommit className="h-3.5 w-3.5 text-slate-400 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold break-words">{c.message}</p>
                      <p className="text-[11px] text-slate-500" title={c.createdAt ? exactTime(c.createdAt) : undefined}>
                        {c.authorName} · {c.createdAt ? timeAgo(c.createdAt) : ""} {isHead && <span className="ml-1 font-bold text-teal-600">CURRENT</span>}
                      </p>
                      <ul className="mt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-0.5">
                        {asArray<string>(c.diff?.lines)
                          .slice(0, 6)
                          .map((l, i) => (
                            <li key={i} className={l.startsWith("+") ? "text-emerald-600" : l.startsWith("-") ? "text-rose-600" : undefined}>
                              {l}
                            </li>
                          ))}
                        {(c.diff?.lines?.length || 0) > 6 && <li>…and {c.diff.lines.length - 6} more</li>}
                      </ul>
                      {!isHead && (
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next = previewing === c.id ? null : c.id;
                              setPreviewing(next);
                              onPreview(next);
                            }}
                            className="flex items-center gap-1 text-[11px] font-semibold text-sky-600"
                          >
                            <Eye className="h-3 w-3" /> {previewing === c.id ? "Stop preview" : "Preview"}
                          </button>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px]"
                              isLoading={busy === c.id}
                              onClick={async () => {
                                setBusy(c.id);
                                try {
                                  await onRestore(c.id);
                                  setPreviewing(null);
                                  onPreview(null);
                                } finally {
                                  setBusy(null);
                                }
                              }}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Restore this version
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
