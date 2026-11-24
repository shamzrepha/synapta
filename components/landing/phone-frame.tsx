import React from "react";
import Image from "next/image";

/** A phone with a real screenshot of the app in it. */
export function PhoneFrame({ src, alt, className = "", priority = false }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={`relative aspect-[9/19] overflow-hidden rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 shadow-elevated dark:border-slate-700 ${className}`}>
      <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 260px, 60vw" className="object-cover object-top" priority={priority} />
    </div>
  );
}
