"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Sparkles,
  ArrowRight,
  Plus,
  LogIn,
  CheckCircle2,
  BrainCircuit,
  X,
  Search,
  Flame,
} from "lucide-react";
import { PeerMatch } from "@/app/api/lounge/match/route";

interface RoomSummary {
  roomCode: string;
  title: string;
  classId: string;
  kcId?: string | null;
  kcTitle?: string | null;
  hostId: string;
  hostName: string;
  participantCount: number;
  isMember: boolean;
  updatedAt: string | null;
}

interface ClassOption {
  id: string;
  title: string;
  kcs?: { id: string; title: string }[];
}

export default function LoungeHubPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  // Join by code state
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joiningCode, setJoiningCode] = useState(false);

  // Match Peer Modal State
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedKcId, setSelectedKcId] = useState("");
  const [classKcs, setClassKcs] = useState<{ id: string; title: string }[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [matchedPeers, setMatchedPeers] = useState<PeerMatch[]>([]);
  const [matchKcTitle, setMatchKcTitle] = useState("");

  // Create Room Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomClassId, setNewRoomClassId] = useState("");
  const [newRoomKcId, setNewRoomKcId] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Load Rooms & Enrolled Classes
  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const [roomsRes, classesRes] = await Promise.all([
          fetch("/api/lounge/rooms"),
          fetch("/api/classes?scope=mine"),
        ]);

        const roomsJson = await roomsRes.json();
        const classesJson = await classesRes.json();

        if (!ignore) {
          if (roomsJson.ok) setRooms(roomsJson.data || []);
          if (classesJson.ok) setClasses(classesJson.data || []);
        }
      } catch {
        if (!ignore) {
          setRooms([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  // Fetch KCs when class is selected in matching modal
  const handleSelectClassForMatch = async (classId: string) => {
    setSelectedClassId(classId);
    setSelectedKcId("");
    setMatchedPeers([]);
    if (!classId) return;

    try {
      const res = await fetch(`/api/classes/${classId}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data.kcs)) {
        setClassKcs(json.data.kcs);
        if (json.data.kcs.length > 0) {
          setSelectedKcId(json.data.kcs[0].id);
        }
      }
    } catch {
      setClassKcs([]);
    }
  };

  // Run BKT Peer Matching Algorithm
  const handleRunMatch = async () => {
    if (!selectedClassId || !selectedKcId) {
      toast({ title: "Incomplete", description: "Select a class and topic to match peers.", variant: "amber" });
      return;
    }

    setMatchingLoading(true);
    try {
      const res = await fetch("/api/lounge/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: selectedClassId, kcId: selectedKcId }),
      });
      const json = await res.json();
      if (json.ok) {
        setMatchedPeers(json.data.matches || []);
        setMatchKcTitle(json.data.kcTitle || "Topic");
        if ((json.data.matches || []).length === 0) {
          toast({
            title: "No Available Peers",
            description: "No other students enrolled in this class yet. You can still create an open room!",
            variant: "default",
          });
        }
      }
    } catch {
      toast({ title: "Matching Error", description: "Could not query peer digital twins.", variant: "destructive" });
    } finally {
      setMatchingLoading(false);
    }
  };

  // Create room and pair with peer
  const handleCreateAndPair = async (peer?: PeerMatch) => {
    const classId = selectedClassId || classes[0]?.id || "default";
    const kcTitle = matchKcTitle || "Collaborative Concept Review";
    const title = peer
      ? `Peer Study: ${peer.displayName} & You`
      : `${kcTitle} Study Session`;

    try {
      const res = await fetch("/api/lounge/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          classId,
          kcId: selectedKcId || undefined,
          kcTitle,
          invitedUids: peer ? [peer.uid] : [],
        }),
      });

      const json = await res.json();
      if (json.ok) {
        toast({ title: "Room Created", description: `Joined ${json.data.roomCode}`, variant: "success" });
        router.push(`/lounge/${json.data.roomCode}`);
      }
    } catch {
      toast({ title: "Creation Failed", description: "Could not create study lounge room.", variant: "destructive" });
    }
  };

  // Join Room by Code
  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCodeInput.trim().toUpperCase();
    if (!clean) return;

    setJoiningCode(true);
    router.push(`/lounge/${clean}`);
  };

  // Create Custom Room Submit
  const handleCreateCustomRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim() || !newRoomClassId) {
      toast({ title: "Missing Fields", description: "Enter a title and select a class.", variant: "destructive" });
      return;
    }

    setCreatingRoom(true);
    try {
      const res = await fetch("/api/lounge/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newRoomTitle.trim(),
          classId: newRoomClassId,
          kcId: newRoomKcId || undefined,
        }),
      });

      const json = await res.json();
      if (json.ok) {
        toast({ title: "Room Created!", description: `Room Code: ${json.data.roomCode}`, variant: "success" });
        router.push(`/lounge/${json.data.roomCode}`);
      }
    } catch {
      toast({ title: "Error", description: "Failed to create study room.", variant: "destructive" });
    } finally {
      setCreatingRoom(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Peer Learning Hub</Badge>
            <Badge variant="amber" className="text-xs">BKT Omega = 2.0 (+40 XP)</Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
            Peer Study Lounge
          </h1>
          <p className="text-xs text-slate-500">
            Collaborate in real time, pair with high-mastery peers, and earn +40 XP through verified peer teaching.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setMatchModalOpen(true);
              if (classes.length > 0 && !selectedClassId) {
                handleSelectClassForMatch(classes[0].id);
              }
            }}
            className="text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-300" />
            Find Peer Match
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Create Room
          </Button>
        </div>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Intelligent BKT Matchmaker */}
        <Card className="p-5 border-teal-500/30 bg-teal-50/30 dark:bg-teal-950/20 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="h-10 w-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Cognitive Twin Matchmaker
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Struggling with a topic? Our engine searches for classmates with <strong>P(L) &ge; 85%</strong> to guide you through derivations.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setMatchModalOpen(true);
              if (classes.length > 0 && !selectedClassId) {
                handleSelectClassForMatch(classes[0].id);
              }
            }}
            className="text-xs w-full"
          >
            Launch Matchmaker
          </Button>
        </Card>

        {/* Card 2: Join by Room Code */}
        <Card className="p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <LogIn className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Join Existing Room
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Have a code from a classmate (e.g. <code>SYN-E742</code>)? Enter it to jump directly into their collaborative session.
            </p>
          </div>
          <form onSubmit={handleJoinByCode} className="flex gap-2">
            <Input
              placeholder="e.g. SYN-E742"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              className="text-xs font-mono h-9 uppercase"
            />
            <Button size="sm" type="submit" disabled={!joinCodeInput.trim() || joiningCode} className="h-9 px-3">
              Join
            </Button>
          </form>
        </Card>

        {/* Card 3: Peer Teaching Evidence Rewards */}
        <Card className="p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Flame className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Peer Teaching XP Bonus
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Explaining a concept to a classmate is the highest form of learning. Earn <strong>+40 XP</strong> and double your BKT transition rate (\(\Omega = 2.0\)).
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Real-time peer verification supported
          </div>
        </Card>
      </div>

      {/* Active Study Rooms List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Active Study Rooms ({rooms.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Click any room to join the collaborative scratchpad & chat
          </span>
        </div>

        {rooms.length === 0 ? (
          <Card className="p-12 text-center space-y-3 border border-dashed">
            <Users className="h-8 w-8 text-slate-400 mx-auto" />
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              No active study rooms right now
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Be the first to open a study room or launch the peer matchmaker to invite a study buddy.
            </p>
            <Button size="sm" onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Open a Study Room
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rooms.map((room) => (
              <Card
                key={room.roomCode}
                className="hover:border-teal-500 transition-all group flex flex-col justify-between"
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                          {room.roomCode}
                        </span>
                        {room.kcTitle && (
                          <Badge variant="outline" className="text-[10px]">
                            {room.kcTitle}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                        {room.title}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Host: <span className="font-semibold text-slate-700 dark:text-slate-300">{room.hostName}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                      <Users className="h-3.5 w-3.5 text-teal-500" />
                      <span>{room.participantCount} Active</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {room.isMember ? "You are a participant" : "Open to join"}
                    </span>
                    <Link href={`/lounge/${room.roomCode}`}>
                      <Button size="sm" className="text-xs h-8">
                        Enter Room <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* MATCH PEER MODAL */}
      {matchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Intelligent Peer Matchmaker
                </h3>
              </div>
              <button
                onClick={() => setMatchModalOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Selection Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Class
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => handleSelectClassForMatch(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Select enrolled class...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Focus Knowledge Component
                </label>
                <select
                  value={selectedKcId}
                  onChange={(e) => setSelectedKcId(e.target.value)}
                  disabled={classKcs.length === 0}
                  className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-teal-500"
                >
                  {classKcs.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              size="sm"
              onClick={handleRunMatch}
              isLoading={matchingLoading}
              disabled={!selectedClassId || !selectedKcId}
              className="w-full text-xs"
            >
              <Search className="h-3.5 w-3.5 mr-1" /> Find High-Mastery Peers for this Concept
            </Button>

            {/* Match Results */}
            {matchedPeers.length > 0 && (
              <div className="space-y-3 pt-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Matched Peer Mentors & Study Partners:
                </span>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {matchedPeers.map((peer) => (
                    <div
                      key={peer.uid}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between hover:border-teal-500 transition-all bg-slate-50/50 dark:bg-slate-900/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold flex items-center justify-center text-xs">
                          {peer.displayName[0]?.toUpperCase() || "S"}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-xs text-slate-900 dark:text-slate-100">
                              {peer.displayName}
                            </p>
                            <Badge
                              variant={peer.isMastered ? "emerald" : peer.pL >= 0.7 ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {peer.masteryPercentage}% P(L)
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-500">{peer.matchReason}</p>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleCreateAndPair(peer)}
                        className="text-xs h-8"
                      >
                        Pair & Start Room
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE CUSTOM ROOM MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                Create Study Lounge Room
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomRoom} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Session Title
                </label>
                <Input
                  placeholder="e.g. AC Filter Network Derivations"
                  value={newRoomTitle}
                  onChange={(e) => setNewRoomTitle(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Course
                </label>
                <select
                  value={newRoomClassId}
                  onChange={(e) => setNewRoomClassId(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Select course...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Focus Concept / Topic (Optional)
                </label>
                <Input
                  placeholder="e.g. Ohm's Law or RC Cutoff"
                  value={newRoomKcId}
                  onChange={(e) => setNewRoomKcId(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(false)} type="button">
                  Cancel
                </Button>
                <Button size="sm" type="submit" isLoading={creatingRoom} disabled={!newRoomTitle.trim() || !newRoomClassId}>
                  Open Room
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
