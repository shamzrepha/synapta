import React from "react";

/** What Sprout wears, as SVG pieces on the same 100x112 canvas as the bot. Ids match the shop's pet items. */
export type Gear = Partial<Record<"hat" | "face" | "back" | "shoes", string>>;

export function BackGear({ id }: { id?: string }) {
  switch (id) {
    case "pet_back_cape":
      return (
        <g>
          <path d="M26 56 C14 70 12 92 14 104 C26 98 40 100 50 102 C60 100 74 98 86 104 C88 92 86 70 74 56 Z" fill="#dc2626" />
          <path d="M26 56 C20 74 20 90 22 100" stroke="#991b1b" strokeWidth="2" fill="none" opacity="0.6" />
        </g>
      );
    case "pet_back_backpack":
      return (
        <g>
          <rect x="16" y="52" width="16" height="36" rx="7" fill="#f97316" />
          <rect x="68" y="52" width="16" height="36" rx="7" fill="#ea580c" />
          <rect x="19" y="60" width="10" height="8" rx="2" fill="#fed7aa" />
        </g>
      );
    default:
      return null;
  }
}

export function NeckGear({ id }: { id?: string }) {
  if (id !== "pet_back_scarf") return null;
  return (
    <g>
      <path d="M24 78 Q50 90 76 78 L78 86 Q50 98 22 86 Z" fill="#16a34a" />
      <path d="M62 86 L70 104 L60 102 L56 90 Z" fill="#15803d" />
      <path d="M26 82 Q50 92 74 82" stroke="#bbf7d0" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />
    </g>
  );
}

export function FaceGear({ id }: { id?: string }) {
  switch (id) {
    case "pet_face_shades":
      return (
        <g>
          <rect x="31" y="52" width="16" height="11" rx="4.5" fill="#0f172a" />
          <rect x="53" y="52" width="16" height="11" rx="4.5" fill="#0f172a" />
          <path d="M47 56 L53 56" stroke="#0f172a" strokeWidth="2.6" />
          <path d="M34 55 l5 0" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        </g>
      );
    case "pet_face_glasses":
      return (
        <g fill="rgba(255,255,255,0.18)" stroke="#334155" strokeWidth="2.4">
          <circle cx="41" cy="58" r="9" />
          <circle cx="59" cy="58" r="9" />
          <path d="M50 58 L50 58" />
          <path d="M32 56 L28 54 M68 56 L72 54" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

export function ShoeGear({ id }: { id?: string }) {
  switch (id) {
    case "pet_shoes_sneakers":
      return (
        <g className="sprout-shoes">
          {[38, 62].map((x) => (
            <g key={x} className="sprout-foot">
              <ellipse cx={x} cy="98" rx="11" ry="6" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
              <path d={`M${x - 9} 100 h18`} stroke="#ef4444" strokeWidth="2.4" strokeLinecap="round" />
            </g>
          ))}
        </g>
      );
    case "pet_shoes_boots":
      return (
        <g className="sprout-shoes">
          {[38, 62].map((x) => (
            <g key={x} className="sprout-foot">
              <rect x={x - 9} y="90" width="18" height="12" rx="4" fill="#92400e" />
              <rect x={x - 11} y="99" width="22" height="5" rx="2.5" fill="#451a03" />
            </g>
          ))}
        </g>
      );
    case "pet_shoes_rocket":
      return (
        <g className="sprout-shoes">
          {[38, 62].map((x) => (
            <g key={x} className="sprout-foot">
              <rect x={x - 9} y="92" width="18" height="9" rx="4" fill="#94a3b8" stroke="#475569" strokeWidth="1.5" />
              <path d={`M${x - 5} 102 L${x} 112 L${x + 5} 102 Z`} fill="#f59e0b" className="sprout-flame" />
            </g>
          ))}
        </g>
      );
    default:
      return null;
  }
}

export function HatGear({ id }: { id?: string }) {
  switch (id) {
    case "pet_hat_cap":
      return (
        <g>
          <path d="M26 42 C26 24 74 24 74 42 Z" fill="#ef4444" />
          <path d="M60 41 C72 40 82 42 86 46 C78 48 66 47 58 45 Z" fill="#b91c1c" />
          <circle cx="50" cy="28" r="2.6" fill="#fecaca" />
        </g>
      );
    case "pet_hat_headphones":
      return (
        <g>
          <path d="M26 50 C24 22 76 22 74 50" stroke="#1e293b" strokeWidth="5" fill="none" strokeLinecap="round" />
          <rect x="18" y="46" width="12" height="20" rx="6" fill="#334155" />
          <rect x="70" y="46" width="12" height="20" rx="6" fill="#334155" />
          <rect x="21" y="50" width="6" height="12" rx="3" fill="#3b6df6" />
          <rect x="73" y="50" width="6" height="12" rx="3" fill="#3b6df6" />
        </g>
      );
    case "pet_hat_wizard":
      return (
        <g>
          <path d="M24 42 C34 38 66 38 76 42 L64 40 L52 4 L36 40 Z" fill="#6d28d9" />
          <ellipse cx="50" cy="41" rx="28" ry="5" fill="#5b21b6" />
          <path d="M50 16 l1.6 4 4 .4 -3 2.8 1 4 -3.6 -2.2 -3.6 2.2 1 -4 -3 -2.8 4 -.4z" fill="#fbbf24" />
        </g>
      );
    case "pet_hat_crown":
      return (
        <g>
          <path d="M30 40 L28 22 L40 30 L50 16 L60 30 L72 22 L70 40 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="50" cy="26" r="2.6" fill="#ef4444" />
          <circle cx="38" cy="34" r="2" fill="#3b82f6" />
          <circle cx="62" cy="34" r="2" fill="#10b981" />
        </g>
      );
    default:
      return null;
  }
}
