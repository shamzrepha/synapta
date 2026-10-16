import { Hub } from "@/components/shell/hub";

export default function CommunityHub() {
  return (
    <Hub
      eyebrow="COMMUNITY"
      title="Community"
      intro="Meet other students, chat, compete and help each other."
      start={[
        { title: "Feed", blurb: "Posts and questions from people you follow.", href: "/feed", emoji: "📰" },
        { title: "Messages", blurb: "Chat privately with friends.", href: "/messages", emoji: "💬" },
        { title: "Friends", blurb: "Find and add classmates.", href: "/friends", emoji: "🧑‍🤝‍🧑" },
        { title: "Challenges", blurb: "Quick duels and build challenges.", href: "/challenges", emoji: "⚔️" },
        { title: "Leaderboard", blurb: "See who is ahead this week.", href: "/leaderboard", emoji: "👑" },
        { title: "Study sessions", blurb: "Join or host a live study session.", href: "/sessions", emoji: "📅" },
      ]}
      groups={["Social"]}
      extraLinks={[{ title: "Peer lounge", blurb: "Drop in and study next to others.", href: "/lounge", emoji: "🛋️" }]}
    />
  );
}
