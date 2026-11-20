import { ForYouFeed } from "@/components/mirror/for-you-feed";

export const metadata = { title: "For you" };

export default function ForYouPage() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-6 sm:py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">For you</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">A few things worth doing next, with the reason for each. It stops when today&apos;s goal is done.</p>
      </header>
      <ForYouFeed />
    </div>
  );
}
