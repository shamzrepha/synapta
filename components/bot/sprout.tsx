"use client";

import React from "react";
import { BackGear, FaceGear, HatGear, NeckGear, ShoeGear, type Gear } from "@/components/bot/sprout-gear";
import { PALETTES, type PetMood, type PetPalette } from "@/lib/pet/mood";

export type BotPose = "idle" | "search" | "point" | "cheer" | "think" | "cross" | "dance" | "jump" | "wave" | "pull" | "giggle" | "flip" | "nap";

/**
 * Sprout, SunRoot's helper bot: a round blue body, a white face, a little green sprout on top (sun + root).
 * One SVG; the pose changes its arms and what it holds (CSS in globals.css), and it blinks and sways by itself.
 */
export function Sprout({ pose = "idle", facing = 1, className, mood = "calm", palette, gear }: { pose?: BotPose; facing?: 1 | -1; className?: string; mood?: PetMood; palette?: PetPalette; gear?: Gear }) {
  const pal = palette ?? PALETTES[mood];
  const uid = React.useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 112"
      className={`sprout ${className || ""}`}
      data-pose={pose}
      data-mood={mood}
      style={{ ["--sx" as string]: String(facing) }}
      role="img"
      aria-label="Sprout, your study helper"
    >
      <ellipse className="sprout-shadow" cx="50" cy="104" rx="26" ry="5" fill="rgba(15,23,42,0.18)" />
      {/* sprout */}
      <BackGear id={gear?.back} />
      <g className="sprout-leaf" style={{ display: gear?.hat && gear.hat !== "pet_hat_crown" ? "none" : undefined }}>
        <path d="M50 36 C50 26 49 20 47 14" stroke="#0d9488" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <path d="M47 15 C36 8 28 13 27 21 C36 24 44 22 47 15 Z" fill="#14b8a6" />
        <path d="M48 16 C58 6 70 9 72 18 C62 22 52 21 48 16 Z" fill="#0d9488" />
      </g>
      {/* arms (behind the body edge) */}
      <g data-arm="left" style={{ transformOrigin: "26px 66px" }}>
        <rect x="14" y="62" width="14" height="9" rx="4.5" fill={pal.arm} />
      </g>
      <g data-arm="right" style={{ transformOrigin: "74px 66px" }}>
        <rect x="72" y="62" width="14" height="9" rx="4.5" fill={pal.arm} />
        {/* the rope launcher strapped to the hand: only seen while pulling */}
        <g className="sprout-launcher">
          <rect x="82" y="58" width="11" height="9" rx="2.6" fill="#334155" />
          <rect x="85" y="54" width="5" height="6" rx="1.4" fill="#64748b" />
          <circle cx="87.5" cy="53.2" r="1.9" fill="#f59e0b" />
        </g>
      </g>
      {/* body */}
      <rect x="22" y="34" width="56" height="62" rx="26" fill={pal.body} />
      <rect x="22" y="34" width="56" height="62" rx="26" fill={`url(#sproutShade${uid})`} opacity="0.35" />
      <defs>
        <linearGradient id={`sproutShade${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor={pal.shade} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect x="28" y="42" width="44" height="34" rx="15" fill="#eef3ff" />
      {/* face */}
      <g className="sprout-look">
        <g className="sprout-eyes">
          <ellipse cx="41" cy="58" rx="4.6" ry="5.4" fill="#0f172a" />
          <ellipse cx="59" cy="58" rx="4.6" ry="5.4" fill="#0f172a" />
          <circle cx="42.6" cy="56" r="1.5" fill="#fff" />
          <circle cx="60.6" cy="56" r="1.5" fill="#fff" />
        </g>
      </g>
      <circle cx="35" cy="66" r="3.4" fill="#fda4af" opacity="0.6" />
      <circle cx="65" cy="66" r="3.4" fill="#fda4af" opacity="0.6" />
      <path className="sprout-mouth" d="M44 67 Q50 72 56 67" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path className="sprout-mouth-open" d="M43.5 66 Q50 78 56.5 66 Z" fill="#0f172a" />
      {/* feet */}
      {gear?.shoes ? (
        <ShoeGear id={gear.shoes} />
      ) : (
        <>
          <ellipse className="sprout-foot" cx="38" cy="97" rx="9" ry="5" fill={pal.arm} />
          <ellipse className="sprout-foot" cx="62" cy="97" rx="9" ry="5" fill={pal.arm} />
        </>
      )}
      <NeckGear id={gear?.back} />
      <FaceGear id={gear?.face} />
      {/* sleepy: heavy lids and a floating z */}
      {mood === "sleepy" && (
        <g>
          <path d="M35 53 h12 M53 53 h12" stroke={pal.body} strokeWidth="6" strokeLinecap="round" />
          <text x="72" y="36" fontSize="13" fontWeight="700" fill="#64748b" className="sprout-zzz">z</text>
        </g>
      )}
      {/* napping when nobody has touched the screen for a while: closed eyes (CSS) and floating z's */}
      {pose === "nap" && (
        <g aria-hidden="true">
          <text x="70" y="38" fontSize="12" fontWeight="700" fill="#64748b" className="sprout-zzz">z</text>
          <text x="80" y="26" fontSize="9" fontWeight="700" fill="#94a3b8" className="sprout-zzz sprout-zzz-late">z</text>
        </g>
      )}
      {/* on fire: little flames over the head; genius: stars */}
      {mood === "fired" && (
        <g className="sprout-flames">
          <path d="M30 34 q-4 -8 1 -14 q1 6 6 8 q3 -4 0 -10 q9 6 5 16z" fill="#fbbf24" opacity="0.95" />
          <path d="M62 34 q-3 -7 1 -12 q1 5 5 7 q2 -3 0 -8 q7 5 4 13z" fill="#fb923c" opacity="0.95" />
        </g>
      )}
      {mood === "genius" && (
        <g className="sprout-stars" fill="#fde68a">
          <path d="M20 40 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
          <path d="M80 44 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z" />
        </g>
      )}
      <HatGear id={gear?.hat} />
      {/* the magnifying glass, held out to the side in front of the body */}
      <g className="sprout-lens">
        <circle cx="88" cy="46" r="17" fill="rgba(255,255,255,0.42)" stroke="#334155" strokeWidth="4" />
        <path d="M76 58 L66 70" stroke="#334155" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M80 38 C82 34 86 32 90 32" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.95" />
        <circle cx="88" cy="46" r="17" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" className="sprout-lens-glint" />
      </g>

      {/* cheer sparkles: gold is the reward colour */}
      <g className="sprout-sparkles" fill="#f59e0b">
        <path d="M12 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        <path d="M88 24 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
      </g>
    </svg>
  );
}
