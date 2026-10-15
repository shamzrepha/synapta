import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannel } from "@/lib/live/server";
import { clampConfig, normalizeCode, PRESENCE_MS } from "@/lib/focus/timer";
import { loadRoom, loadMembers, roomRef, MAX_MEMBERS } from "@/lib/focus/server";

export const runtime = "nodejs";

async function stateFor(code: string, uid: string) {
  const room = await loadRoom(code);
  const now = Date.now();
  const { members, raw } = await loadMembers(code, room.ownerUid, now);
  const me = raw.find((m) => m.id === uid);
  return {
    serverNow: now,
    room: {
      code,
      title: room.title,
      ownerUid: room.ownerUid,
      ownerName: room.ownerName,
      focusMin: room.focusMin,
      breakMin: room.breakMin,
      anchorMs: room.anchorMs ?? null,
    },
    members,
    joined: !!me,
    canControl: !!me && (uid === room.ownerUid || !members.some((m) => m.isOwner && m.present)),
    me: me ? { doing: String(me.doing || "") } : null,
  };
}

function parseCode(raw: string): string {
  const code = normalizeCode(raw);
  if (!code) throw new ApiError(400, "VALIDATION", "Room codes are 6 letters or digits.");
  return code;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const caller = await requireUser(req);
    const code = parseCode((await params).code);
    return NextResponse.json({ ok: true, data: await stateFor(code, caller.uid) });
  } catch (error) {
    return handleAuthError(error);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("join"), doing: z.string().trim().max(80).optional() }),
  z.object({ action: z.literal("heartbeat"), doing: z.string().trim().max(80).optional() }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("stop") }),
  z.object({ action: z.literal("settings"), focusMin: z.number().int(), breakMin: z.number().int() }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "focus_room", limit: 90, windowMs: 60_000 });
    if (limited) return limited;
    const code = parseCode((await params).code);
    const body = await parseJson(req, actionSchema);
    const room = await loadRoom(code);
    const now = Date.now();
    const memberRef = roomRef(code).collection("members").doc(caller.uid);
    let bump = true;

    switch (body.action) {
      case "join": {
        const existing = await memberRef.get();
        if (!existing.exists) {
          const count = (await roomRef(code).collection("members").limit(MAX_MEMBERS + 1).get()).size;
          if (count >= MAX_MEMBERS) throw new ApiError(409, "ROOM_FULL", "This room is full.");
        }
        const user = (await adminDb().collection("users").doc(caller.uid).get()).data();
        await memberRef.set(
          {
            displayName: user?.displayName || user?.username || "Learner",
            photoURL: user?.photoURL || null,
            doing: body.doing ?? existing.data()?.doing ?? "",
            joinedAtMs: existing.exists ? existing.data()!.joinedAtMs : now,
            lastSeenMs: now,
          },
          { merge: true }
        );
        break;
      }
      case "heartbeat": {
        const snap = await memberRef.get();
        if (!snap.exists) throw new ApiError(409, "NOT_JOINED", "Join the room first.");
        const doingChanged = body.doing !== undefined && body.doing !== (snap.data()!.doing || "");
        const wasAway = now - Number(snap.data()!.lastSeenMs || 0) > PRESENCE_MS;
        await memberRef.update({ lastSeenMs: now, ...(body.doing !== undefined ? { doing: body.doing } : {}) });
        bump = doingChanged || wasAway; // routine heartbeats are silent
        break;
      }
      case "leave":
        await memberRef.delete();
        break;
      case "start":
      case "stop":
      case "settings": {
        const owner = (await roomRef(code).collection("members").doc(room.ownerUid).get()).data();
        const ownerPresent = !!owner && now - Number(owner.lastSeenMs || 0) < PRESENCE_MS;
        const me = await memberRef.get();
        if (!me.exists) throw new ApiError(409, "NOT_JOINED", "Join the room first.");
        if (caller.uid !== room.ownerUid && ownerPresent) throw new ApiError(403, "FORBIDDEN", "Only the host controls the timer.");
        if (body.action === "start") await roomRef(code).update({ anchorMs: now });
        else if (body.action === "stop") await roomRef(code).update({ anchorMs: null });
        else {
          const cfg = clampConfig(body);
          await roomRef(code).update({ ...cfg, anchorMs: null });
        }
        break;
      }
    }
    if (bump) await bumpChannel(`focus:${code}`);
    const state = await stateFor(code, caller.uid);
    return NextResponse.json({ ok: true, data: state });
  } catch (error) {
    return handleAuthError(error);
  }
}
