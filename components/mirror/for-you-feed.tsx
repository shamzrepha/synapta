"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronsDown, ChevronsUp, Headphones, FlaskConical, Info, Layers, ListChecks, PenLine, SkipForward } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sprout } from "@/components/bot/sprout";
import { fetchJson } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { sproutReaction, DEFAULT_STYLE, type SproutStyle } from "@/lib/mirror/sprout-voice";
import type { Format, Signal } from "@/lib/mirror/schema";

interface FeedItem {
  id: string;
  kind: string;
  format: Format;
  title: string;
  href: string;
  minutes: number;
  why: string;
  reason: string;
  topicId?: string;
  topicTitle?: string;
}
interface FeedData {
  items: FeedItem[];
  goal: { target: number; done: number; remaining: number };
  finished: "goal_met" | "caught_up" | null;
  personalised: boolean;
  sprout: SproutStyle;
}
interface DayState {
  done: number;
  bonus: number;
  doneIds: string[];
  skippedIds: string[];
  recent: Format[];
}

const ICON: Record<Format, typeof BookOpen> = { flashcards: Layers, quiz: ListChecks, lesson: BookOpen, lab: FlaskConical, written: PenLine, podcast: Headphones };
const FORMAT_WORD: Record<Format, string> = { flashcards: "Flashcards", quiz: "Quiz", lesson: "Read", lab: "Lab", written: "Written", podcast: "Listen" };
const localDay = () => new Date().toLocaleDateString("en-CA");
const key = (day: string) => `sunroot:for-you:${day}`;
const EMPTY: DayState = { done: 0, bonus: 0, doneIds: [], skippedIds: [], recent: [] };

function readDay(day: string): DayState {
  try {
    const raw = JSON.parse(localStorage.getItem(key(day)) || "null");
    if (raw && typeof raw.done === "number") return { ...EMPTY, ...raw };
  } catch {}
  return EMPTY;
}
function writeDay(day: string, s: DayState) {
  try {
    localStorage.setItem(key(day), JSON.stringify(s));
  } catch {}
}

export function ForYouFeed() {
  const [day] = useState(localDay);
  const startedAt = useRef(0);
  const shownAt = useRef(0);
  const queue = useRef<Signal[]>([]);
  const [state, setState] = useState<DayState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<FeedData | null>(null);
  const [list, setList] = useState<FeedItem[]>([]);
  const [error, setError] = useState("");
  const [line, setLine] = useState("");
  const [turningOn, setTurningOn] = useState(false);

  const flush = useCallback(() => {
    if (!queue.current.length) return;
    const signals = queue.current.splice(0, 25);
    fetch("/api/me/feed/signal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signals }), keepalive: true }).catch(() => {});
  }, []);

  const send = useCallback(
    (s: Omit<Signal, "hour" | "sessionMinutes"> & { sessionMinutes?: number }) => {
      queue.current.push({ ...s, hour: new Date().getHours(), sessionMinutes: Math.round((Date.now() - startedAt.current) / 60000) } as Signal);
      if (queue.current.length >= 5) flush();
    },
    [flush],
  );

  const load = useCallback(
    async (s: DayState) => {
      setError("");
      const q = new URLSearchParams({ today: day, done: String(s.done), bonus: String(s.bonus) });
      if (s.doneIds.length) q.set("doneIds", s.doneIds.slice(-40).join(","));
      if (s.skippedIds.length) q.set("skippedIds", s.skippedIds.slice(-40).join(","));
      if (s.recent.length) q.set("recent", s.recent.slice(-2).join(","));
      const res = await fetchJson<FeedData>(`/api/me/feed?${q.toString()}`);
      if (!res.ok) {
        setError(res.error.message || "Couldn't load your list.");
        return;
      }
      setData(res.data);
      setList(res.data.items);
      shownAt.current = Date.now();
    },
    [day],
  );

  useEffect(() => {
    const s = readDay(day);
    startedAt.current = Date.now();
    shownAt.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(s);
    setHydrated(true);
    void load(s);
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [day, load, flush]);

  const current = list[0];
  const style = data?.sprout ?? DEFAULT_STYLE;
  const target = data?.goal.target ?? 0;

  const advance = (item: FeedItem, outcome: "done" | "skip" | "too_hard" | "too_easy") => {
    const base = { format: item.format, topicId: item.topicId, topicTitle: item.topicTitle };
    const dwellMs = Math.min(3_600_000, Date.now() - shownAt.current);
    if (outcome === "done") send({ ...base, kind: "finish", dwellMs, expectedMs: Math.max(1000, item.minutes * 60_000) });
    else if (outcome === "skip") send({ ...base, kind: "skip" });
    else send({ ...base, kind: outcome });
    const counted = outcome === "done";
    const next: DayState = {
      ...state,
      done: state.done + (counted ? 1 : 0),
      doneIds: counted ? [...state.doneIds, item.id] : state.doneIds,
      // "too hard / too easy / skip" all rest the item for today; the signal teaches the ranker for later
      skippedIds: counted ? state.skippedIds : [...state.skippedIds, item.id],
      recent: [...state.recent, item.format].slice(-4),
    };
    setState(next);
    writeDay(day, next);
    setLine(sproutReaction(outcome === "done" ? "done" : "skip", style));
    const rest = list.slice(1);
    setList(rest);
    shownAt.current = Date.now();
    if (rest.length === 0 || next.done >= (data?.goal.target ?? 0)) {
      flush();
      void load(next);
    }
  };

  const turnOn = async () => {
    setTurningOn(true);
    const res = await fetchJson<unknown>("/api/me/mirror", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personalise: true }) });
    setTurningOn(false);
    if (res.ok) void load(state);
  };

  const more = () => {
    const next = { ...state, bonus: state.bonus + 3 };
    setState(next);
    writeDay(day, next);
    void load(next);
  };

  if (error) {
    return (
      <Card className="space-y-3">
        <p className="text-sm text-muted-foreground" role="alert">{error}</p>
        <Button variant="outline" onClick={() => load(state)}>Try again</Button>
      </Card>
    );
  }
  if (!hydrated || !data) return <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" aria-busy="true" aria-label="Loading your list" />;

  const pct = target ? Math.min(100, Math.round((state.done / target) * 100)) : 0;
  const Icon = current ? ICON[current.format] : null;

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium">Today&apos;s goal</span>
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{Math.min(state.done, target)} of {target}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(state.done, target)} aria-label="Progress to today's goal">
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500 dark:bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {!data.personalised && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Personalisation is off. This list is ordered by what you need most (reviews due, weak topics, exams). Turn it on and Sunroot will also learn how you like to study.
          </p>
          <Button size="sm" onClick={turnOn} disabled={turningOn}>Turn on</Button>
        </Card>
      )}

      {current && Icon ? (
        <Card className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Icon className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
            <span>{FORMAT_WORD[current.format]}</span>
            <span aria-hidden>·</span>
            <span>about {current.minutes} min</span>
          </div>
          <h2 className="text-xl font-semibold leading-snug tracking-tight">{current.title}</h2>
          <p className="flex items-start gap-2 rounded-lg bg-brand-500/5 px-3 py-2 text-sm leading-relaxed text-foreground ring-1 ring-brand-500/20" data-testid="why-this">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
            <span><span className="font-semibold">Why this? </span>{current.why}</span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={current.href}
              onClick={() => send({ kind: "start", format: current.format, topicId: current.topicId, topicTitle: current.topicTitle })}
              className={cn(buttonVariants(), "sm:flex-1")}
            >
              Start
            </Link>
            <Button variant="secondary" className="sm:flex-1" onClick={() => advance(current, "done")}><Check className="h-4 w-4" aria-hidden /> I did this</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => advance(current, "skip")}><SkipForward className="h-4 w-4" aria-hidden /> Skip</Button>
            <Button variant="ghost" size="sm" onClick={() => advance(current, "too_hard")}><ChevronsUp className="h-4 w-4" aria-hidden /> Too hard</Button>
            <Button variant="ghost" size="sm" onClick={() => advance(current, "too_easy")}><ChevronsDown className="h-4 w-4" aria-hidden /> Too easy</Button>
          </div>
          {list.length > 1 && <p className="text-xs text-muted-foreground">{list.length - 1} more after this one.</p>}
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-3 py-10 text-center" data-testid="end-state">
          <Sprout pose="cheer" className="h-24 w-24" />
          <h2 className="text-xl font-semibold tracking-tight">{data.finished === "caught_up" && state.done < target ? "You're all caught up" : "You're done for today"}</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {data.finished === "caught_up" && state.done < target
              ? "Nothing is due and nothing needs work right now. Rest is part of learning. Check back tomorrow."
              : "That is enough for one day. Sleeping on it helps it stick. Come back tomorrow, or do a little more if you want to."}
          </p>
          {data.finished === "goal_met" && <Button variant="outline" onClick={more}>Do 3 more</Button>}
          <Link href="/my-learning-map" className="text-sm font-medium text-brand-600 underline-offset-4 hover:underline dark:text-brand-400">See what Sunroot knows about how you study</Link>
        </Card>
      )}

      {line && current && <p className="text-sm text-muted-foreground" aria-live="polite">Sprout: {line}</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">
        This list uses your study habits to choose and order what you see. It does not diagnose personality or ability, and what you need to learn always comes first.{" "}
        <Link href="/my-learning-map" className={cn("underline underline-offset-4")}>Change or switch off</Link>
      </p>
    </div>
  );
}
