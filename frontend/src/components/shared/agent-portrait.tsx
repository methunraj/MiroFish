"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

interface AgentPortraitProps {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AgentPortrait({
  src,
  name,
  size = "md",
  className,
}: AgentPortraitProps) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sizeClasses = {
    sm: "size-8",
    md: "size-12",
    lg: "size-20",
  };

  if (!src || failed) {
    return (
      <div
        className={cn(
          "border-2 border-border bg-primary/20 flex items-center justify-center",
          "font-[family-name:var(--font-pixel)] text-primary",
          sizeClasses[size],
          size === "sm" && "text-[6px]",
          size === "md" && "text-[8px]",
          size === "lg" && "text-[12px]",
          className
        )}
      >
        {initials}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-2 border-border overflow-hidden",
        sizeClasses[size],
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        className="size-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
