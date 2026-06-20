"use client";

import React from "react";
import { cn } from "../lib/cn";

/* ──────────────────────────────────────────────────────────
   GradientText — iridescent accent text
   Uses the single signature gradient: violet → blue → mint
   ────────────────────────────────────────────────────────── */

export interface GradientTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  /** Animate the gradient shift */
  animate?: boolean;
  /** Use a more subdued, shorter gradient */
  subtle?: boolean;
  as?: "span" | "h1" | "h2" | "h3" | "p" | "div";
}

export function GradientText({
  children,
  animate = false,
  subtle = false,
  as: Tag = "span",
  className,
  ...rest
}: GradientTextProps) {
  return (
    <Tag
      className={cn(
        "bg-clip-text text-transparent",
        subtle
          ? "bg-[linear-gradient(135deg,_#9B8BFC_0%,_#7C9EEB_50%,_#5DD9A8_100%)]"
          : "bg-[linear-gradient(135deg,_#7C3AED_0%,_#2563EB_50%,_#10D98A_100%)]",
        animate && "bg-[length:200%_auto] animate-[n-gradient-shift_6s_ease_infinite]",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
