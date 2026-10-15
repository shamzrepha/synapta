"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExplainerFeed } from "@/components/explainers/explainer-feed";

export default function MyExplainersPage() {
  return (
    <div className="space-y-5 max-w-xl mx-auto">
      <div>
        <Link href="/explainers" className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600">
          <ArrowLeft className="h-4 w-4" /> All explainers
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">My explainers</h1>
      </div>
      <ExplainerFeed mine />
    </div>
  );
}
