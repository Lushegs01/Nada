import { type ButtonHTMLAttributes, forwardRef } from "react";

import { cn } from "../lib/cn";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, className, label, title, ...props }, ref) => (
    <button
      aria-label={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-nada-secondary transition-all duration-150",
        "hover:bg-nada-surface-elevated/55 hover:text-nada-primary hover:scale-105",
        "active:scale-95",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nada-accent",
        "disabled:pointer-events-none disabled:opacity-40",
        "select-none",
        className
      )}
      ref={ref}
      title={title ?? label}
      {...props}
    >
      {children}
    </button>
  )
);

IconButton.displayName = "IconButton";
