import { cn } from "../lib/cn";

export interface AvatarProps {
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  showRing?: boolean;
}

const AVATAR_GRADIENTS = [
  "from-nada-accent via-blue-500 to-nada-gold-dark",
  "from-cyan-400 to-nada-accent",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-pink-600",
  "from-purple-400 to-nada-accent",
  "from-fuchsia-400 to-purple-600",
  "from-lime-400 to-green-600"
] as const;

const SIZE_MAP = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base"
} as const;

function hashLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function Avatar({ className, label, size = "md", showRing = false }: AvatarProps): JSX.Element {
  const initial = label.trim().charAt(0).toUpperCase() || "N";
  const gradientIndex = hashLabel(label) % AVATAR_GRADIENTS.length;
  const gradient = AVATAR_GRADIENTS[gradientIndex];

  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white select-none shadow-md transition-all duration-200",
        showRing && "ring-2 ring-nada-accent/30",
        gradient,
        SIZE_MAP[size],
        className
      )}
    >
      {initial}
    </div>
  );
}
