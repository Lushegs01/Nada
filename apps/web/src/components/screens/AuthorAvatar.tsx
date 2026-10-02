"use client";
// Gradient initial avatars for anonymous Whispers handles. Shared by the feed,
// the notification inbox, the profile page and the "@" tag picker.
import { cn } from "@nada/ui";

// A soft gradient avatar derived from the author name so anonymous handles
// still get a stable, recognisable little identity chip.
export function authorGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 48) % 360} 68% 42%))`;
}

export function AuthorAvatar({
  name,
  onClick,
  size = "md"
}: {
  name: string;
  onClick?: (() => void) | undefined;
  size?: "md" | "sm";
}): JSX.Element {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const classes = cn(
    "grid shrink-0 place-items-center rounded-2xl font-bold text-white shadow-inner",
    size === "md" ? "h-10 w-10 text-[15px]" : "h-8 w-8 rounded-xl text-[12px]",
    onClick &&
      "cursor-pointer transition hover:ring-2 hover:ring-nada-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nada-accent"
  );
  const style = { backgroundImage: authorGradient(name) };
  if (!onClick) {
    return (
      <span className={classes} style={style}>
        {initial}
      </span>
    );
  }
  return (
    <button
      aria-label={`View ${name}'s profile`}
      className={classes}
      onClick={onClick}
      style={style}
      type="button"
    >
      {initial}
    </button>
  );
}
