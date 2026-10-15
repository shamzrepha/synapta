"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Users, GraduationCap, BookOpen, Newspaper, Hash, NotebookPen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { timeAgo } from "@/lib/time";
import { asArray } from "@/lib/api/client";

interface Results {
  people: Array<{ uid: string; displayName: string; username: string | null; photoURL: string | null; level: number; role: string }>;
  classes: Array<{ id: string; title: string; subject: string; teacherName: string }>;
  topics: Array<{ classId: string; kcId: string; title: string; className: string }>;
  posts: Array<{ id: string; text: string; authorName: string; createdAt: string | null }>;
  tags: Array<{ tag: string; total: number }>;
  notebooks: Array<{ id: string; title: string; course: string }>;
}

function Section({ title, icon, children, count }: { title: string; icon: React.ReactNode; children: React.ReactNode; count: number }) {
  if (count === 0) return null;
  return (
    <Card className="p-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
        {icon} {title}
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">{children}</ul>
    </Card>
  );
}

const row = "flex items-center gap-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/60 rounded-lg px-2 -mx-2";

export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") || "";
    const t = setTimeout(() => setQ(initial), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      setLoading(true);
      router.replace(`/search?q=${encodeURIComponent(q.trim())}`);
      const j = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).catch(() => null);
      setResults(j?.ok ? j.data : null);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, router]);

  const total = results ? Object.values(results).reduce((n, arr) => n + arr.length, 0) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people, classes, topics, posts, #hashtags…"
          className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-12 pr-4 text-base focus:outline-none focus:border-teal-500"
        />
      </div>
      {loading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {!loading && results && total === 0 && <Card className="p-8 text-center text-sm text-slate-500">No results for “{q}”.</Card>}
      {!loading && results && (
        <div className="space-y-3">
          <Section title="People" icon={<Users className="h-3.5 w-3.5" />} count={results.people.length}>
            {results.people.map((p) => (
              <li key={p.uid}>
                <Link href={`/u/${p.username || p.uid}`} className={row}>
                  <Avatar name={p.displayName} photoURL={p.photoURL} seed={p.uid} size={36} level={p.level} />
                  <span>
                    <span className="block text-sm font-semibold">{p.displayName}</span>
                    {p.username && <span className="block text-xs text-slate-500">@{p.username}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </Section>
          <Section title="Hashtags" icon={<Hash className="h-3.5 w-3.5" />} count={results.tags.length}>
            {results.tags.map((t) => (
              <li key={t.tag}>
                <Link href={`/feed?tag=${t.tag}`} className={row}>
                  <span className="text-sm font-semibold">#{t.tag}</span>
                  <span className="text-xs text-slate-500 ml-auto">{t.total} posts</span>
                </Link>
              </li>
            ))}
          </Section>
          <Section title="Classes" icon={<GraduationCap className="h-3.5 w-3.5" />} count={results.classes.length}>
            {asArray(results.classes).map((c) => (
              <li key={c.id}>
                <Link href={`/classes/${c.id}`} className={row}>
                  <span>
                    <span className="block text-sm font-semibold">{c.title}</span>
                    <span className="block text-xs text-slate-500">
                      {c.subject}
                      {c.teacherName ? ` · ${c.teacherName}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </Section>
          <Section title="Topics" icon={<BookOpen className="h-3.5 w-3.5" />} count={results.topics.length}>
            {results.topics.map((t) => (
              <li key={`${t.classId}-${t.kcId}`}>
                <Link href={`/classes/${t.classId}/topics/${t.kcId}`} className={row}>
                  <span>
                    <span className="block text-sm font-semibold">{t.title}</span>
                    <span className="block text-xs text-slate-500">{t.className}</span>
                  </span>
                </Link>
              </li>
            ))}
          </Section>
          <Section title="Notebooks" icon={<NotebookPen className="h-3.5 w-3.5" />} count={results.notebooks.length}>
            {results.notebooks.map((n) => (
              <li key={n.id}>
                <Link href={`/notebook?nb=${n.id}`} className={row}>
                  <span>
                    <span className="block text-sm font-semibold">{n.title}</span>
                    {n.course && <span className="block text-xs text-slate-500">{n.course}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </Section>
          <Section title="Posts" icon={<Newspaper className="h-3.5 w-3.5" />} count={results.posts.length}>
            {results.posts.map((p) => (
              <li key={p.id}>
                <Link href={`/feed?post=${p.id}`} className={row}>
                  <span className="min-w-0">
                    <span className="block text-sm line-clamp-2">{p.text}</span>
                    <span className="block text-xs text-slate-500">
                      {p.authorName} · {timeAgo(p.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
