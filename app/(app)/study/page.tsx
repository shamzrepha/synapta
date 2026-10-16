import { Hub } from "@/components/shell/hub";

export default function StudyHub() {
  return (
    <Hub
      eyebrow="STUDY"
      title="Study"
      intro="Everything for learning on your own: ask the AI, keep notes, and practise what you find hard."
      start={[
        { title: "Ask the AI tutor", blurb: "Stuck? Ask anything and get a step-by-step answer.", href: "/tutor", emoji: "✨" },
        { title: "My notes", blurb: "Notebook for your notes, summaries and quizzes.", href: "/notebook", emoji: "📓" },
        { title: "Review weak topics", blurb: "See what to revise next, based on your quiz results.", href: "/classes/heatmap", emoji: "🎯" },
      ]}
      groups={["Study", "Rewards"]}
      extraLinks={[
        { title: "Science experiments", blurb: "Chemistry and physics you can try on screen.", href: "/experiments", emoji: "🧪" },
      ]}
    />
  );
}
