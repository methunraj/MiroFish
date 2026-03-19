"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface PixelButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "destructive" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}

const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(
  ({ className, variant = "default", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-[family-name:var(--font-pixel)] uppercase tracking-wider",
          "border-2 border-border transition-all select-none",
          "active:translate-y-px active:shadow-none",
          "disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          // sizes
          size === "sm" && "h-7 gap-1.5 px-3 text-[8px] shadow-[2px_2px_0px_var(--border)]",
          size === "md" && "h-9 gap-2 px-4 text-[10px] shadow-[2px_2px_0px_var(--border)]",
          size === "lg" && "h-11 gap-2.5 px-6 text-xs shadow-[3px_3px_0px_var(--border)]",
          // variants
          variant === "default" &&
            "bg-primary text-primary-foreground border-primary hover:brightness-110",
          variant === "secondary" &&
            "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          variant === "destructive" &&
            "bg-destructive text-white border-destructive hover:brightness-110",
          variant === "ghost" &&
            "border-transparent shadow-none bg-transparent hover:bg-muted",
          variant === "outline" &&
            "bg-transparent text-foreground hover:bg-muted",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
PixelButton.displayName = "PixelButton";

export { PixelButton };
