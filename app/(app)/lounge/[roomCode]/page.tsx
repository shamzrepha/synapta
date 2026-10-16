"use client";

import React, { useState, useEffect, use, useRef } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShareButton } from "@/components/social/share-button";
import { MakerSpace } from "@/components/studio/maker-space";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  Copy,
  Check,
  Users,
  Send,
  Sparkles,
  Flame,
  FileEdit,
  Eye,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { useUserStore } from "@/lib/store/use-user-store";
import { clientDb } from "@/lib/firebase/client";
import { doc, collection, onSnapshot, orderBy, query } from "firebase/firestore";

interface Message {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  createdAt: string;
}

interface Participant {
  uid: string;
  displayName: string;
  role: string;
  joinedAt?: string;
}

interface RoomData {
  roomCode: string;
  title: string;
  classId: string;
  kcId?: string | null;
  kcTitle?: string | null;
  hostId: string;
  hostName: string;
  scratchpad: string;
  designId?: string | null;
  participants: Participant[];
  messages: Message[];
}

export default function LoungeRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const { user } = useUserStore();
  const { toast } = useToast();

  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Scratchpad state
  const [scratchpadText, setScratchpadText] = useState("");
  const [scratchpadMode, setScratchpadMode] = useState<"edit" | "preview">("edit");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Peer Teaching Evidence Submission State
  const [submittingEvidence, setSubmittingEvidence] = useState(false);
  const [evidenceSubmitted, setEvidenceSubmitted] = useState(false);
  const [targetPeerUid, setTargetPeerUid] = useState("");

  // Initial room load
  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      try {
        const res = await fetch(`/api/lounge/rooms/${roomCode}`);
        const json = await res.json();
        if (!ignore && json.ok) {
          setRoom(json.data);
          setMessages(json.data.messages || []);
          setScratchpadText(json.data.scratchpad || "");
        }
      } catch {
        // Room not found or network error
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadInitial();
    return () => {
      ignore = true;
    };
  }, [roomCode, user?.displayName, user?.uid]);

  // Real-time Firestore onSnapshot listeners for room metadata and chat messages
  useEffect(() => {
    if (!roomCode) return;
    let unsubRoom = () => {};
    let unsubMessages = () => {};

    try {
      const db = clientDb();
      const roomRef = doc(db, "rooms", roomCode);
      const messagesRef = collection(db, "rooms", roomCode, "messages");
      const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"));

      // 1. Real-time room metadata & scratchpad listener
      unsubRoom = onSnapshot(
        roomRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setRoom((prev) => (prev ? { ...prev, ...data } : (data as RoomData)));
            if (data.scratchpad !== undefined && saveStatus !== "saving") {
              setScratchpadText(data.scratchpad);
            }
          }
        },
        (err) => {
          console.warn("Room listener notice:", err.message);
        }
      );

      // 2. Real-time messages listener
      unsubMessages = onSnapshot(
        messagesQuery,
        (snap) => {
          const loaded: Message[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              uid: data.uid,
              displayName: data.displayName || "Peer",
              text: data.text,
              createdAt: data.createdAt?.toDate
                ? data.createdAt.toDate().toISOString()
                : data.createdAt || new Date().toISOString(),
            };
          });
          setMessages(loaded);
          setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        },
        (err) => {
          console.warn("Messages listener notice:", err.message);
        }
      );
    } catch (err) {
      console.warn("Realtime Firestore setup notice:", err);
    }

    return () => {
      unsubRoom();
      unsubMessages();
    };
  }, [roomCode, saveStatus]);

  const handleManualRefresh = async () => {
    try {
      const res = await fetch(`/api/lounge/rooms/${roomCode}`);
      const json = await res.json();
      if (json.ok) {
        setRoom(json.data);
        if (json.data.messages) setMessages(json.data.messages);
      }
    } catch {
      // Ignore background refresh errors
    }
  };

  // Copy Room Code Helper
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast({ title: "Copied!", description: `Room code ${roomCode} copied to clipboard.` });
  };

  // Send Chat Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || sendingMsg) return;

    const textToSend = messageInput.trim();
    setMessageInput("");
    setSendingMsg(true);

    // Optimistic message append
    const optMsg: Message = {
      id: `opt-${Date.now()}`,
      uid: user?.uid || "self",
      displayName: user?.displayName || "You",
      text: textToSend,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optMsg]);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await fetch(`/api/lounge/rooms/${roomCode}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSend }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
      }
    } catch {
      // Local optimistic retains
    } finally {
      setSendingMsg(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  // Debounced Scratchpad Auto-Save
  const handleScratchpadChange = (newText: string) => {
    setScratchpadText(newText);
    setSaveStatus("unsaved");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch(`/api/lounge/rooms/${roomCode}/scratchpad`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scratchpad: newText }),
        });
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 1500);
  };

  const insertFormula = (formula: string) => {
    const updated = scratchpadText + "\n\n" + formula;
    handleScratchpadChange(updated);
  };

  // Credit Peer Explanation Evidence (+40 XP, Omega = 2.0 to peer)
  const handleCreditPeer = async (peerUidToCredit: string) => {
    if (!room || submittingEvidence || !peerUidToCredit) return;

    setSubmittingEvidence(true);
    try {
      const res = await fetch(`/api/lounge/rooms/${roomCode}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUid: peerUidToCredit,
        }),
      });

      const json = await res.json();
      if (json.ok) {
        setEvidenceSubmitted(true);

        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
        });

        toast({
          title: "🎉 PEER EXPLANATION CREDITED!",
          description: "+40 XP awarded to peer! BKT Cognitive Twin accelerated with Omega = 2.0 weighting.",
          variant: "success",
        });
      } else {
        toast({
          title: "Credit Notice",
          description: json.error?.message || "Failed to credit peer.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Credit Notice",
        description: "Failed to connect to room server.",
        variant: "destructive",
      });
    } finally {
      setSubmittingEvidence(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[600px] rounded-2xl" />
          <Skeleton className="h-[600px] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="text-center py-20 space-y-4">
        <h2 className="text-2xl font-bold">Study Room Not Found</h2>
        <p className="text-xs text-slate-500">The room code {roomCode} may be expired or invalid.</p>
        <Link href="/lounge">
          <Button>Back to Lounge Hub</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Breadcrumb & Room Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            href="/lounge"
            className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Leave Room
          </Link>

          <span className="text-slate-300 dark:text-slate-700">|</span>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
              {room.roomCode}
            </span>
            <button
              onClick={copyRoomCode}
              title="Copy Room Code"
              className="h-7 w-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Presence Avatars */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1">In Session:</span>
          <div className="flex -space-x-2 overflow-hidden">
            {room.participants.map((p, i) => (
              <div
                key={i}
                title={`${p.displayName} (${p.role})`}
                className="inline-block h-7 w-7 rounded-full ring-2 ring-white dark:ring-slate-900 bg-teal-600 text-white text-[11px] font-bold flex items-center justify-center"
              >
                {p.displayName[0]?.toUpperCase() || "S"}
              </div>
            ))}
          </div>
          <Badge variant="emerald" className="text-[10px] ml-1">
            Live
          </Badge>
        </div>
      </div>

      {/* Room Title & Topic Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          {room.kcTitle && (
            <Badge variant="outline" className="text-xs">
              {room.kcTitle}
            </Badge>
          )}
          <Badge variant="amber" className="text-xs">
            Host: {room.hostName}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {room.title}
          </h1>
          <ShareButton label="Invite" item={{ type: "room", id: roomCode, title: room.title, subtitle: `Study room · code ${roomCode}`, href: `/lounge/${roomCode}`, emoji: "🚪" }} />
        </div>
      </div>

      {/* 2-PANE WORKSPACE: LEFT CHAT & EVIDENCE, RIGHT COLLABORATIVE SCRATCHPAD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: CHAT & PEER TEACHING VERIFICATION (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <MakerSpace roomCode={roomCode} designId={room.designId} />

          {/* Peer Explanation Evidence Card */}
          <Card className="p-4 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/20 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Flame className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100">
                    Peer Explanation Verification
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Did a peer explain a concept clearly? Credit them to accelerate their Cognitive Twin.
                  </p>
                </div>
              </div>
              <Badge variant="amber" className="text-[10px] shrink-0">
                +40 XP &bull; &Omega;=2.0
              </Badge>
            </div>

            {room.participants.filter((p) => p.uid !== user?.uid).length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">
                Waiting for study partners to join this room...
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={targetPeerUid}
                    onChange={(e) => setTargetPeerUid(e.target.value)}
                    className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Select peer who explained...</option>
                    {room.participants
                      .filter((p) => p.uid !== user?.uid)
                      .map((p) => (
                        <option key={p.uid} value={p.uid}>
                          {p.displayName}
                        </option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    onClick={() => handleCreditPeer(targetPeerUid)}
                    isLoading={submittingEvidence}
                    disabled={!targetPeerUid || evidenceSubmitted}
                    className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                  >
                    {evidenceSubmitted ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Credited!
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> Credit (+40 XP)
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Realtime Room Chat Thread */}
          <Card className="h-[520px] flex flex-col border-slate-200 dark:border-slate-800">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span>Room Discussion</span>
              </div>
              <button
                onClick={() => handleManualRefresh()}
                title="Refresh messages"
                className="text-slate-400 hover:text-slate-600"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const isSelf = m.uid === user?.uid || m.displayName === user?.displayName;
                const isSystem = m.uid === "system";

                if (isSystem) {
                  return (
                    <div key={m.id} className="text-center py-1">
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 italic">
                        {m.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}
                  >
                    <span className="text-[10px] text-slate-400 font-semibold mb-0.5 px-1">
                      {isSelf ? "You" : m.displayName}
                    </span>
                    <div
                      className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                        isSelf
                          ? "bg-teal-600 text-white shadow-sm"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Message Input Form */}
            <form onSubmit={handleSendMessage} className="p-2.5 border-t border-slate-100 dark:border-slate-800 flex gap-2">
              <Input
                placeholder="Type a message or derivation note..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                disabled={sendingMsg}
                className="h-9 text-xs"
              />
              <Button size="sm" type="submit" disabled={!messageInput.trim() || sendingMsg} className="h-9 px-3">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: SHARED COLLABORATIVE SCRATCHPAD (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="h-[620px] flex flex-col border-slate-200 dark:border-slate-800">
            {/* Scratchpad Header with Status & Mode Toggle */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <FileEdit className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Shared Collaborative Scratchpad
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  ({saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Synced" : "Unsaved edits"})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-white dark:bg-slate-900">
                  <button
                    onClick={() => setScratchpadMode("edit")}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                      scratchpadMode === "edit"
                        ? "bg-teal-600 text-white"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Markdown
                  </button>
                  <button
                    onClick={() => setScratchpadMode("preview")}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                      scratchpadMode === "preview"
                        ? "bg-teal-600 text-white"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <Eye className="h-3 w-3 inline mr-1" /> Preview
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Equation Pills Bar */}
            <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto text-[11px]">
              <span className="text-[10px] text-slate-400 font-semibold mr-1 shrink-0">Insert:</span>
              <button
                onClick={() => insertFormula("$$I = \\frac{V}{R}$$")}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-mono text-[10px] shrink-0"
              >
                Ohm&apos;s Law
              </button>
              <button
                onClick={() => insertFormula("$$P = V \\cdot I = I^2 R = \\frac{V^2}{R}$$")}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-mono text-[10px] shrink-0"
              >
                Joule Power
              </button>
              <button
                onClick={() => insertFormula("$$f_c = \\frac{1}{2\\pi R C}$$")}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-mono text-[10px] shrink-0"
              >
                RC Cutoff
              </button>
              <button
                onClick={() => insertFormula("$$\\text{Sum} = A \\oplus B, \\quad \\text{Carry} = A \\cdot B$$")}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-mono text-[10px] shrink-0"
              >
                Half Adder
              </button>
            </div>

            {/* Scratchpad Body (Editor vs Preview) */}
            <div className="flex-1 overflow-y-auto p-4">
              {scratchpadMode === "edit" ? (
                <textarea
                  value={scratchpadText}
                  onChange={(e) => handleScratchpadChange(e.target.value)}
                  placeholder="Collaborate on notes, derivations, and formulas here in real time..."
                  className="w-full h-full min-h-[460px] p-2 bg-transparent text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none resize-none leading-relaxed"
                />
              ) : (
                <div className="text-xs leading-relaxed">
                  <MarkdownRenderer content={scratchpadText || "*Scratchpad is empty.*"} />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
