"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";

const COMMANDS = [
  { label: "HOME", href: "/", section: "NAV" },
  { label: "NEW DOCUMENT SIM", href: "/new-project", section: "NAV" },
  { label: "NEW MARKET SIM", href: "/prompt-sim", section: "NAV" },
  { label: "NEW PRODUCT SIM", href: "/product-sim", section: "NAV" },
  { label: "NEW ECONOMY SIM", href: "/economy-sim", section: "NAV" },
];

export function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const router = useRouter();

  const filtered = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  const run = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [setOpen, router]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter" && filtered[selected]) {
        run(filtered[selected].href);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selected, run]);

  useEffect(() => setSelected(0), [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center pt-[20vh]">
      <div className="w-full max-w-md border-2 border-border bg-card shadow-[4px_4px_0px_var(--border)]">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="TYPE A COMMAND..."
          className="w-full h-10 px-4 bg-transparent font-[family-name:var(--font-pixel-body)] text-base text-foreground placeholder:text-muted-foreground border-b-2 border-border outline-none"
        />
        <div className="max-h-64 overflow-y-auto">
          {filtered.map((cmd, i) => (
            <button
              key={cmd.href}
              onClick={() => run(cmd.href)}
              className={cn(
                "w-full text-left px-4 py-2 font-[family-name:var(--font-pixel-body)] text-sm",
                i === selected
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground mr-2">
                {cmd.section}
              </span>
              {cmd.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center font-[family-name:var(--font-pixel-body)] text-muted-foreground">
              NO RESULTS
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
