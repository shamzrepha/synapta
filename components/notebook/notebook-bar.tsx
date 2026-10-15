"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookMarked, ChevronDown, Plus, Share2, MessagesSquare, Trash2, X, Check, Users, Save } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface NotebookSummary {
  id: string;
  title: string;
  course: string;
  role: "owner" | "editor" | "viewer";
  ownerName: string;
  memberCount: number;
  sourceCount: number;
  shared: boolean;
  updatedAt: string | null;
}

export interface NotebookMember {
  uid: string;
  displayName: string;
  photoURL: string | null;
  role: "owner" | "editor" | "viewer";
}

export interface NotebookMeta {
  id: string;
  title: string;
  course: string;
  role: "owner" | "editor" | "viewer";
  ownerUid: string;
  chatId: string | null;
  members: NotebookMember[];
}

interface Limits {
  perCourse: number;
  total: number;
  sources: number;
  members: number;
}

export async function fetchNotebookList(): Promise<{ notebooks: NotebookSummary[]; limits: Limits } | null> {
  try {
    const j = await fetch("/api/notebooks").then((r) => r.json());
    return j.ok ? { notebooks: asArray<NotebookSummary>(j.data.notebooks), limits: j.data.limits } : null;
  } catch {
    return null;
  }
}

/**
 * Study Hub notebook switcher: notebooks grouped by course, create (or save the scratch pad as a
 * notebook), share with friends as viewer/editor, and jump into the notebook's group room.
 */
export function NotebookBar({
  meta,
  listVersion,
  hasScratch,
  onSelect,
  onCreate,
  onDeleted,
  onMembersChanged,
}: {
  meta: NotebookMeta | null;
  /** Bump to refetch the list */
  listVersion: number;
  /** Scratch pad has sources that can be saved */
  hasScratch: boolean;
  onSelect: (id: string | null) => void;
  /** Creates a notebook; `fromScratch` copies the current unsaved sources into it */
  onCreate: (title: string, course: string, fromScratch: boolean) => Promise<void>;
  onDeleted: () => void;
  onMembersChanged: () => void;
}) {
  const { toast } = useToast();
  const [list, setList] = useState<NotebookSummary[] | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<null | "new" | "scratch">(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    fetchNotebookList().then((r) => {
      if (!r) return;
      setList(r.notebooks);
      setLimits(r.limits);
    });
  }, [listVersion]);

  const groups = useMemo(() => {
    const m = new Map<string, NotebookSummary[]>();
    for (const n of list || []) m.set(n.course, [...(m.get(n.course) || []), n]);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);
  const courses = groups.map(([c]) => c);

  const remove = async () => {
    if (!meta || !confirm(`Delete “${meta.title}” and all its sources for everyone?`)) return;
    const j = await fetch(`/api/notebooks/${meta.id}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) {
      toast({ title: "Notebook deleted" });
      onDeleted();
    } else toast({ title: "Couldn't delete", description: j?.error?.message, variant: "destructive" });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 p-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-xl px-3 h-9 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 max-w-[260px]"
          aria-expanded={open}
        >
          <BookMarked className="h-4 w-4 text-teal-600 shrink-0" />
          <span className="truncate">{meta ? meta.title : "Scratch pad (not saved)"}</span>
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        </button>
        {open && (
          <div className="absolute left-0 top-11 z-40 w-[min(92vw,340px)] max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(null);
              }}
              className={cn("w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900", !meta && "bg-teal-500/10")}
            >
              Scratch pad <span className="text-xs text-slate-400">· not saved</span>
            </button>
            {list === null && <p className="px-3 py-2 text-xs text-slate-500">Loading notebooks…</p>}
            {list?.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No notebooks yet. Create one per course to keep sources, chats and study sets.</p>}
            {groups.map(([course, items]) => (
              <div key={course} className="mt-2">
                <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {course} {limits && <span className="font-normal">· {items.filter((i) => i.role === "owner").length}/{limits.perCourse}</span>}
                </p>
                {items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSelect(n.id);
                    }}
                    className={cn("w-full text-left rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900", meta?.id === n.id && "bg-teal-500/10")}
                  >
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {n.title}
                      {n.shared && <Users className="h-3 w-3 text-slate-400" />}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {n.sourceCount} source{n.sourceCount === 1 ? "" : "s"}
                      {n.role !== "owner" ? ` · ${n.ownerName}'s · ${n.role}` : n.shared ? ` · ${n.memberCount} members` : ""}
                    </p>
                  </button>
                ))}
              </div>
            ))}
            <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreating("new");
                }}
                className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-500/10"
              >
                <Plus className="h-4 w-4" /> New notebook
              </button>
            </div>
          </div>
        )}
      </div>

      {meta && (
        <>
          <Badge variant="outline" className="text-[10px]">{meta.course}</Badge>
          {meta.role !== "owner" && <Badge variant="secondary" className="text-[10px] capitalize">{meta.role}</Badge>}
          <div className="flex -space-x-2">
            {meta.members.slice(0, 5).map((m) => (
              <Avatar key={m.uid} name={m.displayName} photoURL={m.photoURL} seed={m.uid} size={26} className="ring-2 ring-white dark:ring-slate-900 rounded-full" />
            ))}
            {meta.members.length > 5 && <span className="h-[26px] px-1.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-bold flex items-center">+{meta.members.length - 5}</span>}
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {!meta && hasScratch && (
          <Button size="sm" variant="outline" className="text-xs" onClick={() => setCreating("scratch")}>
            <Save className="h-3.5 w-3.5 mr-1" /> Save as notebook
          </Button>
        )}
        {!meta && (
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setCreating("new")}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New
          </Button>
        )}
        {meta?.chatId && (
          <Link href={`/messages?chat=${meta.chatId}`} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700">
            <MessagesSquare className="h-3.5 w-3.5" /> Group room
          </Link>
        )}
        {meta?.role === "owner" && (
          <>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setSharing(true)}>
              <Share2 className="h-3.5 w-3.5 mr-1" /> Share
            </Button>
            <button type="button" onClick={remove} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" aria-label="Delete notebook">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {creating && (
        <CreateModal
          courses={courses}
          fromScratch={creating === "scratch"}
          onClose={() => setCreating(null)}
          onCreate={async (title, course) => {
            await onCreate(title, course, creating === "scratch");
            setCreating(null);
          }}
        />
      )}
      {sharing && meta && (
        <ShareModal
          meta={meta}
          maxMembers={limits?.members ?? 30}
          onClose={() => setSharing(false)}
          onChanged={onMembersChanged}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[85dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function CreateModal({
  courses,
  fromScratch,
  onClose,
  onCreate,
}: {
  courses: string[];
  fromScratch: boolean;
  onClose: () => void;
  onCreate: (title: string, course: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState(courses[0] || "");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={fromScratch ? "Save as notebook" : "New notebook"} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setBusy(true);
          try {
            await onCreate(title.trim(), course.trim() || "General");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
          Title
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Week 3 – Thermodynamics" className="mt-1 w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
          Course
          <input value={course} onChange={(e) => setCourse(e.target.value)} maxLength={60} list="nb-courses" placeholder="e.g. PHYS 101" className="mt-1 w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm" />
          <datalist id="nb-courses">
            {courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <p className="text-[11px] text-slate-500">Up to 10 notebooks per course and 20 sources per notebook. {fromScratch && "Your current sources will be copied in."}</p>
        <Button type="submit" className="w-full" isLoading={busy} disabled={!title.trim()}>
          Create notebook
        </Button>
      </form>
    </Modal>
  );
}

interface FriendLite {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

function ShareModal({ meta, maxMembers, onClose, onChanged }: { meta: NotebookMeta; maxMembers: number; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const [friends, setFriends] = useState<FriendLite[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/friends")
      .then((r) => r.json())
      .then((j) => setFriends(j.ok ? asArray<FriendLite>(j.data.friends) : []))
      .catch(() => setFriends([]));
  }, []);

  const roleOf = (uid: string) => meta.members.find((m) => m.uid === uid)?.role || null;

  const setRole = async (uid: string, role: "editor" | "viewer" | "remove") => {
    setBusy(uid);
    try {
      const j = await fetch(`/api/notebooks/${meta.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, role }),
      }).then((r) => r.json());
      if (j.ok) onChanged();
      else toast({ title: "Couldn't update sharing", description: j.error?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const people = (friends || []).filter((f) => f.displayName.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal title={`Share “${meta.title}”`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">
        Friends you add get a group room in Messages linked to this notebook. Editors can add sources, ask the AI and save study sets; viewers can read and chat. {meta.members.length}/{maxMembers} people.
      </p>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search friends" className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-sm mb-2" />
      {friends === null && <p className="text-xs text-slate-500">Loading friends…</p>}
      {friends?.length === 0 && (
        <p className="text-xs text-slate-500">
          Add friends first on the <Link href="/friends" className="text-teal-600 font-semibold">Friends</Link> page.
        </p>
      )}
      <ul className="space-y-1">
        {people.map((f) => {
          const role = roleOf(f.uid);
          return (
            <li key={f.uid} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900">
              <Avatar name={f.displayName} photoURL={f.photoURL} seed={f.uid} size={32} />
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{f.displayName}</span>
              {role ? (
                <>
                  <select
                    value={role}
                    disabled={busy === f.uid}
                    onChange={(e) => setRole(f.uid, e.target.value as "editor" | "viewer")}
                    className="h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs"
                    aria-label={`${f.displayName}'s access`}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button type="button" disabled={busy === f.uid} onClick={() => setRole(f.uid, "remove")} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600" aria-label={`Remove ${f.displayName}`}>
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="text-xs h-8" isLoading={busy === f.uid} onClick={() => setRole(f.uid, "viewer")}>
                    Viewer
                  </Button>
                  <Button size="sm" className="text-xs h-8" disabled={busy === f.uid} onClick={() => setRole(f.uid, "editor")}>
                    <Check className="h-3 w-3 mr-1" /> Editor
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
