"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@nada/ui";

// ── Emoji data ────────────────────────────────────────────────────────────────

const CATEGORIES: Array<{ label: string; emojis: string[] }> = [
  {
    label: "😀 Smileys",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇",
      "🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝",
      "🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄",
      "😬","🤥","😌","😔","😪","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵",
      "🥶","😵","🤯","🥳","😎","🤓","🧐","😕","😟","🙁","☹️","😮","😯",
      "😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣",
      "😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️",
      "💩","🤡","👹","👺","👻","👽","👾","🤖"
    ]
  },
  {
    label: "👋 Gestures",
    emojis: [
      "👋","🤚","🖐️","✋","🖖","👌","🤏","✌️","🤞","🤟","🤘","🤙",
      "👈","👉","👆","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏",
      "🙌","👐","🤲","🤝","🙏","💪","🫂"
    ]
  },
  {
    label: "❤️ Hearts",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕",
      "💞","💓","💗","💖","💘","💝","💟","🔥","✨","⭐","🌟","💫",
      "🎉","🎊","🎈","🏆","👑","💎","🌈","🌙","☀️","⚡","❄️"
    ]
  },
  {
    label: "🐶 Animals",
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮",
      "🐷","🐸","🐵","🐔","🐧","🐦","🦆","🦅","🦉","🦇","🐺","🐴",
      "🦄","🐝","🦋","🐌","🐞","🐜","🐢","🐍","🦎","🐙","🦑","🦐",
      "🦀","🐟","🐬","🐳","🦈","🦓","🐘","🦒","🐕","🐈"
    ]
  },
  {
    label: "🍎 Food",
    emojis: [
      "🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🍒","🍑","🥭","🍍",
      "🥥","🥝","🍅","🍆","🥑","🥦","🌶️","🍔","🍟","🍕","🌮","🌯",
      "🍝","🍜","🍣","🍱","🥟","🍙","🍚","🧁","🍰","🎂","🍫","🍿",
      "🍩","🍪","🌰","🥜","🧃","🥤","☕","🍵","🍺","🥂","🍷","🍸"
    ]
  },
  {
    label: "🏠 Objects",
    emojis: [
      "🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬",
      "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","✈️","🚂",
      "⛵","🚀","🛸","🎸","🎮","🕹️","🎲","🎯","🏀","⚽","🎾","🏐",
      "📱","💻","🖥️","⌚","📷","🎥","📺","📻","🔋","💡","🔑","🔒"
    ]
  }
];

// ── EmojiPicker component ─────────────────────────────────────────────────────

export function EmojiPicker({
  onSelect,
  onClose
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [activeCategory, setActiveCategory] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const category = CATEGORIES[activeCategory] ?? CATEGORIES[0]!;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-2xl border border-nada-border/50 bg-nada-surface shadow-2xl animate-scale-in origin-bottom-left"
      role="dialog"
      aria-label="Emoji picker"
    >
      {/* Category tabs */}
      <div className="flex gap-0.5 border-b border-nada-border/40 bg-nada-muted/60 px-2 py-1.5">
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat.label}
            aria-label={cat.label}
            onClick={() => setActiveCategory(i)}
            className={cn(
              "rounded-lg px-2 py-1.5 text-sm transition-colors",
              i === activeCategory
                ? "bg-nada-surface text-nada-primary shadow-sm"
                : "text-nada-secondary hover:bg-nada-surface/60 hover:text-nada-primary"
            )}
          >
            {cat.emojis[0]}
          </button>
        ))}
      </div>

      {/* Category label */}
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-nada-secondary">
        {category.label.split(" ").slice(1).join(" ")}
      </div>

      {/* Emoji grid */}
      <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {category.emojis.map((emoji) => (
          <button
            key={emoji}
            aria-label={emoji}
            onClick={() => onSelect(emoji)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-nada-muted active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
