"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

interface FactionAgent {
  id: string;
  name: string;
  sentiment: number;
  faction: string;
  influence?: number;
}

interface FactionMapProps {
  agents: FactionAgent[];
  onAgentClick?: (agentId: string) => void;
  className?: string;
}

const FACTION_COLORS: Record<string, string> = {
  Supporters: "#9BBC0F",
  Skeptics: "#E05038",
  Moderates: "#5B8CF0",
  "": "#666",
};

export function FactionMap({ agents, onAgentClick, className }: FactionMapProps) {
  const factionGroups = useMemo(() => {
    const groups: Record<string, FactionAgent[]> = {};
    for (const a of agents) {
      const f = a.faction || "Undecided";
      if (!groups[f]) groups[f] = [];
      groups[f].push(a);
    }
    return groups;
  }, [agents]);

  const totalAgents = agents.length || 1;

  return (
    <div className={`flex flex-col gap-2 p-2 ${className || ""}`}>
      <h3 className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-widest text-[#5B8CF0] px-1">
        Faction Map
      </h3>

      <div className="grid grid-cols-1 gap-2">
        {Object.entries(factionGroups).map(([faction, members], gi) => {
          const color = FACTION_COLORS[faction] || "#666";
          const pct = ((members.length / totalAgents) * 100).toFixed(0);
          const avgSentiment = members.reduce((s, m) => s + m.sentiment, 0) / members.length;

          return (
            <motion.div
              key={faction}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: gi * 0.1 }}
              className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="size-3" style={{ background: color }} />
                  <span className="font-[family-name:var(--font-pixel)] text-[7px] text-foreground uppercase">
                    {faction}
                  </span>
                </div>
                <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-foreground/60">
                  {members.length} ({pct}%) · avg {avgSentiment.toFixed(1)}
                </span>
              </div>

              {/* Member dots */}
              <div className="flex flex-wrap gap-1">
                {members.map((m, mi) => (
                  <motion.div
                    key={m.id}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: gi * 0.1 + mi * 0.02 }}
                    className="size-5 flex items-center justify-center border cursor-pointer hover:brightness-125 transition-all"
                    style={{
                      borderColor: color,
                      background: `${color}20`,
                      boxShadow: (m.influence || 0) > 0.6 ? `0 0 4px ${color}60` : "none",
                    }}
                    title={`${m.name}: sentiment=${m.sentiment.toFixed(1)}, influence=${(m.influence || 0).toFixed(2)}`}
                    onClick={() => onAgentClick?.(m.id)}
                  >
                    <span className="font-[family-name:var(--font-pixel)] text-[5px]" style={{ color }}>
                      {m.name[0]}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {agents.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <span className="font-[family-name:var(--font-pixel)] text-[7px] text-muted-foreground uppercase tracking-widest">
            No faction data yet...
          </span>
        </div>
      )}
    </div>
  );
}
