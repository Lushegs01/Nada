"use client";

import React from "react";
import { cn } from "../lib/cn";

/* ──────────────────────────────────────────────────────────
   GlassPanel — frosted glass surface primitive
   Used for: headers, call overlays, drawers, popovers
   ────────────────────────────────────────────────────────── */

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Blur intensity — maps to backdrop-filter blur amount */
  blur?: "sm" | "md" | "lg" | "xl";
  /** Whether to show the hairline border */
  border?: boolean;
  /** Elevation level — controls shadow depth */
  elevation?: 0 | 1 | 2 | 3 | 4;
  /** Round all corners (pill for capsules) */
  radius?: "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  children?: React.ReactNode;
}

const BLUR_MAP = {
  sm:  "backdrop-blur-[8px]",
  md:  "backdrop-blur-[16px]",
  lg:  "backdrop-blur-[24px]",
  xl:  "backdrop-blur-[40px]",
};

const ELEVATION_STYLES: Record<number, string> = {
  0: "",
  1: "shadow-e1",
  2: "shadow-e2",
  3: "shadow-e3",
  4: "shadow-e4",
};

const RADIUS_MAP = {
  none: "rounded-none",
  sm:   "rounded-sm",
  md:   "rounded-md",
  lg:   "rounded-lg",
  xl:   "rounded-xl",
  "2xl":"rounded-2xl",
  full: "rounded-full",
};

export function GlassPanel({
  blur = "lg",
  border = true,
  elevation = 2,
  radius = "xl",
  className,
  style,
  children,
  ...rest
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "relative",
        BLUR_MAP[blur],
        RADIUS_MAP[radius],
        ELEVATION_STYLES[elevation],
        border && "border border-white/[0.07]",
        className,
      )}
      style={{
        background: "rgb(var(--n-s1) / 0.74)",
        WebkitBackdropFilter: blur !== undefined ? undefined : undefined,
        ...style,
      }}
      {...rest}
    >
      {/* Inner highlight — top edge */}
      {elevation > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-inherit"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }}
        />
      )}
      {children}
    </div>
  );
}
