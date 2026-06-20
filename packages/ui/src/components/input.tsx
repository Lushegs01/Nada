import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", error, helperText, ...props }, ref) => (
    <div className="w-full">
      <input
        type={type}
        ref={ref}
        className={cn(
          "w-full h-11 px-4 py-2.5 rounded-lg font-medium text-sm",
          "bg-nada-input/60 backdrop-blur-sm -webkit-backdrop-filter-blur-sm",
          "border border-nada-border/25",
          "text-nada-primary placeholder:text-nada-secondary/50",
          "transition-all duration-300",
          "focus:outline-none focus:bg-nada-input/80 focus:border-nada-accent/50 focus:ring-4 focus:ring-nada-accent/10",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-nada-danger/50 focus:border-nada-danger focus:ring-nada-danger/10",
          className
        )}
        {...props}
      />
      {helperText && (
        <p className={cn(
          "mt-1.5 text-xs",
          error ? "text-nada-danger" : "text-nada-secondary/60"
        )}>
          {helperText}
        </p>
      )}
    </div>
  )
);

Input.displayName = "Input";

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  InputHTMLAttributes<HTMLTextAreaElement> & {
    error?: boolean;
    helperText?: string;
  }
>(({ className, error, helperText, ...props }, ref) => (
  <div className="w-full">
    <textarea
      ref={ref}
      className={cn(
        "w-full px-4 py-3 rounded-lg font-medium text-sm resize-none",
        "bg-nada-input/60 backdrop-blur-sm -webkit-backdrop-filter-blur-sm",
        "border border-nada-border/25",
        "text-nada-primary placeholder:text-nada-secondary/50",
        "transition-all duration-300",
        "focus:outline-none focus:bg-nada-input/80 focus:border-nada-accent/50 focus:ring-4 focus:ring-nada-accent/10",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        error && "border-nada-danger/50 focus:border-nada-danger focus:ring-nada-danger/10",
        className
      )}
      {...props}
    />
    {helperText && (
      <p className={cn(
        "mt-1.5 text-xs",
        error ? "text-nada-danger" : "text-nada-secondary/60"
      )}>
        {helperText}
      </p>
    )}
  </div>
));

TextArea.displayName = "TextArea";
