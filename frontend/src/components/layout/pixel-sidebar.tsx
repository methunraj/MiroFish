"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store/app-store";

const NAV_ITEMS = [
  { icon: "⌂", label: "HOME", href: "/" },
  { icon: "◈", label: "DOCUMENT SIM", href: "/new-project" },
  { icon: "◎", label: "MARKET SIM", href: "/prompt-sim" },
  { icon: "▣", label: "PRODUCT SIM", href: "/product-sim" },
  { icon: "♦", label: "ECONOMY SIM", href: "/economy-sim" },
];

export function PixelSidebar() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState(false);
  const history = useAppStore((s) => s.history);

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "fixed left-0 top-0 z-40 h-full bg-sidebar border-r-2 border-sidebar-border",
        "transition-all duration-200 flex flex-col",
        "hidden md:flex",
        hovered ? "w-56" : "w-14"
      )}
    >
      <div className="h-12 flex items-center justify-center border-b-2 border-sidebar-border px-2">
        <span className="font-[family-name:var(--font-pixel)] text-[8px] text-primary">
          {hovered ? "PARALLAX" : "PX"}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 h-10 text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
                active && "border-l-2 border-primary bg-sidebar-accent"
              )}
            >
              <span className="text-base w-6 text-center shrink-0">
                {item.icon}
              </span>
              {hovered && (
                <span className="font-[family-name:var(--font-pixel)] text-[7px] tracking-wider truncate">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {hovered && history.length > 0 && (
        <div className="border-t-2 border-sidebar-border p-2 max-h-48 overflow-y-auto">
          <span className="font-[family-name:var(--font-pixel-sm)] text-[9px] text-muted-foreground px-2 block mb-1">
            RECENT
          </span>
          {history.slice(0, 5).map((h) => (
            <div
              key={h.id}
              className="px-2 py-1 text-[11px] font-[family-name:var(--font-pixel-body)] text-sidebar-foreground truncate"
            >
              {h.name}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
