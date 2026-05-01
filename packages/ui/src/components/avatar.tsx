import { cn } from "../lib/cn";

export interface AvatarProps {
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const AVATAR_GRADIENTS = [
  "from-sky-400 to-blue-600",
  "from-violet-400 to-purple-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-pink-600",
  "from-cyan-400 to-sky-600",
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

export function Avatar({ className, label, size = "md" }: AvatarProps): JSX.Element {
  const initial = label.trim().charAt(0).toUpperCase() || "N";
  const gradientIndex = hashLabel(label) % AVATAR_GRADIENTS.length;
  const gradient = AVATAR_GRADIENTS[gradientIndex];

  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white select-none",
        gradient,
        SIZE_MAP[size],
        className
      )}
    >
      {initial}
    </div>
  );
}
