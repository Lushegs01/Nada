import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nada-accent disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-br from-nada-accent to-nada-gold-dark text-white rounded-xl shadow-md hover:shadow-lg hover:brightness-110 active:scale-[0.98] transform",
        secondary:
          "bg-nada-surface-elevated text-nada-primary rounded-xl hover:bg-nada-surface-3 border border-nada-border/30 shadow-sm hover:shadow-md active:scale-[0.98] transform",
        ghost:
          "text-nada-primary rounded-xl hover:bg-nada-muted/40 active:scale-[0.98] transform",
        danger:
          "bg-nada-danger text-white rounded-xl shadow-md hover:brightness-110 active:scale-[0.98] transform",
        outline:
          "border border-nada-border/50 text-nada-primary rounded-xl hover:bg-nada-muted/30 hover:border-nada-border/80 active:scale-[0.98] transform"
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base"
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
