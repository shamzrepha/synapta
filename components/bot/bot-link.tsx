"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBot } from "@/components/bot/bot-provider";

/**
 * A link that Sprout answers: it runs to what you tapped, "opens" it, and then the page changes.
 * Ctrl/Cmd/Shift-clicks, middle clicks, and anyone with the bot off or motion reduced get a plain link.
 */
export function BotLink({ href, label, className, children, onNavigate }: { href: string; label?: string; className?: string; children: React.ReactNode; onNavigate?: () => void }) {
  const bot = useBot();
  const router = useRouter();
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!bot.enabled || bot.reduced || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    void bot.openAt(el, label ? `Opening ${label.slice(0, 40)}...` : "Opening...").finally(() => {
      onNavigate?.();
      router.push(href);
    });
  };
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
