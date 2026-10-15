import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { getMyClassIds } from "@/lib/classes/members";
import { toPublicProfile } from "@/lib/social/profile";

export const runtime = "nodejs";

function matches(text: unknown, q: string): boolean {
  return typeof text === "string" && text.toLowerCase().includes(q);
}

/**
 * App-wide search: people, classes, topics in your classes, recent public posts, hashtags and your
 * notebooks. Simple prefix/contains matching sized for a school-scale dataset.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const raw = (req.nextUrl.searchParams.get("q") || "").trim();
    const q = raw.toLowerCase().replace(/^[@#]/, "");
    if (q.length < 2) return NextResponse.json({ ok: true, data: { people: [], classes: [], topics: [], posts: [], tags: [], notebooks: [] } });
    const db = adminDb();

    const [byUsername, publicClasses, myClassIds, recentPosts, tagSnap, notebookSnap] = await Promise.all([
      db.collection("users").where("username", ">=", q).where("username", "<=", `${q}`).limit(10).get(),
      db.collection("classes").where("visibility", "==", "public").where("status", "==", "published").limit(150).get(),
      getMyClassIds(caller.uid),
      db.collection("posts").where("visibility", "==", "public").orderBy("createdAt", "desc").limit(200).get(),
      db.collection("hashtagStats").where("tag", ">=", q).where("tag", "<=", `${q}`).limit(8).get(),
      db.collection("notebooks").where("memberIds", "array-contains", caller.uid).limit(100).get().catch(() => null),
    ]);

    const people = byUsername.docs
      .map((d) => toPublicProfile(d.id, d.data()))
      .map((p) => ({ uid: p.uid, displayName: p.displayName, username: p.username, photoURL: p.photoURL, level: p.level, role: p.role }));

    const classMap = new Map<string, FirebaseFirestore.DocumentData>();
    publicClasses.docs.forEach((d) => classMap.set(d.id, d.data()));
    const missing = myClassIds.filter((id) => !classMap.has(id)).slice(0, 30);
    if (missing.length) (await db.getAll(...missing.map((id) => db.collection("classes").doc(id)))).forEach((s) => s.exists && classMap.set(s.id, s.data()!));
    const classes = Array.from(classMap.entries())
      .filter(([, c]) => matches(c.title, q) || matches(c.subject, q) || matches(c.description, q))
      .slice(0, 10)
      .map(([id, c]) => ({ id, title: c.title, subject: c.subject, teacherName: c.teacherName || "" }));

    const topicSnaps = await Promise.all(myClassIds.slice(0, 15).map((cid) => db.collection("classes").doc(cid).collection("kcs").limit(80).get()));
    const topics = topicSnaps
      .flatMap((s, i) => s.docs.map((d) => ({ classId: myClassIds[i], id: d.id, ...(d.data() as { title?: string; description?: string; status?: string }) })))
      .filter((k) => k.status !== "archived" && (matches(k.title, q) || matches(k.description, q)))
      .slice(0, 10)
      .map((k) => ({ classId: k.classId, kcId: k.id, title: k.title || "Topic", className: classMap.get(k.classId)?.title || "" }));

    const posts = recentPosts.docs
      .filter((d) => matches(d.data().text, q) || (d.data().hashtags || []).includes(q))
      .slice(0, 10)
      .map((d) => ({ id: d.id, text: String(d.data().text || "").slice(0, 160), authorName: d.data().authorName, createdAt: d.data().createdAt?.toDate?.().toISOString() || null }));

    const tags = tagSnap.docs.map((d) => ({ tag: d.data().tag as string, total: d.data().total || 0 }));

    const notebooks = (notebookSnap?.docs || [])
      .filter((d) => matches(d.data().title, q) || matches(d.data().course, q))
      .slice(0, 10)
      .map((d) => ({ id: d.id, title: d.data().title, course: d.data().course || "" }));

    return NextResponse.json({ ok: true, data: { people, classes, topics, posts, tags, notebooks } });
  } catch (error) {
    return handleAuthError(error);
  }
}
