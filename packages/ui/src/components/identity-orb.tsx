"use client";

import React from "react";
import { cn } from "../lib/cn";

/* ──────────────────────────────────────────────────────────────────────────
   IdentityOrb — the signature of NADA.
   A generative, living gradient blob that IS a user's identity. Never
   initials-in-a-circle, never a silhouette.

   • Deterministically seeded from any string (username, pubkey hash, code).
   • 3 HSL stops via FNV-1a hash + golden-angle (137.5°) distribution — always
     distinct, always saturated, always the same for the same seed (SSR-safe).
   • Shape morphs through an 8-value border-radius cycle over 8s (GPU-only).
   • Ambient glow seeded to the dominant hue; pulses gently.
   ────────────────────────────────────────────────────────────────────────── */

const SIZE_MAP = {
  xs: "w-6 h-6",
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
  xl: "w-20 h-20",
  "2xl": "w-28 h-28",
} as const;

const PX_MAP: Record<keyof typeof SIZE_MAP, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
  "2xl": 112,
};

export type OrbSize = keyof typeof SIZE_MAP;

export interface IdentityOrbProps {
  /** Seed string — username, pubkey hash, invite code. Fully deterministic. */
  seed: string;
  size?: OrbSize;
  /** Disable morph animation (also auto-disabled under prefers-reduced-motion) */
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Aria label override */
  label?: string;
}

/** FNV-1a — deterministic 32-bit hash, no crypto, SSR-stable */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Extract 3 HSL color stops from the seed using golden-angle distribution */
function seedToStops(seed: string): [string, string, string] {
  const h1 = fnv1a(seed || "anon");
  const h2 = fnv1a(`${seed}~b`);
  const h3 = fnv1a(`${seed}~c`);

  const hue1 = h1 % 360;
  const hue2 = (hue1 + 137 + (h2 % 46)) % 360; // golden angle spread
  const hue3 = (hue2 + 137 + (h3 % 46)) % 360;

  const s1 = 66 + (h1 % 14); // 66–80%
  const s2 = 60 + (h2 % 18);
  const s3 = 70 + (h3 % 12);

  const l1 = 54 + (h1 % 12); // 54–66%
  const l2 = 48 + (h2 % 16);
  const l3 = 56 + (h3 % 12);

  return [
    `hsl(${hue1}deg ${s1}% ${l1}%)`,
    `hsl(${hue2}deg ${s2}% ${l2}%)`,
    `hsl(${hue3}deg ${s3}% ${l3}%)`,
  ];
}

/** Dominant hue → glow color */
function seedToGlowHue(seed: string): number {
  return fnv1a(seed || "anon") % 360;
}

export function IdentityOrb({
  seed,
  size = "md",
  animate = true,
  className,
  style,
  label,
}: IdentityOrbProps): JSX.Element {
  const [stop1, stop2, stop3] = seedToStops(seed);
  const glowHue = seedToGlowHue(seed);
  const px = PX_MAP[size];

  return (
    <div
      role="img"
      aria-label={label ?? `Identity orb for ${seed || "anonymous"}`}
      className={cn(
        "n-orb flex-shrink-0",
        SIZE_MAP[size],
        !animate && "!animate-none !rounded-full",
        className,
      )}
      style={{
        background: `radial-gradient(ellipse at 32% 30%, ${stop1} 0%, ${stop2} 52%, ${stop3} 100%)`,
        boxShadow: `0 0 ${Math.round(px * 0.55)}px hsl(${glowHue}deg 70% 55% / 0.42), 0 0 ${Math.round(px * 0.22)}px hsl(${glowHue}deg 72% 58% / 0.55)`,
        ...style,
      }}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   GroupOrb — 2–3 orbs composited for group chats, with a subtle blend.
   ────────────────────────────────────────────────────────────────────────── */

export interface GroupOrbProps {
  seeds: string[]; // 2 or 3 seeds; extras ignored
  size?: OrbSize;
  className?: string;
}

export function GroupOrb({ seeds, size = "md", className }: GroupOrbProps): JSX.Element {
  const shown = seeds.slice(0, 3);
  const subSize: OrbSize =
    size === "2xl" ? "xl" : size === "xl" ? "lg" : size === "lg" ? "md" : size === "md" ? "sm" : "xs";

  if (shown.length <= 1) {
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
            style={{ zIndex: 2, opacity: 0.92, mixBlendMode: "screen" }}
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
            style={{ zIndex: 2, opacity: 0.9, mixBlendMode: "screen" }}
          />
          <IdentityOrb
            seed={shown[2] ?? "anon-c"}
            size={subSize}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ zIndex: 3, opacity: 0.85, mixBlendMode: "screen" }}
          />
        </>
      )}
    </div>
  );
}
