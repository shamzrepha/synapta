"use client";

import React, { useRef, useState } from "react";
import { Camera, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useUserStore } from "@/lib/store/use-user-store";
import { AVATAR_PRESETS, presetAvatarUrl, checkUsername } from "@/lib/profile/avatars";
import { cn } from "@/lib/utils";

type Pick = { kind: "keep" } | { kind: "preset"; index: number } | { kind: "upload"; dataUrl: string };

/** Crops a chosen picture to a centred square and shrinks it so it stays small (about 20 to 40 KB). */
async function shrink(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}

/** Shown once to a new account (for example after Google sign-in): choose a handle and a picture. */
export function ProfileSetup() {
  const user = useUserStore((s) => s.user);
  const updateUser = useUserStore((s) => s.updateUser);
  const [handle, setHandle] = useState("");
  const [touched, setTouched] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user || user.profileSetup !== false) return null;

  const value = touched ? handle : user.username || "";
  const choice: Pick = pick ?? (user.photoURL ? { kind: "keep" } : { kind: "preset", index: 0 });
  const preview =
    choice.kind === "upload" ? uploadPreview : choice.kind === "preset" ? presetAvatarUrl(choice.index) : user.photoURL;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    try {
      const dataUrl = await shrink(f);
      setUploadPreview(dataUrl);
      setPick({ kind: "upload", dataUrl });
    } catch {
      setError("That file could not be read as a picture. Try a JPEG or PNG.");
    }
  };

  const save = async () => {
    setError("");
    const name = checkUsername(value);
    if (!name.ok) {
      setError(name.message);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: name.username, avatar: choice }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setError(j?.error?.message || "Couldn't save that. Try again.");
        return;
      }
      updateUser({ username: j.data.username, photoURL: j.data.photoURL ?? user.photoURL, profileSetup: true });
    } catch {
      setError("No connection. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-labelledby="profile-setup-title">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card text-foreground shadow-xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div>
          <h2 id="profile-setup-title" className="text-lg font-bold">Make it yours</h2>
          <p className="text-sm text-muted-foreground">Pick a username and a picture. Other learners will see them in rooms and on leaderboards.</p>
        </div>

        <div className="flex items-center gap-3">
          <Avatar name={user.displayName || "?"} photoURL={preview} size={64} />
          <div className="flex-1">
            <label htmlFor="setup-handle" className="text-xs font-semibold text-muted-foreground">Username</label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">@</span>
              <Input id="setup-handle" value={value} onChange={(e) => { setTouched(true); setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); }} maxLength={24} autoComplete="off" autoCapitalize="none" spellCheck={false} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Picture</p>
          <div className="grid grid-cols-6 gap-2">
            {AVATAR_PRESETS.map((_, i) => {
              const on = choice.kind === "preset" && choice.index === i;
              return (
                <button key={i} type="button" onClick={() => setPick({ kind: "preset", index: i })} aria-label={`Starter picture ${i + 1}`} aria-pressed={on} className={cn("relative rounded-full ring-2 ring-offset-2 ring-offset-card transition", on ? "ring-brand-600" : "ring-transparent")}>
                  <Avatar name="" photoURL={presetAvatarUrl(i)} size={44} />
                  {on && <Check className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-brand-600 p-0.5 text-white" />}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Upload a picture" />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Camera className="mr-1.5 h-4 w-4" /> Upload a picture
            </Button>
            {user.photoURL && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setPick({ kind: "keep" })} aria-pressed={choice.kind === "keep"}>
                Keep my current photo
              </Button>
            )}
          </div>
        </div>

        {error && <p role="alert" className="text-sm font-semibold text-rose-600">{error}</p>}
        <Button type="button" className="w-full" onClick={save} isLoading={busy} disabled={value.length < 3}>Continue</Button>
      </div>
    </div>
  );
}
