"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ArrowRight, GraduationCap } from "lucide-react";

interface ClassItem {
  id: string;
  title: string;
  subject: string;
  studentCount?: number;
}

import { asArray } from "@/lib/api/client";

export default function ClassHeatmapIndexPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function loadClasses() {
      try {
        const res = await fetch("/api/classes?scope=mine");
        const json = await res.json();
        if (!ignore && json.ok) {
          setClasses(asArray<ClassItem>(json.data));
        } else if (!ignore) {
          setClasses([]);
        }
      } catch {
        if (!ignore) {
          setClasses([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadClasses();
    return () => {
      ignore = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">Teacher Analytics</Badge>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Select Class Heatmap
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Choose a course below to inspect the BKT Cognitive Digital Twin heatmap and student mastery matrix.
        </p>
      </div>

      {classes.length === 0 ? (
        <Card className="p-12 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
              No classes created yet
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Create a class and publish your syllabus to unlock class-wide Cognitive Twin mastery matrices.
            </p>
          </div>
          <Link href="/classes/manage">
            <Button size="sm">Create a Class</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {asArray(classes).map((c) => (
            <Card key={c.id} className="hover:border-teal-500 transition-all group">
              <CardContent className="p-6 flex flex-col justify-between h-full space-y-4">
                <div className="space-y-1.5">
                  <Badge variant="secondary" className="text-xs">{c.subject}</Badge>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {c.title}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {c.studentCount ?? 0} active students enrolled
                  </p>
                </div>

                <div className="pt-2">
                  <Link href={`/classes/${c.id}/heatmap`}>
                    <Button size="sm" className="w-full text-xs">
                      <Activity className="h-3.5 w-3.5 mr-1.5" />
                      View Class Heatmap
                      <ArrowRight className="h-3.5 w-3.5 ml-auto" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
