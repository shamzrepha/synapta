/** Pure shaping of the Review overview, so the rules are testable without a database. */

export interface ReviewSummaryInput {
  dueCards: number;
  totalCards: number;
  decks: Array<{ id: string; title: string; dueCount: number }>;
  openMistakes: number;
  topics: Array<{ classId: string; kcId: string; title: string; dueAt: string }>;
}

export interface ReviewItem {
  id: "cards" | "mistakes" | "topics";
  title: string;
  detail: string;
  count: number;
  href: string;
  cta: string;
}

export interface ReviewSummary {
  total: number;
  items: ReviewItem[];
  decks: ReviewSummaryInput["decks"];
  topics: ReviewSummaryInput["topics"];
  empty: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Only things that are really due or open are listed, so the page never invents work. */
export function summarizeReview(i: ReviewSummaryInput): ReviewSummary {
  const items: ReviewItem[] = [];
  if (i.dueCards > 0) {
    items.push({ id: "cards", title: "Flashcards due", detail: `${plural(i.dueCards, "card", "cards")} scheduled for today, from ${plural(i.decks.filter((d) => d.dueCount > 0).length, "deck", "decks")}.`, count: i.dueCards, href: "/study/flashcards", cta: "Start review" });
  }
  if (i.openMistakes > 0) {
    items.push({ id: "mistakes", title: "Mistakes to relearn", detail: `${plural(i.openMistakes, "question", "questions")} you got wrong. Look at the topic again, then try new questions.`, count: i.openMistakes, href: "/study/mistakes", cta: "Open my mistakes" });
  }
  if (i.topics.length > 0) {
    items.push({ id: "topics", title: "Topics to revisit", detail: `${plural(i.topics.length, "topic", "topics")} whose review date has arrived.`, count: i.topics.length, href: `/classes/${i.topics[0].classId}/topics/${i.topics[0].kcId}`, cta: "Open the first" });
  }
  const total = items.reduce((n, x) => n + x.count, 0);
  return { total, items, decks: i.decks.filter((d) => d.dueCount > 0).slice(0, 5), topics: i.topics.slice(0, 5), empty: items.length === 0 };
}
