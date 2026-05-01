import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/cn";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nada-accent disabled:pointer-events-none disabled:opacity-40 select-none active:scale-[0.97]",
  {
    variants: {
      variant: {
        primary:
          "bg-nada-accent text-white rounded-xl shadow-sm hover:shadow-md hover:brightness-110",
        secondary:
          "bg-nada-muted text-nada-primary rounded-xl hover:bg-nada-border/60",
        ghost:
          "text-nada-primary rounded-xl hover:bg-nada-muted",
        danger:
          "bg-nada-danger text-white rounded-xl shadow-sm hover:brightness-110",
        outline:
          "border border-nada-border text-nada-primary rounded-xl hover:bg-nada-muted"
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-sm",
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
