import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeDb, fakeTimestamp, fakeFieldValue, type Store } from "@/lib/testing/fake-firestore";

const store: Store = new Map();
vi.mock("@/lib/firebase/admin", () => ({ Timestamp: fakeTimestamp, FieldValue: fakeFieldValue, adminDb: () => makeFakeDb(store) }));

import { canReadMedia } from "./access";

const me = { uid: "u2", role: "student" };

beforeEach(() => {
  store.clear();
  store.set("explainers/e1", { videoPath: "explainers/u1/e1.mp4" });
  store.set("posts/p1", { images: ["posts/u1/feed.jpg"] });
  store.set("communities/c1/members/u2", { role: "member" });
  store.set("communities/c1/posts/cp1", { image: "posts/u1/comm.jpg" });
  store.set("communities/c2/posts/cp2", { image: "posts/u1/secret.jpg" });
});

describe("canReadMedia", () => {
  it("lets the owner and admins read their files", async () => {
    expect(await canReadMedia({ uid: "u1", role: "student" }, "posts/u1/orphan.jpg")).toBe(true);
    expect(await canReadMedia({ uid: "a", role: "admin" }, "posts/u1/orphan.jpg")).toBe(true);
  });
  it("refuses another user's unattached upload", async () => {
    expect(await canReadMedia(me, "posts/u1/orphan.jpg")).toBe(false);
  });
  it("allows files attached to an explainer or a feed post", async () => {
    expect(await canReadMedia(me, "explainers/u1/e1.mp4")).toBe(true);
    expect(await canReadMedia(me, "posts/u1/feed.jpg")).toBe(true);
  });
  it("community images only for members of that community", async () => {
    expect(await canReadMedia(me, "posts/u1/comm.jpg")).toBe(true);
    expect(await canReadMedia(me, "posts/u1/secret.jpg")).toBe(false);
  });
});
