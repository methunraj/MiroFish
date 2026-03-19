"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentPortrait } from "@/components/shared/agent-portrait";
import type { SimEvent } from "@/lib/hooks/use-sim-stream";

interface LiveActivityFeedProps {
  events: SimEvent[];
  onAgentClick?: (agentId: string) => void;
  className?: string;
}

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  post: { icon: "✎", color: "#5B8CF0", label: "posted" },
  like: { icon: "♥", color: "#E05038", label: "liked" },
  comment: { icon: "↩", color: "#9BBC0F", label: "commented" },
  thread_created: { icon: "◈", color: "#5B8CF0", label: "started thread" },
  debate_start: { icon: "⚔", color: "#F8B800", label: "debate started" },
  debate_turn: { icon: "◆", color: "#F8B800", label: "argued" },
  debate_end: { icon: "✓", color: "#F8B800", label: "debate ended" },
  opinion_shift: { icon: "↗", color: "#E05038", label: "changed stance" },
  faction_join: { icon: "⊕", color: "#9BBC0F", label: "joined faction" },
  external_event: { icon: "⚡", color: "#E05038", label: "BREAKING" },
  phase_start: { icon: "▶", color: "#9BBC0F", label: "phase started" },
  phase_end: { icon: "■", color: "#9BBC0F", label: "phase ended" },
};

function EventCard({ event, onAgentClick }: { event: SimEvent; onAgentClick?: (id: string) => void }) {
  const config = EVENT_CONFIG[event.event_type] || { icon: "●", color: "#666", label: event.event_type };
  const preview = event.data?.content?.slice(0, 100) || event.data?.message?.slice(0, 100) || event.data?.post_preview?.slice(0, 100) || "";

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className="flex gap-2 items-start px-2 py-1.5 border-b border-dashed border-border/30 hover:bg-card/40 transition-colors cursor-pointer"
      style={{ borderLeftColor: config.color, borderLeftWidth: "2px" }}
      onClick={() => event.agent_id && onAgentClick?.(event.agent_id)}
    >
      {event.agent_portrait || event.agent_name ? (
        <AgentPortrait src={event.agent_portrait} name={event.agent_name || "?"} size="sm" className="!size-6" />
      ) : (
        <div className="size-6 flex items-center justify-center border border-border" style={{ color: config.color }}>
          <span className="text-xs">{config.icon}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span style={{ color: config.color }} className="text-[9px]">{config.icon}</span>
          {event.agent_name && (
            <span className="font-[family-name:var(--font-pixel)] text-[6px] text-foreground truncate">
              {event.agent_name}
            </span>
          )}
          <span className="font-[family-name:var(--font-pixel-sm)] text-[7px] text-muted-foreground">
            {config.label}
          </span>
        </div>
        {preview && (
          <p className="font-[family-name:var(--font-pixel-body)] text-[11px] text-foreground/70 leading-tight truncate">
            {preview}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function LiveActivityFeed({ events, onAgentClick, className }: LiveActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const displayEvents = events.filter(
    (e) => e.event_type !== "heartbeat" && e.type !== "heartbeat"
  );

  return (
    <div className={`flex flex-col ${className || ""}`}>
      <div className="px-2 py-1.5 border-b-2 border-border flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-widest text-[#9BBC0F]">
          Live Feed
        </h3>
        <span className="font-[family-name:var(--font-pixel-sm)] text-[7px] text-muted-foreground">
          {displayEvents.length} events
        </span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto max-h-[500px]">
        <AnimatePresence mode="popLayout">
          {displayEvents.slice(-100).map((event, i) => (
            <EventCard key={event.id ?? `${event.event_type}-${i}`} event={event} onAgentClick={onAgentClick} />
          ))}
        </AnimatePresence>
        {displayEvents.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <span className="font-[family-name:var(--font-pixel)] text-[7px] text-muted-foreground uppercase tracking-widest pixel-blink">
              Waiting for events...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
