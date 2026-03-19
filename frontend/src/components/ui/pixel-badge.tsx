import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface PixelBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "green" | "coral" | "gold" | "blue" | "muted";
}

const PixelBadge = forwardRef<HTMLSpanElement, PixelBadgeProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center px-2 py-0.5 border-2 text-[8px] font-[family-name:var(--font-pixel)] uppercase tracking-wider whitespace-nowrap",
          variant === "default" &&
            "border-primary bg-primary/20 text-primary",
          variant === "green" &&
            "border-[#9BBC0F] bg-[#9BBC0F]/20 text-[#9BBC0F]",
          variant === "coral" &&
            "border-[#E05038] bg-[#E05038]/20 text-[#E05038]",
          variant === "gold" &&
            "border-[#F8B800] bg-[#F8B800]/20 text-[#F8B800]",
          variant === "blue" &&
            "border-[#5B8CF0] bg-[#5B8CF0]/20 text-[#5B8CF0]",
          variant === "muted" &&
            "border-muted-foreground/40 bg-muted text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);
PixelBadge.displayName = "PixelBadge";

export { PixelBadge };
