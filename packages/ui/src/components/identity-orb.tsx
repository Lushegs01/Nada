"use client";

import React from "react";
import { cn } from "../lib/cn";

/* ──────────────────────────────────────────────────────────
   IdentityOrb — generative animated blob avatar
   Deterministically seeded from any string (username, pubkey hash).
   Three hue stops extracted via golden-angle distribution.
   Shape morphs on an 8s CSS keyframe cycle.
   ────────────────────────────────────────────────────────── */

const SIZE_MAP = {
  xs:  "w-6 h-6",
  sm:  "w-8 h-8",
  md:  "w-10 h-10",
  lg:  "w-14 h-14",
  xl:  "w-20 h-20",
  "2xl": "w-28 h-28",
} as const;

const PX_MAP: Record<keyof typeof SIZE_MAP, number> = {
  xs: 24, sm: 32, md: 40, lg: 56, xl: 80, "2xl": 112,
};

export type OrbSize = keyof typeof SIZE_MAP;

export interface IdentityOrbProps {
  /** Seed string — username, pubkey hash, invite code. Deterministic. */
  seed: string;
  size?: OrbSize;
  /** Disable morph animation (respects prefers-reduced-motion automatically) */
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Aria label override */
  label?: string;
}

/** Simple integer hash — deterministic, no crypto */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

/** Extract 3 HSL color stops from seed */
function seedToStops(seed: string): [string, string, string] {
  const h = hashStr(seed || "anon");
  const h2 = hashStr(seed + "~b");
  const h3 = hashStr(seed + "~c");

  const hue1 = (h >>> 0) % 360;
  const hue2 = (hue1 + 137 + (h2 % 40)) % 360;   // golden angle
  const hue3 = (hue2 + 137 + (h3 % 40)) % 360;

  const s1 = 65 + (h  % 15);  // 65–80 %
  const s2 = 60 + (h2 % 18);
  const s3 = 70 + (h3 % 12);

  const l1 = 52 + (h  % 14);  // 52–66 %
  const l2 = 48 + (h2 % 16);
  const l3 = 55 + (h3 % 12);

  return [
    `hsl(${hue1}, ${s1}%, ${l1}%)`,
    `hsl(${hue2}, ${s2}%, ${l2}%)`,
    `hsl(${hue3}, ${s3}%, ${l3}%)`,
  ];
}

/** Derive a glow color (dominant hue, high saturation) */
function seedToGlow(seed: string): string {
  const h = hashStr(seed || "anon");
  const hue = (h >>> 0) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

export function IdentityOrb({
  seed,
  size = "md",
  animate = true,
  className,
  style,
  label,
}: IdentityOrbProps) {
  const [stop1, stop2, stop3] = seedToStops(seed);
  const glowColor = seedToGlow(seed);
  const px = PX_MAP[size];

  return (
    <div
      role="img"
      aria-label={label ?? `Identity orb for ${seed || "anonymous"}`}
      className={cn(
        "n-orb flex-shrink-0",
        SIZE_MAP[size],
        !animate && "!animation-none !rounded-full",
        className,
      )}
      style={{
        background: `radial-gradient(ellipse at 35% 35%, ${stop1} 0%, ${stop2} 55%, ${stop3} 100%)`,
        boxShadow: `0 0 ${px * 0.5}px ${glowColor}40, 0 0 ${px * 0.2}px ${glowColor}60`,
        ...style,
      }}
    />
  );
}

/* ──────────────────────────────────────────────────────────
   GroupOrb — composites 2–3 orbs for group chats
   ────────────────────────────────────────────────────────── */

export interface GroupOrbProps {
  seeds: string[];          // 2 or 3 seeds; extras ignored
  size?: OrbSize;
  className?: string;
}

export function GroupOrb({ seeds, size = "md", className }: GroupOrbProps) {
  const shown = seeds.slice(0, 3);
  const px = PX_MAP[size];
  const subSize: OrbSize = size === "2xl" ? "xl" : size === "xl" ? "lg" : size === "lg" ? "md" : size === "md" ? "sm" : "xs";

  if (shown.length === 1) {
    return <IdentityOrb seed={shown[0] ?? "anon"} size={size} {...(className ? { className } : {})} />;
  }

  return (
    <div
      className={cn("relative flex-shrink-0", SIZE_MAP[size], className)}
      aria-label="Group chat"
      role="img"
    >
      {shown.length === 2 && (
        <>
          <IdentityOrb
            seed={shown[0] ?? "anon-a"}
            size={subSize}
            className="absolute bottom-0 left-0"
            style={{ zIndex: 1 }}
          />
          <IdentityOrb
            seed={shown[1] ?? "anon-b"}
            size={subSize}
            className="absolute top-0 right-0"
            style={{ zIndex: 2, opacity: 0.92 }}
          />
        </>
      )}
      {shown.length === 3 && (
        <>
          <IdentityOrb
            seed={shown[0] ?? "anon-a"}
            size={subSize}
            className="absolute bottom-0 left-0"
            style={{ zIndex: 1 }}
          />
          <IdentityOrb
            seed={shown[1] ?? "anon-b"}
            size={subSize}
            className="absolute top-0 right-0"
            style={{ zIndex: 2, opacity: 0.90 }}
          />
          <IdentityOrb
            seed={shown[2] ?? "anon-c"}
            size={subSize}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ zIndex: 3, opacity: 0.85 }}
          />
        </>
      )}
    </div>
  );
}
