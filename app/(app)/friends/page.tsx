"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/lib/store/use-user-store";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  UserPlus,
  MessageSquare,
  Search,
  Send,
  Check,
  X,
  UserCheck,
  Clock,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FriendItem {
  uid: string;
  displayName: string;
  username: string;
  photoURL: string | null;
  email: string | null;
  since: string | null;
}

interface FriendRequestItem {
  id: string;
  fromUid?: string;
  fromName?: string;
  fromUsername?: string;
  toUid?: string;
  toName?: string;
  toUsername?: string;
  createdAt: string | null;
}

interface SearchUserItem {
  uid: string;
  displayName: string;
  username: string;
  email: string;
  photoURL: string | null;
  role: string;
  friendshipStatus: "friends" | "request_sent" | "request_received" | "none";
  requestId?: string;
}

interface DirectMessage {
  id: string;
  senderUid: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export default function FriendsPage() {
  const router = useRouter();
  const { user } = useUserStore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"chat" | "add">("chat");

  // Friends & Requests state
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);

  // Active chat state
  const [selectedFriend, setSelectedFriend] = useState<FriendItem | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUserItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestingUid, setRequestingUid] = useState<string | null>(null);

  // Load friends and requests
  const loadFriendsData = useCallback(async () => {
    try {
      const res = await fetch("/api/friends");
      const json = await res.json();
      if (json.ok) {
        setFriends(json.data.friends || []);
        setIncomingRequests(json.data.incomingRequests || []);
        setOutgoingRequests(json.data.outgoingRequests || []);
      }
    } catch {
      // offline/error
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const res = await fetch("/api/friends");
        const json = await res.json();
        if (!ignore && json.ok) {
          setFriends(json.data.friends || []);
          setIncomingRequests(json.data.incomingRequests || []);
          setOutgoingRequests(json.data.outgoingRequests || []);
          if (json.data.friends?.length > 0) {
            // Conversations now live in Messages; this page manages friends
          }
        }
      } catch {
        // ignore
      } finally {
        if (!ignore) setLoadingFriends(false);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  // Polling messages for selected friend
  useEffect(() => {
    if (!selectedFriend) return;
    let ignore = false;

    async function fetchInitialMessages() {
      try {
        const res = await fetch(`/api/messages/${selectedFriend?.uid}`);
        const json = await res.json();
        if (!ignore && json.ok) {
          setMessages(json.data.messages || []);
        }
      } catch {
        // ignore
      } finally {
        if (!ignore) setLoadingMessages(false);
      }
    }

    fetchInitialMessages();

    const interval = setInterval(() => {
      fetch(`/api/messages/${selectedFriend?.uid}`)
        .then((r) => r.json())
        .then((j) => {
          if (!ignore && j.ok) setMessages(j.data.messages || []);
        })
        .catch(() => {});
    }, 3000);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [selectedFriend]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send Direct Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedFriend || sendingMsg) return;

    const textToSend = messageInput.trim();
    setMessageInput("");
    setSendingMsg(true);

    try {
      const res = await fetch(`/api/messages/${selectedFriend.uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSend }),
      });
      const json = await res.json();
      if (json.ok && json.data?.message) {
        setMessages((prev) => [...prev, json.data.message]);
      } else {
        toast({
          title: "Message Failed",
          description: json.error?.message || "Could not send message.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection Error",
        description: "Failed to send message.",
        variant: "destructive",
      });
    } finally {
      setSendingMsg(false);
    }
  };

  // Search Users
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;

    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const json = await res.json();
      if (json.ok) {
        setSearchResults(json.data.users || []);
      } else {
        toast({
          title: "Search Error",
          description: json.error?.message || "User search failed.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection Error",
        description: "Failed to perform user search.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  // Send Friend Request
  const handleSendRequest = async (targetUid: string) => {
    setRequestingUid(targetUid);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUid }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: "Request Sent!",
          description: "Friend request sent successfully.",
          variant: "success",
        });
        setSearchResults((prev) =>
          prev.map((u) => (u.uid === targetUid ? { ...u, friendshipStatus: "request_sent" } : u))
        );
        loadFriendsData();
      } else {
        toast({
          title: "Request Error",
          description: json.error?.message || "Could not send friend request.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Network error sending friend request.",
        variant: "destructive",
      });
    } finally {
      setRequestingUid(null);
    }
  };

  // Accept or Decline Request
  const handleRespondRequest = async (requestId: string, action: "accept" | "decline") => {
    try {
      const res = await fetch("/api/friends/request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const json = await res.json();
      if (json.ok) {
        toast({
          title: action === "accept" ? "Friend Added!" : "Request Declined",
          description: json.data?.message,
          variant: action === "accept" ? "success" : "default",
        });
        loadFriendsData();
      } else {
        toast({
          title: "Error",
          description: json.error?.message || "Failed to process request.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to respond to request.",
        variant: "destructive",
      });
    }
  };

  // Remove Friend
  const handleRemoveFriend = async (friendUid: string) => {
    if (!confirm("Are you sure you want to remove this friend?")) return;
    try {
      const res = await fetch(`/api/friends/${friendUid}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.ok) {
        toast({ title: "Friend Removed", variant: "default" });
        setSelectedFriend(null);
        loadFriendsData();
      }
    } catch {
      toast({ title: "Error removing friend", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Users className="h-7 w-7 text-teal-600 dark:text-teal-400" />
            Friends & Direct Messaging
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Connect with peers, collaborate on syllabus topics, and chat in real time.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
          <button
            onClick={() => setActiveTab("chat")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
              activeTab === "chat"
                ? "bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Messages ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab("add")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 relative",
              activeTab === "add"
                ? "bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            )}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Friends
            {incomingRequests.length > 0 && (
              <span className="ml-1 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: DIRECT MESSAGES */}
      {activeTab === "chat" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[580px]">
          {/* Left Column: Friends List */}
          <Card className="lg:col-span-1 flex flex-col h-[600px] border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Users className="h-4 w-4 text-teal-600" />
                  Your Friends ({friends.length})
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveTab("add")}
                  className="text-xs h-7 px-2 text-teal-600"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-2 flex-1 overflow-y-auto space-y-1">
              {loadingFriends ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              ) : friends.length === 0 ? (
                <div className="text-center py-16 px-4 space-y-3 text-slate-500">
                  <Users className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700" />
                  <p className="text-xs">No friends added yet.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveTab("add")}
                    className="text-xs"
                  >
                    Find Peers to Add
                  </Button>
                </div>
              ) : (
                friends.map((f) => {
                  const isSelected = selectedFriend?.uid === f.uid;
                  return (
                    <button
                      key={f.uid}
                      onClick={() => router.push(`/messages?with=${f.uid}`)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all",
                        isSelected
                          ? "bg-teal-500/10 dark:bg-teal-500/20 text-teal-900 dark:text-teal-200 font-medium"
                          : "hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300"
                      )}
                    >
                      <div className="relative">
                        <div className="h-10 w-10 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                          {f.displayName.charAt(0).toUpperCase()}
                        </div>
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold truncate">{f.displayName}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          @{f.username || f.displayName.toLowerCase().replace(/\s+/g, "_")}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Right Column: Active Conversation */}
          <Card className="lg:col-span-2 flex flex-col h-[600px] border-slate-200 dark:border-slate-800">
            {selectedFriend ? (
              <>
                {/* Chat Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                      {selectedFriend.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {selectedFriend.displayName}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        @{selectedFriend.username || "learner"} &bull; Real-time messaging
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveFriend(selectedFriend.uid)}
                    title="Remove Friend"
                    className="text-xs text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Message Bubble Thread */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingMessages ? (
                    <div className="space-y-3">
                      <Skeleton className="h-12 w-2/3 rounded-2xl" />
                      <Skeleton className="h-12 w-1/2 rounded-2xl ml-auto" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-24 space-y-2 text-slate-400">
                      <MessageSquare className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700" />
                      <p className="text-xs font-medium">No messages yet.</p>
                      <p className="text-[11px] text-slate-500">
                        Say hi to start collaborating on concepts and labs!
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isMe = m.senderUid === user?.uid;
                      return (
                        <div
                          key={m.id}
                          className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
                        >
                          <div
                            className={cn(
                              "max-w-md px-3.5 py-2.5 rounded-2xl text-xs break-words shadow-sm",
                              isMe
                                ? "bg-teal-600 text-white rounded-br-xs"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-xs"
                            )}
                          >
                            <p className="leading-relaxed">{m.text}</p>
                          </div>
                          <span className="text-[9px] text-slate-400 mt-1 px-1">
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Message Input Box */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-white dark:bg-slate-950"
                >
                  <Input
                    type="text"
                    placeholder={`Message ${selectedFriend.displayName}...`}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    className="flex-1 text-xs h-10 rounded-xl"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!messageInput.trim() || sendingMsg}
                    className="h-10 px-4 rounded-xl"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 p-8 text-center space-y-3 text-slate-500">
                <MessageSquare className="h-12 w-12 text-slate-300 dark:text-slate-700" />
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  Chat lives in Messages now
                </h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Tap a friend to open your conversation — with group chats, reactions, shared study rooms and more.
                </p>
                <Button size="sm" onClick={() => router.push("/messages")}>Open Messages</Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: ADD FRIENDS & REQUESTS */}
      {activeTab === "add" && (
        <div className="space-y-6">
          {/* Incoming Requests Section (If Any) */}
          {incomingRequests.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <UserPlus className="h-4 w-4" />
                  Incoming Friend Requests ({incomingRequests.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Peers who have invited you to connect and message.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-xs">
                        {req.fromName?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                          {req.fromName}
                        </h4>
                        <p className="text-[10px] text-slate-400">@{req.fromUsername || "learner"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleRespondRequest(req.id, "accept")}
                        className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRespondRequest(req.id, "decline")}
                        className="text-xs h-8 text-rose-500 hover:bg-rose-50"
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Outgoing Pending Requests Section */}
          {outgoingRequests.length > 0 && (
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Pending Sent Requests ({outgoingRequests.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Invitations you have sent awaiting peer response.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {outgoingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center text-xs">
                        {req.toName?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                          {req.toName}
                        </h4>
                        <p className="text-[10px] text-slate-400">@{req.toUsername || "learner"}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      Pending
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Search Card */}
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Search className="h-5 w-5 text-teal-600" />
                Find Peers by Username or Email
              </CardTitle>
              <CardDescription className="text-xs">
                Search for classmates, teachers, or study partners to add them as friends.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search by @username or email address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 text-xs h-10 rounded-xl"
                  />
                </div>
                <Button type="submit" isLoading={searching} className="h-10 px-5 rounded-xl">
                  Search
                </Button>
              </form>

              {/* Search Results */}
              <div className="space-y-2 pt-2">
                {searching ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((u) => (
                    <div
                      key={u.uid}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                          {u.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {u.displayName}
                            </span>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {u.role}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-400">@{u.username}</p>
                        </div>
                      </div>

                      {/* Action Button depending on friendship status */}
                      <div>
                        {u.friendshipStatus === "friends" ? (
                          <Badge variant="emerald" className="text-xs flex items-center gap-1">
                            <UserCheck className="h-3 w-3" /> Friends
                          </Badge>
                        ) : u.friendshipStatus === "request_sent" ? (
                          <Badge variant="secondary" className="text-xs flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Request Sent
                          </Badge>
                        ) : u.friendshipStatus === "request_received" ? (
                          <Button
                            size="sm"
                            onClick={() => handleRespondRequest(u.requestId!, "accept")}
                            className="text-xs h-8 bg-emerald-600 text-white"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" /> Accept
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleSendRequest(u.uid)}
                            isLoading={requestingUid === u.uid}
                            className="text-xs h-8"
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1" /> Add Friend
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : searchQuery.trim().length >= 2 ? (
                  <div className="text-center py-10 text-slate-500 space-y-1">
                    <p className="text-xs font-semibold">No users found matching &quot;{searchQuery}&quot;</p>
                    <p className="text-[11px] text-slate-400">Check the spelling of their username or email.</p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
