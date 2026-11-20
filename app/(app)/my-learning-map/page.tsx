import { LearningMap } from "@/components/mirror/learning-map";

export const metadata = { title: "My learning map" };

export default function MyLearningMapPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6 sm:py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">My learning map</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">How you study, as Sunroot has noticed it. You can edit it, switch it off, or delete it at any time.</p>
      </header>
      <LearningMap />
    </div>
  );
}
