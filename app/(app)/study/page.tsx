import { Hub } from "@/components/shell/hub";

export default function StudyHub() {
  return (
    <Hub
      eyebrow="NOTEBOOK & STUDIO"
      title="Your self-study workspace"
      intro="Everything you do on your own: chat with your own notes, build things in the Maker Studio, and practise what you find hard."
      start={[
        { title: "AI Notebook", href: "/notebook", emoji: "📓", blurb: "Upload a PDF or notes, chat with it (with sources), and turn it into a two-host audio podcast." },
        { title: "Maker Studio", href: "/studio", emoji: "🛠️", blurb: "Build circuits, robots and 3D designs, test them with simulated physics, and share them." },
        { title: "Ask the AI tutor", href: "/tutor", emoji: "✨", blurb: "Stuck? Ask anything and get a step-by-step answer." },
        { title: "Review weak topics", href: "/classes/heatmap", emoji: "🎯", blurb: "See what to revise next, based on your quiz results." },
      ]}
      groups={["Study", "Maker", "Rewards"]}
      extraLinks={[{ title: "Science experiments", blurb: "Chemistry and physics you can try on screen.", href: "/experiments", emoji: "🧪" }]}
    />
  );
}
