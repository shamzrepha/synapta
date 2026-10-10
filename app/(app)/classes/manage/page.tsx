"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap,
  Plus,
  Users,
  Settings,
  Activity,
  Globe,
  Lock,
} from "lucide-react";

interface ClassSummary {
  id: string;
  title: string;
  subject: string;
  description: string;
  visibility: "public" | "private";
  studentCount: number;
  status: "draft" | "published";
}

export default function TeacherClassesListPage() {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/classes?scope=mine");
        const data = await res.json();
        if (data.ok && Array.isArray(data.data?.classes)) {
          setClasses(data.data.classes);
        } else {
          setClasses([]);
        }
      } catch {
        setClasses([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <GraduationCap className="h-7 w-7 text-amber-500" />
            My Managed Classes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Teacher cockpit: oversee enrollments, syllabus components, and class mastery heatmaps.
          </p>
        </div>

        <Link href="/explore">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> Create New Class
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {classes.map((c) => (
            <Card key={c.id} className="border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge variant="outline" className="text-xs uppercase font-bold">
                    {c.subject}
                  </Badge>
                  {c.visibility === "private" ? (
                    <Badge variant="amber" className="text-xs flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Private (Gated)
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs flex items-center gap-1">
                      <Globe className="h-3 w-3" /> Public
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-lg font-bold">{c.title}</CardTitle>
                <CardDescription className="text-xs line-clamp-2">{c.description}</CardDescription>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {c.studentCount} enrolled
                  </span>
                </div>
              </CardContent>
              <CardFooter className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
                <Link href={`/classes/${c.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    View Syllabus
                  </Button>
                </Link>
                <Link href={`/classes/${c.id}/heatmap`}>
                  <Button variant="outline" size="sm" className="text-xs">
                    <Activity className="h-3.5 w-3.5 mr-1 text-teal-500" /> Heatmap
                  </Button>
                </Link>
                <Link href={`/classes/${c.id}/manage`}>
                  <Button size="sm" className="text-xs">
                    <Settings className="h-3.5 w-3.5 mr-1" /> Roster
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
