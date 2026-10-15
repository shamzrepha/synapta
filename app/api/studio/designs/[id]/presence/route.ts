import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "@/lib/firebase/admin";
import { bumpChannel } from "@/lib/live/server";
import { displayName, loadDesign } from "@/lib/studio/store";
import { presenceColor, PRESENCE_TTL_MS } from "@/lib/studio/presence";

export const runtime = "nodejs";

/** Who is in this design right now (seen within the last 45 seconds), with their colour and selected part. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadDesign(id, caller);
    const snap = await ref.collection("presence").limit(50).get();
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const people = snap.docs
      .map((d) => d.data())
      .filter((p) => (p.at?.toMillis?.() ?? 0) >= cutoff)
      .map((p) => ({ uid: String(p.uid), name: String(p.name || "Maker"), color: String(p.color), selected: p.selected ? String(p.selected) : null, editing: !!p.editing, tab: p.tab ? String(p.tab) : null }));
    return NextResponse.json({ ok: true, data: { me: caller.uid, people } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  selected: z.string().max(60).nullable().default(null),
  editing: z.boolean().default(false),
  tab: z.string().max(20).nullable().default(null),
});

/** Heartbeat: "I'm here, and this is what I have selected". Only a change wakes the other editors. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_presence", limit: 90, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, schema);
    const { ref } = await loadDesign(id, caller);
    const mine = ref.collection("presence").doc(caller.uid);
    const prev = await mine.get();
    const p = prev.data();
    const fresh = !!p && (p.at?.toMillis?.() ?? 0) >= Date.now() - PRESENCE_TTL_MS;
    const changed = !fresh || p!.selected !== body.selected || !!p!.editing !== body.editing || p!.tab !== body.tab;
    await mine.set({
      uid: caller.uid,
      name: p?.name || (await displayName(caller.uid)),
      color: presenceColor(caller.uid),
      selected: body.selected,
      editing: body.editing,
      tab: body.tab,
      at: Timestamp.now(),
    });
    if (changed) await bumpChannel(`design-presence:${id}`);
    return NextResponse.json({ ok: true, data: { color: presenceColor(caller.uid) } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Leaving the page. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { ref } = await loadDesign(id, caller);
    await ref.collection("presence").doc(caller.uid).delete();
    await bumpChannel(`design-presence:${id}`);
    return NextResponse.json({ ok: true, data: {} });
  } catch (error) {
    return handleAuthError(error);
  }
}
