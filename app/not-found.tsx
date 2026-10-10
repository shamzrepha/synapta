import React from "react";
import Link from "next/link";
import { Brain, ArrowLeft, Home, Compass, MessageSquare, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground relative overflow-hidden">
      {/* Background glow effects */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-70"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 right-1/4 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl opacity-50"
      />

      <div className="relative z-10 max-w-md w-full text-center space-y-6">
        {/* Animated Icon */}
        <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5 transition-transform hover:scale-105">
          <Brain className="w-10 h-10 text-primary animate-pulse" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
            Error 404
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Knowledge Node Not Found
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The concept, class, or resource you are seeking does not exist in the active curriculum graph. It may have been relocated or updated.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button className="w-full gap-2">
              <Home className="w-4 h-4" />
              Go to Dashboard
            </Button>
          </Link>
          <Link href="/explore" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full gap-2">
              <Compass className="w-4 h-4" />
              Explore Classes
            </Button>
          </Link>
        </div>

        {/* Quick jump navigation */}
        <div className="pt-6 border-t border-border/40">
          <p className="text-xs text-muted-foreground mb-3 font-medium">Quick Pathways</p>
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            <Link
              href="/notebook"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-card hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              Notebook Studio
            </Link>
            <Link
              href="/lounge"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-card hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              Peer Lounge
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-card hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Home Page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
