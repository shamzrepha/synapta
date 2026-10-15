"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flame, Copy, Check, Trash2, UserPlus, Crown, LogOut, RefreshCw, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { useLiveChannel } from "@/lib/live/client";
import { asArray } from "@/lib/api/client";
import { mergeNotes } from "@/lib/groups/notes";
import { cn } from "@/lib/utils";

interface Member {
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  role: string;
  activeToday: boolean;
}
interface Goal {
  id: string;
  text: string;
  done: boolean;
}
interface Detail {
  id: string;
  name: string;
  description: string;
  ownerUid: string;
  me: string;
  inviteCode: string;
  members: Member[];
  notes: { text: string; version: number; updatedByName?: string };
  goals: Goal[];
  streak: { current: number; longest: number; activeToday: boolean };
}
interface Conflict {
  mine: string;
  theirs: string;
  theirsVersion: number;
  by: string;
}
interface Suggestion {
  uid: string;
  username: string;
  displayName: string;
  photoURL: string | null;
}

type Tab = "notes" | "goals" | "members";

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("notes");
  // notes editor
  const [draft, setDraft] = useState("");
  const [baseText, setBaseText] = useState("");
  const [baseVersion, setBaseVersion] = useState(0);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [remoteNewer, setRemoteNewer] = useState<string | null>(null);
  // goals / invite
  const [goalText, setGoalText] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const dirty = d !== null && draft !== baseText;

  // Initial notes load must seed the editor even though nothing is dirty yet.
  useEffect(() => {
    let alive = true;
    fetch(`/api/groups/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.ok) return setError(j.error?.message || "Group not found");
        const next: Detail = j.data;
        next.members = asArray<Member>(next.members);
        next.goals = asArray<Goal>(next.goals);
        setD(next);
        setDraft(next.notes.text);
        setBaseText(next.notes.text);
        setBaseVersion(next.notes.version);
      })
      .catch(() => alive && setError("Couldn't load the group"));
    return () => {
      alive = false;
    };
  }, [id]);

  // live refresh: if someone else saved notes while I'm editing, warn instead of clobbering
  const onLive = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/groups/${id}`)).json();
      if (!j.ok) return;
      const next: Detail = j.data;
      next.members = asArray<Member>(next.members);
      next.goals = asArray<Goal>(next.goals);
      setD(next);
      if (next.notes.version !== baseVersion) {
        if (draft === baseText) {
          setDraft(next.notes.text);
          setBaseText(next.notes.text);
          setBaseVersion(next.notes.version);
        } else setRemoteNewer(next.notes.updatedByName || "Someone");
      }
    } catch {
      // ignore
    }
  }, [id, baseVersion, draft, baseText]);
  useLiveChannel(`group:${id}`, onLive);

  const act = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/groups/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!j.ok) toast({ title: "Something went wrong", description: j.error?.message, variant: "destructive" });
      return j.ok ? (j.data as Record<string, unknown>) : null;
    } catch {
      toast({ title: "Network error", variant: "destructive" });
      return null;
    }
  };

  const refresh = async () => {
    const j = await (await fetch(`/api/groups/${id}`)).json().catch(() => null);
    if (j?.ok) {
      const next: Detail = j.data;
      next.members = asArray<Member>(next.members);
      next.goals = asArray<Goal>(next.goals);
      setD(next);
    }
  };

  const saveNotes = async (force = false, version = baseVersion, text = draft) => {
    setSaving(true);
    const r = await act({ action: "notes", text, baseVersion: version, force });
    setSaving(false);
    if (!r) return;
    if (r.conflict) {
      const n = r.notes as { text: string; version: number; updatedByName?: string };
      setConflict({ mine: text, theirs: n.text, theirsVersion: n.version, by: n.updatedByName || "Someone" });
      return;
    }
    setBaseText(text);
    setBaseVersion(r.version as number);
    setRemoteNewer(null);
    setConflict(null);
    toast({ title: "Notes saved", variant: "success" });
  };

  const resolveKeepTheirs = () => {
    if (!conflict) return;
    setDraft(conflict.theirs);
    setBaseText(conflict.theirs);
    setBaseVersion(conflict.theirsVersion);
    setConflict(null);
    setRemoteNewer(null);
  };
  const resolveMerge = () => {
    if (!conflict) return;
    const merged = mergeNotes(baseText, conflict.mine, conflict.theirs);
    setDraft(merged.text);
    setBaseText(conflict.theirs);
    setBaseVersion(conflict.theirsVersion);
    setConflict(null);
    setRemoteNewer(null);
    toast({ title: merged.clean ? "Merged" : "Both versions kept", description: merged.clean ? "Review and save." : "Edit between the markers, then save.", variant: "success" });
  };

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) return setSuggestions([]);
    try {
      const j = await (await fetch(`/api/mentions/users?q=${encodeURIComponent(q.trim())}`)).json();
      setSuggestions(asArray<Suggestion>(j.ok ? j.data.users : []).filter((u) => !d?.members.some((m) => m.uid === u.uid)));
    } catch {
      setSuggestions([]);
    }
  };

  const invite = async (username: string) => {
    const r = await act({ action: "invite", username });
    if (r) {
      toast({ title: `Invited @${username}`, variant: "success" });
      setQuery("");
      setSuggestions([]);
    }
  };

  const copyLink = async () => {
    if (!d) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/groups?join=${d.inviteCode}`);
      toast({ title: "Invite link copied", variant: "success" });
    } catch {
      toast({ title: "Copy failed", description: `Code: ${d.inviteCode}`, variant: "destructive" });
    }
  };

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-0 space-y-3">
        <Link href="/groups" className="inline-flex items-center gap-1 text-sm text-slate-500 min-h-9">
          <ArrowLeft className="h-4 w-4" /> Groups
        </Link>
        <Card className="p-5 text-center text-sm text-slate-500">{error}</Card>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-0">
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const isOwner = d.ownerUid === d.me;
  const doneCount = d.goals.filter((g) => g.done).length;

  return (
    <div className="max-w-xl mx-auto space-y-4 px-4 sm:px-0 pb-8">
      <Link href="/groups" className="inline-flex items-center gap-1 text-sm text-slate-500 min-h-9">
        <ArrowLeft className="h-4 w-4" /> Groups
      </Link>

      <Card className="p-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight truncate">{d.name}</h1>
          {d.description && <p className="text-xs text-slate-500 line-clamp-2">{d.description}</p>}
          <p className="text-xs text-slate-500 mt-1">
            {d.members.length} members · {d.streak.activeToday ? "streak counted today" : "no activity yet today"}
          </p>
        </div>
        <div className="text-center shrink-0">
          <Flame className={cn("h-8 w-8 mx-auto", d.streak.current > 0 ? (d.streak.activeToday ? "text-orange-500" : "text-orange-300") : "text-slate-300")} />
          <p className="text-lg font-extrabold leading-none">{d.streak.current}</p>
          <p className="text-[10px] text-slate-500">day streak</p>
        </div>
      </Card>

      {!d.streak.activeToday && (
        <Button
          variant="outline"
          className="w-full min-h-11"
          onClick={async () => {
            if (await act({ action: "checkin" })) {
              toast({ title: "Checked in", description: "Today counts for the group streak.", variant: "success" });
              await refresh();
            }
          }}
        >
          <Check className="h-4 w-4 mr-1" /> Check in for today
        </Button>
      )}

      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900" role="tablist">
        {(["notes", "goals", "members"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("min-h-10 rounded-lg text-sm font-medium capitalize", tab === t ? "bg-white dark:bg-slate-800 shadow-sm" : "text-slate-500")}
          >
            {t}
            {t === "goals" && d.goals.length > 0 ? ` ${doneCount}/${d.goals.length}` : ""}
          </button>
        ))}
      </div>

      {tab === "notes" && (
        <Card className="p-4 space-y-3">
          {conflict ? (
            <div className="space-y-3 rounded-xl border border-amber-500/50 bg-amber-500/5 p-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" /> {conflict.by} saved changes while you were editing
              </p>
              <p className="text-xs text-slate-500">Choose what happens to your version. Nothing is overwritten until you pick.</p>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="outline" className="min-h-11" onClick={resolveKeepTheirs}>
                  Keep theirs (discard mine)
                </Button>
                <Button variant="outline" className="min-h-11" onClick={resolveMerge}>
                  Merge into the editor
                </Button>
                <Button variant="destructive" className="min-h-11" isLoading={saving} onClick={() => saveNotes(true, conflict.theirsVersion, conflict.mine)}>
                  Overwrite with mine
                </Button>
              </div>
            </div>
          ) : (
            <>
              {remoteNewer && (
                <p className="text-xs rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2">
                  {remoteNewer} updated these notes. When you save you can choose how to combine.
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  v{baseVersion}
                  {d.notes.updatedByName ? ` · last by ${d.notes.updatedByName}` : ""}
                </p>
                <button className="text-xs text-teal-700 dark:text-teal-400 min-h-9 px-2" onClick={() => setPreview((p) => !p)}>
                  {preview ? "Edit" : "Preview"}
                </button>
              </div>
              {preview ? (
                <div className="min-h-40 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <MarkdownRenderer content={draft || "_Nothing yet_"} />
                </div>
              ) : (
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={14} maxLength={20000} className="font-mono text-sm" placeholder="Markdown notes shared with the group" />
              )}
              <Button className="w-full min-h-11" disabled={!dirty} isLoading={saving} onClick={() => saveNotes()}>
                {dirty ? "Save notes" : "Saved"}
              </Button>
            </>
          )}
        </Card>
      )}

      {tab === "goals" && (
        <Card className="p-4 space-y-3">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const text = goalText.trim();
              if (!text) return;
              setGoalText("");
              if (await act({ action: "goal_add", text })) await refresh();
            }}
          >
            <Input value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="Add a shared goal" maxLength={140} />
            <Button type="submit" className="min-h-11 shrink-0">
              Add
            </Button>
          </form>
          {d.goals.length === 0 ? (
            <p className="text-sm text-slate-500">No goals yet. Add one for the whole group to tick off.</p>
          ) : (
            <ul className="space-y-1.5">
              {d.goals.map((g) => (
                <li key={g.id} className="flex items-center gap-2 min-h-11">
                  <button
                    aria-label={g.done ? "Mark as not done" : "Mark as done"}
                    onClick={async () => {
                      setD((cur) => (cur ? { ...cur, goals: cur.goals.map((x) => (x.id === g.id ? { ...x, done: !x.done } : x)) } : cur));
                      await act({ action: "goal_toggle", goalId: g.id });
                    }}
                    className={cn("h-6 w-6 rounded-md border-2 flex items-center justify-center shrink-0", g.done ? "bg-teal-600 border-teal-600 text-white" : "border-slate-300 dark:border-slate-600")}
                  >
                    {g.done && <Check className="h-4 w-4" />}
                  </button>
                  <span className={cn("flex-1 text-sm", g.done && "line-through text-slate-400")}>{g.text}</span>
                  <button
                    aria-label="Remove goal"
                    className="p-2 text-slate-400 hover:text-rose-600"
                    onClick={async () => {
                      setD((cur) => (cur ? { ...cur, goals: cur.goals.filter((x) => x.id !== g.id) } : cur));
                      await act({ action: "goal_remove", goalId: g.id });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "members" && (
        <>
          <Card className="p-4 space-y-3">
            <p className="font-bold text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Invite
            </p>
            <Input value={query} onChange={(e) => search(e.target.value)} placeholder="Search by username" />
            {suggestions.length > 0 && (
              <ul className="space-y-1">
                {suggestions.map((u) => (
                  <li key={u.uid}>
                    <button onClick={() => invite(u.username)} className="w-full flex items-center gap-2 min-h-11 rounded-xl px-2 hover:bg-slate-100 dark:hover:bg-slate-900 text-left">
                      <Avatar name={u.displayName} photoURL={u.photoURL} seed={u.uid} size={28} />
                      <span className="text-sm truncate">{u.displayName}</span>
                      <span className="text-xs text-slate-500">@{u.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="min-h-9" onClick={copyLink}>
                <Copy className="h-4 w-4 mr-1" /> Copy invite link
              </Button>
              {isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-9"
                  onClick={async () => {
                    if (confirm("Old invite links will stop working. Continue?") && (await act({ action: "rotate_code" }))) await refresh();
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-1" /> New link
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-2">
            <p className="font-bold text-sm">Members ({d.members.length})</p>
            <ul className="space-y-1">
              {d.members.map((m) => (
                <li key={m.uid} className="flex items-center gap-3 min-h-12">
                  <Avatar name={m.displayName} photoURL={m.photoURL} seed={m.uid} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">
                      {m.displayName}
                      {m.uid === d.me && " (you)"}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {m.role === "owner" ? (
                        <span className="inline-flex items-center gap-1">
                          <Crown className="h-3 w-3 text-amber-500" /> Owner
                        </span>
                      ) : (
                        "Member"
                      )}
                      {m.activeToday ? " · active today" : ""}
                    </span>
                  </span>
                  {isOwner && m.uid !== d.me && (
                    <span className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-9"
                        onClick={async () => {
                          if (confirm(`Make ${m.displayName} the owner? You'll become a regular member.`) && (await act({ action: "transfer", uid: m.uid }))) await refresh();
                        }}
                      >
                        Make owner
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-9 text-rose-600"
                        onClick={async () => {
                          if (confirm(`Remove ${m.displayName}?`) && (await act({ action: "kick", uid: m.uid }))) await refresh();
                        }}
                      >
                        Remove
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={async () => {
                if (isOwner && d.members.length > 1) {
                  toast({ title: "Transfer ownership first", description: "Pick a member and tap “Make owner”, then you can leave.", variant: "destructive" });
                  return;
                }
                if (confirm(d.members.length <= 1 ? "You're the last member, so leaving deletes the group. Continue?" : "Leave this group?") && (await act({ action: "leave" }))) router.push("/groups");
              }}
            >
              <LogOut className="h-4 w-4 mr-1" /> Leave group
            </Button>
            {isOwner && (
              <Button
                variant="ghost"
                className="min-h-11 text-rose-600"
                onClick={async () => {
                  if (confirm("Delete this group for everyone?") && (await act({ action: "delete" }))) router.push("/groups");
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete group
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
