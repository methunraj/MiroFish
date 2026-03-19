"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { PixelBadge } from "@/components/ui/pixel-badge";

interface Activity {
  id: string;
  type: string;
  agent_name: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface CardStreamProps {
  activities: Activity[];
  className?: string;
}

const TYPE_CONFIG: Record<
  string,
  { variant: "blue" | "green" | "gold" | "coral" | "muted"; icon: string }
> = {
  browse: { variant: "blue", icon: "◈" },
  code: { variant: "green", icon: "▣" },
  file: { variant: "gold", icon: "◫" },
  search: { variant: "blue", icon: "◎" },
  message: { variant: "coral", icon: "◆" },
  think: { variant: "muted", icon: "◇" },
  tool: { variant: "gold", icon: "⚙" },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type.toLowerCase()] ?? { variant: "muted" as const, icon: "·" };
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

export function CardStream({ activities, className }: CardStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activities.length]);

  if (!activities.length) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center border-2 border-border bg-card min-h-[200px]",
          className
        )}
      >
        <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
          WAITING FOR ACTIVITY...
        </span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        "relative overflow-y-auto space-y-2 max-h-[480px] pr-1 scrollbar-thin",
        className
      )}
    >
      <AnimatePresence initial={false}>
        {activities.map((activity) => {
          const cfg = getTypeConfig(activity.type);

          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="border-2 border-border bg-card p-3 shadow-[2px_2px_0px_var(--border)]"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <PixelBadge variant={cfg.variant}>
                  {cfg.icon} {activity.type}
                </PixelBadge>
                <span className="font-[family-name:var(--font-pixel)] text-[8px] text-primary uppercase tracking-wider">
                  {activity.agent_name}
                </span>
                <span className="ml-auto text-[8px] font-[family-name:var(--font-pixel)] text-muted-foreground tabular-nums">
                  {formatTimestamp(activity.timestamp)}
                </span>
              </div>

              <p className="text-xs text-foreground/90 leading-relaxed line-clamp-3">
                {activity.content}
              </p>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
