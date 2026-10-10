import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-teal-600 text-white dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/30",
        secondary:
          "border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
        outline: "text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
        destructive:
          "border-transparent bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
        amber:
          "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
        emerald:
          "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
