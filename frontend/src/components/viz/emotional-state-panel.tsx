"use client";

import { motion } from "framer-motion";

interface AgentEmotion {
  id: string;
  name: string;
  portrait_url?: string;
  mood: string;
  sentiment: number;
}

interface EmotionalStatePanelProps {
  agents: AgentEmotion[];
  className?: string;
}

const MOOD_EMOJI: Record<string, string> = {
  excited: "★",
  confident: "▲",
  calm: "◆",
  neutral: "●",
  anxious: "◇",
  frustrated: "▼",
  skeptical: "✕",
};

const MOOD_COLOR: Record<string, string> = {
  excited: "#F8B800",
  confident: "#9BBC0F",
  calm: "#5B8CF0",
  neutral: "#666",
  anxious: "#E05038",
  frustrated: "#E05038",
  skeptical: "#E05038",
};

export function EmotionalStatePanel({ agents, className }: EmotionalStatePanelProps) {
  const moodCounts: Record<string, number> = {};
  for (const a of agents) {
    moodCounts[a.mood] = (moodCounts[a.mood] || 0) + 1;
  }

  return (
    <div className={`flex flex-col gap-2 p-2 ${className || ""}`}>
      <h3 className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-widest text-[#5B8CF0] px-1">
        Emotional State
      </h3>

      {/* Mood distribution bar */}
      <div className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2">
        <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
          Mood Distribution
        </span>
        <div className="flex h-5 mt-1 overflow-hidden border border-border">
          {Object.entries(moodCounts).map(([mood, count]) => (
            <div
              key={mood}
              className="h-full flex items-center justify-center"
              style={{
                width: `${(count / Math.max(agents.length, 1)) * 100}%`,
                background: MOOD_COLOR[mood] || "#666",
                minWidth: count > 0 ? "8px" : "0",
              }}
            >
              {count > 1 && (
                <span className="text-[7px] text-black font-bold">{count}</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
          {Object.entries(moodCounts).map(([mood, count]) => (
            <div key={mood} className="flex items-center gap-1">
              <span style={{ color: MOOD_COLOR[mood] || "#666" }} className="text-[10px]">
                {MOOD_EMOJI[mood] || "●"}
              </span>
              <span className="font-[family-name:var(--font-pixel-sm)] text-[7px] text-foreground/70">
                {mood} ({count})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Agent mood grid */}
      <div className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2">
        <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
          Agent Moods
        </span>
        <div className="grid grid-cols-6 gap-1 mt-1 max-h-[200px] overflow-y-auto">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.02 }}
              className="flex flex-col items-center gap-0.5 p-1"
              title={`${agent.name}: ${agent.mood} (${agent.sentiment.toFixed(1)})`}
            >
              <div
                className="size-6 flex items-center justify-center border border-border text-[10px]"
                style={{ borderColor: MOOD_COLOR[agent.mood] || "#666", boxShadow: `0 0 4px ${MOOD_COLOR[agent.mood] || "#666"}40` }}
              >
                {MOOD_EMOJI[agent.mood] || "●"}
              </div>
              <span className="font-[family-name:var(--font-pixel)] text-[5px] text-foreground/60 truncate max-w-[40px]">
                {agent.name.split(" ")[0]}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
