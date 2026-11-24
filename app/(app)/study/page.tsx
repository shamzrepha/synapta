import { Hub } from "@/components/shell/hub";

export default function StudyHub() {
  return (
    <Hub
      eyebrow="STUDY"
      title="What do you want to do?"
      intro="Add your material, understand it, practise it, and bring it back before you forget. Everything is grouped by what you are trying to do."
      start={[
        { title: "Study notes", href: "/study/notes", emoji: "📝", blurb: "Upload a PDF, a scan or a photo of your notes and get clean, structured notes you can refine." },
        { title: "Ask the AI tutor", href: "/tutor", emoji: "✨", blurb: "Stuck? Ask anything, by typing or by voice, and get a step-by-step answer." },
        { title: "Review what is due", href: "/study/review", emoji: "🗂️", blurb: "Short reviews of what you learned, timed so it sticks." },
        { title: "How am I doing?", href: "/study/evaluation", emoji: "🧭", blurb: "Finds what you are stuck on from your wrong answers and gives you a short plan." },
      ]}
      groups={["Study", "Maker", "Rewards"]}
      extraLinks={[
        { title: "Library", href: "/study/library", emoji: "📚", blurb: "All your notes, notebooks, decks, Worlds and saved items in one place.", intent: "Capture" },
        { title: "Timetable", href: "/timetable", emoji: "🗓️", blurb: "Your department's lectures this week, and the courses you share with other departments.", intent: "Plan" },
        { title: "AI Notebook", href: "/notebook", emoji: "📓", blurb: "Chat with your own documents, with sources.", intent: "Capture" },
        { title: "Written practice", href: "/practice/written", emoji: "✍️", blurb: "Answer in your own words and get marked against a guide.", intent: "Practise" },
        { title: "Maker Studio", href: "/studio", emoji: "🛠️", blurb: "Build circuits, robots and 3D designs, test them, and share them.", intent: "Build" },
        { title: "Science experiments", href: "/experiments", emoji: "🧪", blurb: "Chemistry and physics you can try on screen.", intent: "Build" },
        { title: "Weak topics", href: "/classes/heatmap", emoji: "🎯", blurb: "See what to revise next, based on your quiz results.", intent: "Progress" },
      ]}
    />
  );
}
