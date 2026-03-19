import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const PixelInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full border-2 border-border bg-background px-3 py-1",
        "font-[family-name:var(--font-pixel-body)] text-base text-foreground",
        "placeholder:text-muted-foreground",
        "focus:border-primary focus:outline-none focus:shadow-[0_0_8px_color-mix(in_srgb,var(--primary)_40%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
PixelInput.displayName = "PixelInput";

const PixelTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full border-2 border-border bg-background px-3 py-2",
        "font-[family-name:var(--font-pixel-body)] text-base text-foreground resize-none",
        "placeholder:text-muted-foreground",
        "focus:border-primary focus:outline-none focus:shadow-[0_0_8px_color-mix(in_srgb,var(--primary)_40%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
PixelTextarea.displayName = "PixelTextarea";

export { PixelInput, PixelTextarea };
