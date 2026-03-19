"use client";

import { cn } from "@/lib/utils";

interface PixelProgressProps {
  value: number;
  max?: number;
  segments?: number;
  className?: string;
  label?: string;
}

export function PixelProgress({
  value,
  max = 100,
  segments = 20,
  className,
  label,
}: PixelProgressProps) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const filled = Math.round(pct * segments);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="font-[family-name:var(--font-pixel-sm)] text-[10px] text-muted-foreground uppercase">
          {label}
        </span>
      )}
      <div className="flex gap-px h-4">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 border border-border min-w-[4px] transition-colors duration-150",
              i < filled ? "bg-primary" : "bg-muted/30"
            )}
          />
        ))}
      </div>
      <span className="font-[family-name:var(--font-pixel)] text-[10px] text-foreground">
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}
