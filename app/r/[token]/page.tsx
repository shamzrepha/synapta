import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import { ReportView } from "@/components/report/report-view";
import { TOKEN_RE } from "@/lib/report/server";
import type { ReportNumbers } from "@/lib/report/compute";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Weekly report", robots: { index: false, follow: false } };

async function load(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  try {
    const snap = await adminDb().collection("reportShares").doc(token).get();
    const d = snap.data();
    if (!snap.exists || !d || d.revoked) return null;
    return {
      // Only the whitelisted snapshot fields are exposed: no uid, no email
      name: String(d.firstName || "A learner"),
      numbers: d.numbers as ReportNumbers,
      summary: (d.summary as string | null) || null,
      suggestion: (d.suggestion as string | null) || null,
    };
  } catch {
    return null;
  }
}

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await load(token);
  return (
    <main className="min-h-screen bg-[#F7F6F2] dark:bg-[#0B0F14] text-slate-900 dark:text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">Sunroot weekly report</p>
        {report ? (
          <ReportView name={report.name} numbers={report.numbers} summary={report.summary} suggestion={report.suggestion} />
        ) : (
          <p className="text-sm text-slate-500">This report link is not available. It may have been revoked.</p>
        )}
      </div>
    </main>
  );
}
