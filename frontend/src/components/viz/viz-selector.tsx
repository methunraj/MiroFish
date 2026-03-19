"use client";

import { cn } from "@/lib/utils";

export interface VizOption {
  id: string;
  label: string;
}

export interface VizSelectorProps {
  options: VizOption[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function VizSelector({ options, active, onChange, className }: VizSelectorProps) {
  if (!options?.length) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 border-2 border-border bg-card p-1 shadow-[2px_2px_0px_var(--border)]",
        className
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const isActive = opt.id === active;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.id)}
            className={cn(
              "inline-flex items-center px-2.5 py-1 border-2 text-[8px] font-[family-name:var(--font-pixel)] uppercase tracking-wider whitespace-nowrap transition-all select-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              isActive
                ? "border-[#9BBC0F] bg-[#9BBC0F] text-[#0F380F] shadow-[1px_1px_0px_#306230]"
                : "border-border bg-transparent text-muted-foreground hover:border-[#9BBC0F]/50 hover:text-[#9BBC0F]"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
