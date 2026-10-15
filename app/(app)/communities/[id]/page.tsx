"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, LogOut, UserMinus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { CommunityPostCard, type CPost } from "@/components/communities/post-card";
import { CommunityComposer } from "@/components/communities/post-composer";
import { asArray } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface Member {
  uid: string;
  role: string;
  displayName: string;
  photoURL: string | null;
}
interface Detail {
  id: string;
  name: string;
  kind: string;
  description: string;
  joinMode: "open" | "code";
  memberCount: number;
  role: "owner" | "member" | null;
  joinCode?: string;
  members: Member[];
}

export default function CommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<CPost[]>([]);
  const [tab, setTab] = useState<"feed" | "members">("feed");
  const [tag, setTag] = useState("");
  const [version, setVersion] = useState(0);

  const loadDetail = useCallback(async () => {
    const j = await fetch(`/api/communities/${id}`).then((r) => r.json()).catch(() => null);
    if (j?.ok) setDetail(j.data);
    else setError(j?.error?.message || "Couldn't open this community.");
  }, [id]);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/communities/${id}`)
      .then((r) => r.json())
      .then((j) => {
        if (ignore) return;
        if (j?.ok) setDetail(j.data);
        else setError(j?.error?.message || "Couldn't open this community.");
      })
      .catch(() => !ignore && setError("Couldn't open this community."));
    return () => {
      ignore = true;
    };
  }, [id, version]);

  const isMember = !!detail?.role;
  useEffect(() => {
    if (!isMember) return;
    let ignore = false;
    const qs = tag ? `?tag=${encodeURIComponent(tag)}` : "";
    fetch(`/api/communities/${id}/posts${qs}`)
      .then((r) => r.json())
      .then((j) => !ignore && j?.ok && setPosts(asArray<CPost>(j.data)))
      .catch(() => null);
    return () => {
      ignore = true;
    };
  }, [id, isMember, tag, version]);

  const onChange = useCallback((pid: string, patch: Partial<CPost> | null) => {
    setPosts((cur) => (patch === null ? cur.filter((p) => p.id !== pid) : cur.map((p) => (p.id === pid ? { ...p, ...patch } : p))));
    if (patch && "pinned" in patch) setVersion((v) => v + 1);
  }, []);

  const join = async () => {
    const j = await fetch("/api/communities/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ communityId: id }) }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setVersion((v) => v + 1);
    else toast({ title: "Couldn't join", description: j?.error?.message, variant: "destructive" });
  };

  const leave = async () => {
    if (!window.confirm("Leave this community?")) return;
    const j = await fetch(`/api/communities/${id}/members`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) router.push("/communities");
    else toast({ title: "Couldn't leave", description: j?.error?.message, variant: "destructive" });
  };

  const removeMember = async (uid: string) => {
    if (!window.confirm("Remove this member?")) return;
    const j = await fetch(`/api/communities/${id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid }) }).then((r) => r.json()).catch(() => null);
    if (j?.ok) loadDetail();
    else toast({ title: "Couldn't remove", description: j?.error?.message, variant: "destructive" });
  };

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <Link href="/communities" className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600">
          <ArrowLeft className="h-4 w-4" /> Communities
        </Link>
        <Card className="p-8 text-center text-sm text-slate-500">{error}</Card>
      </div>
    );
  }
  if (!detail) return <Skeleton className="mx-auto h-40 max-w-xl rounded-2xl" />;
  const isOwner = detail.role === "owner";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/communities" className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600">
        <ArrowLeft className="h-4 w-4" /> Communities
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{detail.name}</h1>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {detail.kind} · {detail.memberCount} member{detail.memberCount === 1 ? "" : "s"}
        </p>
        {detail.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{detail.description}</p>}
      </div>

      {!isMember ? (
        <Card className="space-y-3 p-6 text-center">
          <p className="text-sm text-slate-500">Join to see the feed and post.</p>
          <Button onClick={join}>Join community</Button>
        </Card>
      ) : (
        <>
          {isOwner && detail.joinCode && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(detail.joinCode!).catch(() => null);
                toast({ title: "Join code copied" });
              }}
              className="flex w-full items-center justify-between rounded-xl border border-dashed border-teal-500/50 bg-teal-500/5 px-3 py-2 text-sm"
            >
              <span>
                Join code: <b className="font-mono tracking-widest">{detail.joinCode}</b>
              </span>
              <Copy className="h-4 w-4 text-teal-600" />
            </button>
          )}
          <div className="flex gap-1">
            {(["feed", "members"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn("h-9 rounded-xl px-4 text-sm font-semibold capitalize", tab === t ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900")}
              >
                {t}
              </button>
            ))}
            <button onClick={leave} className="ml-auto flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-slate-500 hover:bg-rose-500/10 hover:text-rose-600">
              <LogOut className="h-3.5 w-3.5" /> Leave
            </button>
          </div>

          {tab === "feed" ? (
            <div className="space-y-3">
              <CommunityComposer communityId={id} isOwner={isOwner} onPosted={() => setVersion((v) => v + 1)} />
              {tag && (
                <button onClick={() => setTag("")} className="flex items-center gap-1 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300">
                  #{tag} <X className="h-3 w-3" />
                </button>
              )}
              {posts.length === 0 ? (
                <Card className="p-8 text-center text-sm text-slate-500">{tag ? `No posts tagged #${tag}.` : "No posts yet. Start the conversation!"}</Card>
              ) : (
                posts.map((p) => <CommunityPostCard key={p.id} communityId={id} post={p} isOwner={isOwner} onChange={onChange} onTag={setTag} />)
              )}
            </div>
          ) : (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800">
              {detail.members.map((m) => (
                <div key={m.uid} className="flex items-center gap-3 p-3">
                  <Avatar name={m.displayName} photoURL={m.photoURL} seed={m.uid} size={36} />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{m.displayName}</p>
                  {m.role === "owner" ? (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300">Owner</span>
                  ) : (
                    isOwner && (
                      <button onClick={() => removeMember(m.uid)} aria-label={`Remove ${m.displayName}`} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-600">
                        <UserMinus className="h-4 w-4" />
                      </button>
                    )
                  )}
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
