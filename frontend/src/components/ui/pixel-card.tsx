import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface PixelCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

const PixelCard = forwardRef<HTMLDivElement, PixelCardProps>(
  ({ className, glow, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "border-2 border-border bg-card text-card-foreground p-4",
          "shadow-[3px_3px_0px_var(--border)] transition-all",
          glow &&
            "border-primary shadow-[0_0_8px_color-mix(in_srgb,var(--primary)_40%,transparent),3px_3px_0px_var(--primary)]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
PixelCard.displayName = "PixelCard";

export { PixelCard };
