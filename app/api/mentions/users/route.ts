import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** People to suggest while typing "@ab…": prefix match on username and on display name. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "mention_suggest", limit: 90, windowMs: 60_000 });
    if (limited) return limited;
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase().replace(/^@/, "").slice(0, 30);
    const col = adminDb().collection("users");
    const found = new Map<string, { uid: string; username: string; displayName: string; photoURL: string | null }>();
    const add = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
      for (const d of docs) {
        const u = d.data();
        if (!u.username || found.has(d.id)) continue;
        found.set(d.id, { uid: d.id, username: String(u.username).toLowerCase(), displayName: u.displayName || u.username, photoURL: u.photoURL || null });
      }
    };
    if (!q) {
      // nothing typed yet: people you follow first
      const follows = await col.doc(caller.uid).collection("following").limit(8).get().catch(() => null);
      const ids = follows?.docs.map((d) => d.id) || [];
      if (ids.length) add((await Promise.all(ids.map((id) => col.doc(id).get()))).filter((s) => s.exists) as unknown as FirebaseFirestore.QueryDocumentSnapshot[]);
    } else {
      const end = q + "";
      const [byUser, byName] = await Promise.all([
        col.where("username", ">=", q).where("username", "<=", end).limit(8).get(),
        col.where("displayNameLower", ">=", q).where("displayNameLower", "<=", end).limit(8).get().catch(() => null),
      ]);
      add(byUser.docs);
      if (byName) add(byName.docs);
    }
    found.delete(caller.uid);
    return NextResponse.json({ ok: true, data: { users: Array.from(found.values()).slice(0, 8) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
