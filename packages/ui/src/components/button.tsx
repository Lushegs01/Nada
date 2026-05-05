import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 font-semibold tracking-tight transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nada-accent disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary:
          "rounded-2xl text-white border border-nada-accent/45 nada-btn-gold active:scale-[0.98]",
        secondary:
          "rounded-2xl bg-nada-surface-elevated/70 text-nada-primary backdrop-blur-md border border-nada-border/30 hover:bg-nada-surface-3/80 hover:border-nada-border/50 hover:-translate-y-0.5 active:scale-[0.98] shadow-sm",
        ghost:
          "rounded-2xl text-nada-primary hover:bg-nada-surface-elevated/40 active:scale-[0.98]",
        danger:
          "rounded-2xl bg-nada-danger text-white shadow-md hover:brightness-110 active:scale-[0.98]",
        outline:
          "rounded-2xl border border-nada-border/40 text-nada-primary hover:bg-nada-surface-elevated/35 hover:border-nada-border/70 active:scale-[0.98]"
      },
      size: {
        sm: "h-9 px-3.5 text-xs",
        md: "h-11 px-5 text-[13.5px]",
        lg: "h-12 px-6 text-[14.5px]"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, ...props }, ref) => (
    <button
      className={cn(buttonStyles({ size, variant }), className)}
      ref={ref}
      {...props}
    />
  )
);

Button.displayName = "Button";
