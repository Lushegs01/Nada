import { cn } from "../lib/cn";

export interface AvatarProps {
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  showRing?: boolean;
}

const AVATAR_GRADIENTS = [
  "from-indigo-400 via-violet-400 to-indigo-600",
  "from-sky-400 via-cyan-400 to-blue-600",
  "from-emerald-400 via-teal-400 to-emerald-600",
  "from-amber-400 via-orange-400 to-rose-500",
  "from-rose-400 via-pink-400 to-fuchsia-500",
  "from-violet-400 via-purple-400 to-indigo-600",
  "from-fuchsia-400 via-pink-400 to-purple-600",
  "from-lime-400 via-emerald-400 to-green-600"
] as const;

const SIZE_MAP = {
  sm: "h-9 w-9 text-xs rounded-[12px]",
  md: "h-11 w-11 text-sm rounded-[14px]",
  lg: "h-14 w-14 text-base rounded-[18px]"
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
        "grid shrink-0 place-items-center bg-gradient-to-br font-bold text-white select-none transition-all duration-200",
        showRing && "ring-2 ring-nada-accent/35",
        gradient,
        SIZE_MAP[size],
        className
      )}
      style={{
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px rgba(0,0,0,0.30)"
      }}
    >
      {initial}
    </div>
  );
}
