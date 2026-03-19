"use client";

import { useAppStore } from "@/lib/store/app-store";
import { PixelBadge } from "@/components/ui/pixel-badge";

interface TopBarProps {
  breadcrumbs?: { label: string; href?: string }[];
}

export function TopBar({ breadcrumbs }: TopBarProps) {
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);

  return (
    <header className="h-12 border-b-2 border-border bg-background/80 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-30">
      <nav className="flex items-center gap-1 font-[family-name:var(--font-pixel-sm)] text-[10px] text-muted-foreground">
        {breadcrumbs?.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-border">/</span>}
            <span className={i === (breadcrumbs.length - 1) ? "text-foreground" : ""}>
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="hidden md:flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <PixelBadge variant="muted">CMD+K</PixelBadge>
      </button>
    </header>
  );
}
