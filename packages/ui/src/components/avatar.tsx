import { cn } from "../lib/cn";
import { IdentityOrb, type OrbSize } from "./identity-orb";

/* ──────────────────────────────────────────────────────────────────────────
   Avatar — backwards-compatible wrapper that now renders an IdentityOrb.
   The prop interface is unchanged; the render is Vantage. No more initials.
   ────────────────────────────────────────────────────────────────────────── */

export interface AvatarProps {
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  showRing?: boolean;
}

const SIZE_TO_ORB: Record<NonNullable<AvatarProps["size"]>, OrbSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
};

export function Avatar({ className, label, size = "md", showRing = false }: AvatarProps): JSX.Element {
  return (
    <IdentityOrb
      seed={label}
      size={SIZE_TO_ORB[size]}
      label={label}
      className={cn(showRing && "ring-2 ring-n-accent/40 ring-offset-2 ring-offset-transparent", className)}
    />
  );
}
