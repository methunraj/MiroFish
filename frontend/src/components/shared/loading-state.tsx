"use client";

import { cn } from "@/lib/utils";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({
  message = "LOADING...",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16",
        className
      )}
    >
      <div className="relative size-8">
        <div className="absolute inset-0 border-2 border-primary animate-spin [animation-timing-function:steps(8)]" />
        <div className="absolute inset-1 bg-primary/20" />
      </div>
      <span className="font-[family-name:var(--font-pixel-body)] text-lg text-muted-foreground">
        {message}
      </span>
    </div>
  );
}
