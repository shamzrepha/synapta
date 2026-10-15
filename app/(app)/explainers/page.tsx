"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Clapperboard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExplainerFeed } from "@/components/explainers/explainer-feed";
import { UploadForm } from "@/components/explainers/upload-form";

export default function ExplainersPage() {
  const [showUpload, setShowUpload] = useState(false);
  const [version, setVersion] = useState(0);

  return (
    <div className="space-y-5 max-w-xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Clapperboard className="h-7 w-7 text-teal-600" /> 60-second explainers
          </h1>
          <p className="text-sm text-slate-500">Short videos made by students to explain one idea.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/explainers/mine">
            <Button variant="outline" size="sm">My explainers</Button>
          </Link>
          <Button size="sm" onClick={() => setShowUpload((s) => !s)}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </div>
      </div>
      {showUpload && (
        <UploadForm
          onUploaded={() => {
            setShowUpload(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
      <ExplainerFeed version={version} />
    </div>
  );
}
