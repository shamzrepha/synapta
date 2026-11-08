import React from "react";

/** Sunroot's mark: a sun rising over its roots. Drawn in the current text colour, so it sits on the orange tile in ink. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M5 15a7 7 0 0 1 14 0" fill="currentColor" />
      <path d="M2.5 15.5h19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 18.5v3M12 18.5v3.5M16 18.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
