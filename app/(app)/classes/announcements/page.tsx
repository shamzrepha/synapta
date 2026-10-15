"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, Megaphone, Pencil, Pin, PinOff, Send, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, errMsg } from "@/lib/teach/client";

interface Item {
  id: string;
  classId: string;
  classTitle: string;
  title: string;
  body: string;
  pinned: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  read: boolean;
  canManage: boolean;
  canSeeReceipts: boolean;
}
interface ClassOpt { id: string; title: string; canPost: boolean }
interface Feed { items: Item[]; unread: number; classes: ClassOpt[] }
interface Receipts { read: number; total: number; percent: number; people: { uid: string; name: string; readAt: string | null }[] }

export default function AnnouncementsPage() {
  const { toast } = useToast();
  const [feed, setFeed] = useState<Feed | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Feed>("/api/announcements");
      setFeed({ items: asArray<Item>(d.items), unread: d.unread || 0, classes: asArray<ClassOpt>(d.classes) });
    } catch (e) {
      setFeed({ items: [], unread: 0, classes: [] });
      toast({ title: "Could not load announcements", description: errMsg(e), variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    setFeed((f) => {
      if (!f) return f;
      const target = f.items.find((i) => i.id === id);
      if (!target || target.read) return f;
      return { ...f, unread: Math.max(0, f.unread - 1), items: f.items.map((i) => (i.id === id ? { ...i, read: true } : i)) };
    });
    try {
      await api(`/api/announcements/${id}/read`, { method: "POST" });
    } catch {
      /* will be retried next time it is opened */
    }
  }, []);

  const postable = feed?.classes.filter((c) => c.canPost) ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 sm:px-6">
      <header className="flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-teal-600" />
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Announcements</h1>
        {feed && feed.unread > 0 && <Badge variant="destructive">{feed.unread} unread</Badge>}
      </header>

      {postable.length > 0 && <Composer classes={postable} onPosted={load} />}

      {feed === null ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : feed.items.length === 0 ? (
        <p className="text-sm text-slate-500">No announcements yet.</p>
      ) : (
        feed.items.map((a) => <AnnouncementCard key={a.id} item={a} onRead={markRead} onChanged={load} />)
      )}
    </div>
  );
}

function Composer({ classes, onPosted }: { classes: ClassOpt[]; onPosted: () => Promise<void> }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  async function post() {
    setBusy(true);
    try {
      await api("/api/announcements", { method: "POST", body: { classId, title, body, pinned } });
      setTitle("");
      setBody("");
      setPinned(false);
      setOpen(false);
      toast({ title: "Announcement posted", variant: "success" });
      await onPosted();
    } catch (e) {
      toast({ title: "Could not post", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}><Megaphone className="mr-1 h-4 w-4" /> New announcement</Button>;
  }
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
        <Textarea rows={4} placeholder="Write your announcement…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
        <label className="flex min-h-[36px] items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4" /> Pin to top
        </label>
        <div className="flex gap-2">
          <Button onClick={post} disabled={busy || !title.trim() || !body.trim() || !classId}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Post</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AnnouncementCard({ item, onRead, onChanged }: { item: Item; onRead: (id: string) => void; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [receipts, setReceipts] = useState<Receipts | null>(null);
  const [showReceipts, setShowReceipts] = useState(false);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !item.read) onRead(item.id);
  }

  async function save() {
    try {
      await api(`/api/announcements/${item.id}`, { method: "PATCH", body: { title, body } });
      setEditing(false);
      await onChanged();
    } catch (e) {
      toast({ title: "Could not save", description: errMsg(e), variant: "destructive" });
    }
  }

  async function togglePin() {
    try {
      await api(`/api/announcements/${item.id}`, { method: "PATCH", body: { pinned: !item.pinned } });
      await onChanged();
    } catch (e) {
      toast({ title: "Could not update", description: errMsg(e), variant: "destructive" });
    }
  }

  async function remove() {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await api(`/api/announcements/${item.id}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      toast({ title: "Could not delete", description: errMsg(e), variant: "destructive" });
    }
  }

  async function openReceipts() {
    const next = !showReceipts;
    setShowReceipts(next);
    if (next) {
      try {
        const r = await api<Receipts>(`/api/announcements/${item.id}/receipts`);
        setReceipts({ ...r, people: asArray(r.people) });
      } catch (e) {
        toast({ title: "Could not load receipts", description: errMsg(e), variant: "destructive" });
      }
    }
  }

  return (
    <Card className={!item.read ? "border-teal-400 dark:border-teal-500/60" : ""}>
      <CardContent className="space-y-2 p-4">
        {editing ? (
          <div className="space-y-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
            <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={!title.trim() || !body.trim()}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setTitle(item.title); setBody(item.body); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <button onClick={toggle} className="flex w-full min-h-[44px] items-start justify-between gap-3 text-left" aria-expanded={expanded}>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  {item.pinned && <Pin className="h-3.5 w-3.5 text-amber-500" />}
                  {!item.read && <span className="h-2 w-2 rounded-full bg-teal-500" aria-label="Unread" />}
                  <span className="font-semibold text-slate-900 dark:text-white">{item.title}</span>
                </span>
                <span className="block text-xs text-slate-500">{item.classTitle} · {item.authorName} · {new Date(item.createdAt).toLocaleDateString()}{item.updatedAt !== item.createdAt ? " (edited)" : ""}</span>
                {!expanded && <span className="mt-1 line-clamp-2 block text-sm text-slate-600 dark:text-slate-400">{item.body}</span>}
              </span>
              <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{item.body}</p>}
          </>
        )}

        {(item.canManage || item.canSeeReceipts) && !editing && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
            {item.canSeeReceipts && <Button size="sm" variant="outline" onClick={openReceipts}><Eye className="mr-1 h-4 w-4" /> Read by</Button>}
            {item.canManage && (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" /> Edit</Button>
                <Button size="sm" variant="outline" onClick={togglePin}>{item.pinned ? <PinOff className="mr-1 h-4 w-4" /> : <Pin className="mr-1 h-4 w-4" />}{item.pinned ? "Unpin" : "Pin"}</Button>
                <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
              </>
            )}
          </div>
        )}

        {showReceipts && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            {!receipts ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="mb-2 font-semibold">{receipts.read} of {receipts.total} read ({receipts.percent}%)</p>
                <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full bg-teal-500" style={{ width: `${receipts.percent}%` }} /></div>
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {receipts.people.map((p) => (
                    <li key={p.uid} className="flex justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className={p.readAt ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>{p.readAt ? "Read" : "Not yet"}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
