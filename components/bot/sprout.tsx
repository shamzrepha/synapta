"use client";

import React from "react";

export type BotPose = "idle" | "search" | "point" | "cheer" | "think" | "cross";

/**
 * Sprout, SunRoot's helper bot: a round blue body, a white face, a little green sprout on top (sun + root).
 * One SVG; the pose changes its arms and what it holds (CSS in globals.css), and it blinks and sways by itself.
 */
export function Sprout({ pose = "idle", facing = 1, className }: { pose?: BotPose; facing?: 1 | -1; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 112"
      className={`sprout ${className || ""}`}
      data-pose={pose}
      style={{ ["--sx" as string]: String(facing) }}
      role="img"
      aria-label="Sprout, your study helper"
    >
      <ellipse className="sprout-shadow" cx="50" cy="104" rx="26" ry="5" fill="rgba(15,23,42,0.18)" />
      {/* sprout */}
      <g className="sprout-leaf">
        <path d="M50 36 C50 26 49 20 47 14" stroke="#0d9488" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <path d="M47 15 C36 8 28 13 27 21 C36 24 44 22 47 15 Z" fill="#14b8a6" />
        <path d="M48 16 C58 6 70 9 72 18 C62 22 52 21 48 16 Z" fill="#0d9488" />
      </g>
      {/* arms (behind the body edge) */}
      <g data-arm="left" style={{ transformOrigin: "26px 66px" }}>
        <rect x="14" y="62" width="14" height="9" rx="4.5" fill="#2f5fe0" />
      </g>
      <g data-arm="right" style={{ transformOrigin: "74px 66px" }}>
        <rect x="72" y="62" width="14" height="9" rx="4.5" fill="#2f5fe0" />
      </g>
      {/* body */}
      <rect x="22" y="34" width="56" height="62" rx="26" fill="#3b6df6" />
      <rect x="22" y="34" width="56" height="62" rx="26" fill="url(#sproutShade)" opacity="0.35" />
      <defs>
        <linearGradient id="sproutShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#1e3a8a" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect x="28" y="42" width="44" height="34" rx="15" fill="#eef3ff" />
      {/* face */}
      <g className="sprout-eyes">
        <ellipse cx="41" cy="58" rx="4.6" ry="5.4" fill="#0f172a" />
        <ellipse cx="59" cy="58" rx="4.6" ry="5.4" fill="#0f172a" />
        <circle cx="42.6" cy="56" r="1.5" fill="#fff" />
        <circle cx="60.6" cy="56" r="1.5" fill="#fff" />
      </g>
      <circle cx="35" cy="66" r="3.4" fill="#fda4af" opacity="0.6" />
      <circle cx="65" cy="66" r="3.4" fill="#fda4af" opacity="0.6" />
      <path className="sprout-mouth" d="M44 67 Q50 72 56 67" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path className="sprout-mouth-open" d="M43.5 66 Q50 78 56.5 66 Z" fill="#0f172a" />
      {/* feet */}
      <ellipse className="sprout-foot" cx="38" cy="97" rx="9" ry="5" fill="#2f5fe0" />
      <ellipse className="sprout-foot" cx="62" cy="97" rx="9" ry="5" fill="#2f5fe0" />
      {/* the magnifying glass, held out to the side in front of the body */}
      <g className="sprout-lens">
        <circle cx="87" cy="52" r="10" fill="rgba(255,255,255,0.4)" stroke="#475569" strokeWidth="3.2" />
        <path d="M80 59 L73 67" stroke="#475569" strokeWidth="4" strokeLinecap="round" />
        <path d="M82 48 C83 46 85 45 87 45" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9" />
      </g>
      {/* cheer sparkles: gold is the reward colour */}
      <g className="sprout-sparkles" fill="#f59e0b">
        <path d="M12 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        <path d="M88 24 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
      </g>
    </svg>
  );
}
