import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { bumpChannel } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { loadGroupStreak, recordGroupActivity } from "@/lib/groups/activity";
import { decideNotesSave, NOTES_MAX } from "@/lib/groups/notes";
import { loadGroupForMember, newInviteCode, MAX_GOALS, MAX_MEMBERS, type GoalItem } from "@/lib/groups/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { g } = await loadGroupForMember(id, caller.uid);
    const uids: string[] = g.memberUids;
    const [profiles, streak] = await Promise.all([getPublicProfiles(uids), loadGroupStreak(id).catch(() => null)]);
    const members = uids.map((uid) => {
      const p = profiles.get(uid);
      return {
        uid,
        displayName: p?.displayName || "Learner",
        username: p?.username || null,
        photoURL: p?.photoURL || null,
        role: (g.roles?.[uid] as string) || (uid === g.ownerUid ? "owner" : "member"),
        activeToday: !!streak?.todayUids.includes(uid),
      };
    });
    return NextResponse.json({
      ok: true,
      data: {
        id,
        name: g.name,
        description: g.description || "",
        ownerUid: g.ownerUid,
        me: caller.uid,
        inviteCode: g.inviteCode,
        members,
        notes: g.notes || { text: "", version: 0 },
        goals: Array.isArray(g.goals) ? g.goals : [],
        streak: streak ? { current: streak.current, longest: streak.longest, activeToday: streak.activeToday } : { current: 0, longest: 0, activeToday: false },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("notes"), text: z.string().max(NOTES_MAX), baseVersion: z.number().int().min(0), force: z.boolean().optional() }),
  z.object({ action: z.literal("goal_add"), text: z.string().trim().min(1).max(140) }),
  z.object({ action: z.literal("goal_toggle"), goalId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("goal_remove"), goalId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("checkin") }),
  z.object({ action: z.literal("invite"), username: z.string().trim().min(2).max(30) }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("transfer"), uid: z.string().min(1).max(128) }),
  z.object({ action: z.literal("kick"), uid: z.string().min(1).max(128) }),
  z.object({ action: z.literal("rotate_code") }),
  z.object({ action: z.literal("delete") }),
]);

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "group_action", limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, actionSchema);
    const { ref, g } = await loadGroupForMember(id, caller.uid);
    const isOwner = g.ownerUid === caller.uid;
    const needOwner = () => {
      if (!isOwner) throw new ApiError(403, "FORBIDDEN", "Only the group owner can do that.");
    };
    const me = (await adminDb().collection("users").doc(caller.uid).get()).data();
    const myName: string = me?.displayName || me?.username || "Someone";
    let result: Record<string, unknown> = {};

    switch (body.action) {
      case "notes": {
        result = await adminDb().runTransaction(async (t) => {
          const cur = (await t.get(ref)).data()!;
          const notes = cur.notes || { text: "", version: 0 };
          const d = decideNotesSave(notes.version || 0, body.baseVersion, body.force);
          if (d.kind === "conflict") {
            return { conflict: true, notes: { text: notes.text, version: notes.version, updatedByName: notes.updatedByName || "", updatedAtMs: notes.updatedAtMs || 0 } };
          }
          t.update(ref, { notes: { text: body.text, version: d.nextVersion, updatedBy: caller.uid, updatedByName: myName, updatedAtMs: Date.now() } });
          return { conflict: false, version: d.nextVersion };
        });
        break;
      }
      case "goal_add":
      case "goal_toggle":
      case "goal_remove": {
        await adminDb().runTransaction(async (t) => {
          const cur = (await t.get(ref)).data()!;
          let goals: GoalItem[] = Array.isArray(cur.goals) ? cur.goals : [];
          if (body.action === "goal_add") {
            if (goals.length >= MAX_GOALS) throw new ApiError(400, "LIMIT", "Too many goals. Remove some first.");
            goals = [...goals, { id: Math.random().toString(36).slice(2, 10), text: body.text, done: false, doneBy: null }];
          } else if (body.action === "goal_toggle") {
            goals = goals.map((x) => (x.id === body.goalId ? { ...x, done: !x.done, doneBy: x.done ? null : caller.uid } : x));
          } else {
            goals = goals.filter((x) => x.id !== body.goalId);
          }
          t.update(ref, { goals });
        });
        break;
      }
      case "checkin":
        await recordGroupActivity(caller.uid, "checkin", id);
        break;
      case "invite": {
        const uname = body.username.toLowerCase().replace(/^@/, "");
        const found = await adminDb().collection("users").where("username", "==", uname).limit(1).get();
        if (found.empty) throw new ApiError(404, "NOT_FOUND", "No one with that username.");
        const target = found.docs[0];
        if (g.memberUids.includes(target.id)) throw new ApiError(400, "VALIDATION", "They're already in the group.");
        if (g.memberUids.length >= MAX_MEMBERS) throw new ApiError(409, "FULL", "This group is full.");
        await notify(target.id, {
          type: "system",
          title: `${myName} invited you to “${g.name}”`,
          body: "Tap to join the study group.",
          href: `/groups?join=${g.inviteCode}`,
          icon: "👥",
          actorUid: caller.uid,
          actorName: myName,
        });
        result = { invited: target.data().username };
        break;
      }
      case "leave": {
        if (isOwner && g.memberUids.length > 1) throw new ApiError(400, "OWNER_MUST_TRANSFER", "Transfer ownership to someone before you leave.");
        if (g.memberUids.length <= 1) await ref.delete();
        else await ref.update({ memberUids: FieldValue.arrayRemove(caller.uid), [`roles.${caller.uid}`]: FieldValue.delete() });
        result = { left: true };
        break;
      }
      case "transfer": {
        needOwner();
        if (body.uid === caller.uid || !g.memberUids.includes(body.uid)) throw new ApiError(400, "VALIDATION", "Pick another member.");
        await ref.update({ ownerUid: body.uid, [`roles.${body.uid}`]: "owner", [`roles.${caller.uid}`]: "member" });
        await notify(body.uid, { type: "system", title: `You're now the owner of “${g.name}”`, href: `/groups/${id}`, icon: "👑" });
        break;
      }
      case "kick": {
        needOwner();
        if (body.uid === caller.uid || !g.memberUids.includes(body.uid)) throw new ApiError(400, "VALIDATION", "Pick another member.");
        await ref.update({ memberUids: FieldValue.arrayRemove(body.uid), [`roles.${body.uid}`]: FieldValue.delete() });
        break;
      }
      case "rotate_code":
        needOwner();
        await ref.update({ inviteCode: newInviteCode() });
        break;
      case "delete":
        needOwner();
        await ref.delete();
        result = { deleted: true };
        break;
    }
    await bumpChannel(`group:${id}`);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return handleAuthError(error);
  }
}
