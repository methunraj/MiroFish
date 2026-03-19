"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { icon: "◈", label: "DOCUMENT", href: "/new-project" },
  { icon: "◎", label: "MARKET", href: "/prompt-sim" },
  { icon: "▣", label: "PRODUCT", href: "/product-sim" },
  { icon: "♦", label: "ECONOMY", href: "/economy-sim" },
  { icon: "⚙", label: "WORKBENCH", href: "/workbench" },
  { icon: "◷", label: "HISTORY", href: "/history" },
];

export function StandaloneNav() {
  const pathname = usePathname();

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="sticky top-0 z-50 border-b-2 border-border bg-background/90 backdrop-blur-md"
    >
      <div className="max-w-6xl mx-auto flex items-center h-12 px-4 gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
        >
          <span className="font-[family-name:var(--font-pixel)] text-[9px] text-primary tracking-widest">
            PARALLAX
          </span>
        </Link>

        <div className="h-5 w-px bg-border shrink-0 hidden sm:block" />

        <nav className="flex-1 overflow-x-auto flex items-center gap-1 scrollbar-none hidden sm:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 text-[8px] font-[family-name:var(--font-pixel)] uppercase tracking-wider whitespace-nowrap transition-all",
                  active
                    ? "text-primary border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-sm">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/"
          className="ml-auto font-[family-name:var(--font-pixel)] text-[7px] text-muted-foreground hover:text-primary transition-colors tracking-wider uppercase sm:hidden"
        >
          ← HOME
        </Link>
      </div>
    </motion.header>
  );
}
