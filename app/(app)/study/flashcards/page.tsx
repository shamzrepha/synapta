"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Layers, Loader2, Pencil, Plus, Sparkles, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { asArray } from "@/lib/api/client";
import { api, errMsg, send } from "@/lib/study/client";
import { cn } from "@/lib/utils";

interface Deck { id: string; title: string; sourceLabel: string; cardCount: number; dueCount: number; newCount: number; learnedCount: number }
interface Stats { totalCards: number; dueToday: number; learned: number; reviewedToday: number; totalReviews: number }
interface CardRow { id: string; front: string; back: string; isDue: boolean; reps: number }
interface Sources {
  classes: Array<{ id: string; title: string; topics: Array<{ id: string; title: string }> }>;
  notebooks: Array<{ id: string; title: string; course: string }>;
}
type Mode = { name: "home" } | { name: "review"; deck: Deck } | { name: "manage"; deck: Deck };

const RATE: Array<{ key: "again" | "hard" | "good" | "easy"; label: string; cls: string }> = [
  { key: "again", label: "Again", cls: "bg-rose-600 hover:bg-rose-700 text-white" },
  { key: "hard", label: "Hard", cls: "bg-amber-500 hover:bg-amber-600 text-slate-950" },
  { key: "good", label: "Good", cls: "bg-teal-600 hover:bg-teal-700 text-white" },
  { key: "easy", label: "Easy", cls: "bg-sky-600 hover:bg-sky-700 text-white" },
];

export default function FlashcardsPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>({ name: "home" });
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    api<{ decks: Deck[]; stats: Stats }>("/api/flashcards")
      .then((d) => {
        if (!alive) return;
        setDecks(asArray<Deck>(d.decks));
        setStats(d.stats);
      })
      .catch((e) => {
        if (!alive) return;
        setDecks((p) => p ?? []);
        toast({ title: "Couldn't load decks", description: errMsg(e), variant: "destructive" });
      });
    return () => {
      alive = false;
    };
  }, [tick, toast]);

  const home = () => {
    setMode({ name: "home" });
    load();
  };

  if (mode.name === "review") return <Review deck={mode.deck} onExit={home} />;
  if (mode.name === "manage") return <Manage deck={mode.deck} onExit={home} />;

  const remove = async (deck: Deck) => {
    if (!window.confirm(`Delete "${deck.title}" and its ${deck.cardCount} cards?`)) return;
    try {
      await api(`/api/flashcards/${deck.id}`, { method: "DELETE" });
      setDecks((p) => (p || []).filter((d) => d.id !== deck.id));
      load();
    } catch (e) {
      toast({ title: "Couldn't delete", description: errMsg(e), variant: "destructive" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Layers className="h-7 w-7 text-teal-600" /> Flashcards
        </h1>
        <p className="text-sm text-slate-500">AI-made decks with spaced repetition, so you review each card right before you would forget it.</p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          ["Due now", stats?.dueToday],
          ["Cards", stats?.totalCards],
          ["Learned", stats?.learned],
          ["Today", stats?.reviewedToday],
        ].map(([label, v]) => (
          <div key={label as string} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-2.5 text-center">
            <p className="text-xl font-extrabold tabular-nums">{stats ? (v as number) : "-"}</p>
            <p className="text-[11px] text-slate-500">{label as string}</p>
          </div>
        ))}
      </div>

      <NewDeck onCreated={() => load()} />

      <div className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Your decks</h2>
        {decks === null && <Skeleton className="h-24 w-full" />}
        {decks && decks.length === 0 && <p className="text-sm text-slate-500 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4">No decks yet. Make your first one above.</p>}
        {(decks || []).map((d) => (
          <Card key={d.id} className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-tight break-words">{d.title}</p>
                <p className="text-xs text-slate-500 truncate">{d.sourceLabel}</p>
              </div>
              <button type="button" aria-label={`Delete ${d.title}`} onClick={() => void remove(d)} className="h-9 w-9 shrink-0 grid place-items-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              <span className={cn("font-semibold", d.dueCount > 0 && "text-teal-600")}>{d.dueCount} due</span> · {d.newCount} new · {d.cardCount} cards
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={d.dueCount === 0} onClick={() => setMode({ name: "review", deck: d })}>
                {d.dueCount === 0 ? "All caught up" : `Review ${d.dueCount}`}
              </Button>
              <Button variant="outline" onClick={() => setMode({ name: "manage", deck: d })}>
                <Pencil className="h-4 w-4 mr-1.5" /> Cards
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- create ---------- */

function NewDeck({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Sources | null>(null);
  const [kind, setKind] = useState<"class" | "notebook" | "text">("class");
  const [classId, setClassId] = useState("");
  const [kcId, setKcId] = useState("");
  const [notebookId, setNotebookId] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [count, setCount] = useState(15);
  const [busy, setBusy] = useState(false);

  const openPanel = () => {
    setOpen(true);
    if (!sources) {
      api<Sources>("/api/flashcards/sources")
        .then((s) => setSources({ classes: asArray(s.classes), notebooks: asArray(s.notebooks) }))
        .catch(() => setSources({ classes: [], notebooks: [] }));
    }
  };

  const topics = sources?.classes.find((c) => c.id === classId)?.topics ?? [];
  const ready = kind === "class" ? !!(classId && kcId) : kind === "notebook" ? !!notebookId : text.trim().length >= 80;

  const create = async () => {
    setBusy(true);
    try {
      const source = kind === "class" ? { kind, classId, kcId } : kind === "notebook" ? { kind, notebookId } : { kind, text };
      const r = await send<{ cardCount: number }>("/api/flashcards", { title: title.trim() || undefined, count, source });
      toast({ title: "Deck ready", description: `${r.cardCount} cards created.`, variant: "success" });
      setOpen(false);
      setText("");
      setTitle("");
      onCreated();
    } catch (e) {
      toast({ title: "Couldn't make the deck", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button className="w-full" size="lg" onClick={openPanel}>
        <Sparkles className="h-4 w-4 mr-2" /> New AI deck
      </Button>
    );
  }
  const select = "h-11 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm";
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-bold">Make a deck from…</p>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-1.5">
        {([["class", "Class lesson"], ["notebook", "Notebook"], ["text", "Pasted text"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={cn("flex-1 rounded-full px-3 py-2 text-xs font-semibold border", kind === k ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 dark:border-slate-700")}>{l}</button>
        ))}
      </div>
      {!sources && kind !== "text" && <Skeleton className="h-11 w-full" />}
      {kind === "class" && sources && (
        sources.classes.length === 0 ? <p className="text-sm text-slate-500">Join a class to make cards from its lessons.</p> : (
          <div className="space-y-2">
            <select className={select} value={classId} onChange={(e) => { setClassId(e.target.value); setKcId(""); }} aria-label="Class">
              <option value="">Choose a class…</option>
              {asArray(sources.classes).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <select className={select} value={kcId} onChange={(e) => setKcId(e.target.value)} disabled={!classId} aria-label="Lesson">
              <option value="">Choose a lesson…</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        )
      )}
      {kind === "notebook" && sources && (
        sources.notebooks.length === 0 ? <p className="text-sm text-slate-500">You have no notebooks yet.</p> : (
          <select className={select} value={notebookId} onChange={(e) => setNotebookId(e.target.value)} aria-label="Notebook">
            <option value="">Choose a notebook…</option>
            {sources.notebooks.map((n) => <option key={n.id} value={n.id}>{n.title}{n.course ? ` (${n.course})` : ""}</option>)}
          </select>
        )
      )}
      {kind === "text" && (
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your notes or a passage (at least a few sentences)…" rows={6} maxLength={40000} />
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deck name (optional)" maxLength={80} />
        <select className="h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Number of cards">
          {[10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} cards</option>)}
        </select>
      </div>
      <Button className="w-full" disabled={!ready} isLoading={busy} onClick={() => void create()}>
        {busy ? "Writing your cards…" : "Generate cards"}
      </Button>
    </Card>
  );
}

/* ---------- review ---------- */

function Review({ deck, onExit }: { deck: Deck; onExit: () => void }) {
  const { toast } = useToast();
  const [queue, setQueue] = useState<CardRow[] | null>(null);
  const [pos, setPos] = useState(0);
  const [shown, setShown] = useState(false);
  const [requeued, setRequeued] = useState<Set<string>>(() => new Set());
  const [counts, setCounts] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ cards: CardRow[] }>(`/api/flashcards/${deck.id}?mode=review`)
      .then((d) => alive && setQueue(asArray<CardRow>(d.cards)))
      .catch((e) => {
        if (alive) setQueue([]);
        toast({ title: "Couldn't load cards", description: errMsg(e), variant: "destructive" });
      });
    return () => {
      alive = false;
    };
  }, [deck.id, toast]);

  const rate = async (rating: (typeof RATE)[number]["key"]) => {
    if (!queue || saving) return;
    const card = queue[pos];
    setSaving(true);
    try {
      await send("/api/flashcards/review", { cardId: card.id, rating });
      setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
      if (rating === "again" && !requeued.has(card.id)) {
        setRequeued((s) => new Set(s).add(card.id));
        setQueue((q) => [...(q || []), card]);
      }
      setShown(false);
      setPos((p) => p + 1);
    } catch (e) {
      toast({ title: "Couldn't save that review", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onExit} aria-label="Back" className="h-10 w-10 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-5 w-5" /></button>
      <p className="font-bold truncate">{deck.title}</p>
    </div>
  );

  if (queue === null) return <div className="max-w-2xl mx-auto space-y-4">{header}<Skeleton className="h-64 w-full" /></div>;

  if (pos >= queue.length) {
    const total = counts.again + counts.hard + counts.good + counts.easy;
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {header}
        <Card className="p-6 text-center space-y-3">
          <p className="text-4xl">{total > 0 ? "🎉" : "✅"}</p>
          <p className="text-xl font-extrabold">{total > 0 ? "Session complete" : "Nothing due"}</p>
          {total > 0 && (
            <p className="text-sm text-slate-500">{total} reviews · {counts.again} again · {counts.hard} hard · {counts.good} good · {counts.easy} easy</p>
          )}
          <Button onClick={onExit}>Back to decks</Button>
        </Card>
      </div>
    );
  }

  const card = queue[pos];
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {header}
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div className="h-full bg-teal-500 transition-all" style={{ width: `${Math.round((pos / queue.length) * 100)}%` }} />
      </div>
      <p className="text-xs text-slate-500 text-center">{pos + 1} / {queue.length}</p>
      <Card className="p-5 min-h-[260px] flex flex-col justify-center gap-4 text-center">
        <p className="text-lg font-semibold whitespace-pre-wrap break-words">{card.front}</p>
        {shown && (
          <>
            <div className="h-px bg-slate-200 dark:bg-slate-700" />
            <p className="text-base text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{card.back}</p>
          </>
        )}
      </Card>
      {!shown ? (
        <Button className="w-full" size="lg" onClick={() => setShown(true)}>Show answer</Button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {RATE.map((r) => (
            <button key={r.key} type="button" disabled={saving} onClick={() => void rate(r.key)} className={cn("h-14 rounded-xl text-sm font-bold active:scale-95 disabled:opacity-50", r.cls)}>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- manage ---------- */

function Manage({ deck, onExit }: { deck: Deck; onExit: () => void }) {
  const { toast } = useToast();
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ cards: CardRow[] }>(`/api/flashcards/${deck.id}?mode=all`)
      .then((d) => alive && setCards(asArray<CardRow>(d.cards)))
      .catch(() => alive && setCards([]));
    return () => {
      alive = false;
    };
  }, [deck.id]);

  const startEdit = (c: CardRow) => {
    setEditing(c.id);
    setFront(c.front);
    setBack(c.back);
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editing === "new") {
        const c = await send<CardRow>(`/api/flashcards/${deck.id}`, { front, back });
        setCards((p) => [c, ...(p || [])]);
      } else if (editing) {
        await send(`/api/flashcards/cards/${editing}`, { front, back }, "PATCH");
        setCards((p) => (p || []).map((c) => (c.id === editing ? { ...c, front: front.trim(), back: back.trim() } : c)));
      }
      setEditing(null);
    } catch (e) {
      toast({ title: "Couldn't save", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    try {
      await api(`/api/flashcards/cards/${id}`, { method: "DELETE" });
      setCards((p) => (p || []).filter((c) => c.id !== id));
    } catch (e) {
      toast({ title: "Couldn't delete", description: errMsg(e), variant: "destructive" });
    }
  };

  const editor = (
    <Card className="p-3 space-y-2 border-teal-500">
      <Textarea value={front} onChange={(e) => setFront(e.target.value)} rows={2} placeholder="Front (question)" maxLength={300} />
      <Textarea value={back} onChange={(e) => setBack(e.target.value)} rows={3} placeholder="Back (answer)" maxLength={600} />
      <div className="flex gap-2">
        <Button className="flex-1" isLoading={busy} disabled={!front.trim() || !back.trim()} onClick={() => void save()}><Check className="h-4 w-4 mr-1.5" /> Save</Button>
        <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
      </div>
    </Card>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onExit} aria-label="Back" className="h-10 w-10 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-5 w-5" /></button>
        <p className="font-bold truncate flex-1">{deck.title}</p>
        <Button size="sm" variant="outline" onClick={() => { setEditing("new"); setFront(""); setBack(""); }}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>
      {cards === null && <Skeleton className="h-32 w-full" />}
      {editing === "new" && editor}
      {(cards || []).map((c) =>
        editing === c.id ? <div key={c.id}>{editor}</div> : (
          <Card key={c.id} className="p-3 flex gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold break-words">{c.front}</p>
              <p className="text-sm text-slate-500 break-words">{c.back}</p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button type="button" aria-label="Edit card" onClick={() => startEdit(c)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
              <button type="button" aria-label="Delete card" onClick={() => void del(c.id)} className="h-9 w-9 grid place-items-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 className="h-4 w-4" /></button>
            </div>
          </Card>
        )
      )}
      {cards && cards.length === 0 && editing !== "new" && <p className="text-sm text-slate-500">This deck has no cards.</p>}
      {busy && <Loader2 className="h-4 w-4 animate-spin mx-auto" />}
    </div>
  );
}
