"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "HOME", href: "/" },
  { label: "DOCUMENT SIM", href: "/new-project" },
  { label: "MARKET SIM", href: "/prompt-sim" },
  { label: "PRODUCT SIM", href: "/product-sim" },
  { label: "ECONOMY SIM", href: "/economy-sim" },
];

export function MobileDrawer() {
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <Sheet>
        <SheetTrigger
          className="fixed top-3 left-3 z-50 size-8 border-2 border-border bg-card flex items-center justify-center font-[family-name:var(--font-pixel)] text-[10px]"
        >
          ≡
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-64 border-r-2 border-border bg-sidebar p-0"
        >
          <div className="h-12 flex items-center px-4 border-b-2 border-border">
            <span className="font-[family-name:var(--font-pixel)] text-[10px] text-primary">
              PARALLAX
            </span>
          </div>
          <nav className="py-2">
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
                    "block px-4 py-2.5 font-[family-name:var(--font-pixel)] text-[8px] tracking-wider",
                    active
                      ? "text-primary bg-sidebar-accent border-l-2 border-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
