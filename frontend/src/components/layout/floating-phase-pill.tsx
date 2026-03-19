"use client";

import { useAppStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";

export function FloatingPhasePill() {
  const phase = useAppStore((s) => s.currentPhase);
  const progress = useAppStore((s) => s.currentPhaseProgress);

  if (!phase) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
        "border-2 border-border bg-card px-4 py-2 shadow-[3px_3px_0px_var(--border)]",
        "flex items-center gap-3"
      )}
    >
      <span className="font-[family-name:var(--font-pixel)] text-[8px] text-foreground uppercase whitespace-nowrap">
        {phase}
      </span>
      <div className="flex gap-px h-2 w-24">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 min-w-[3px] border border-border",
              i < Math.round(progress / 10) ? "bg-primary" : "bg-muted/30"
            )}
          />
        ))}
      </div>
    </div>
  );
}
