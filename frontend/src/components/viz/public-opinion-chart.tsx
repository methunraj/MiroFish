"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface AgentOpinion {
  id: string;
  name: string;
  portrait_url?: string;
  sentiment?: number;
  faction?: string;
  mood?: string;
  influence?: number;
}

interface OpinionShift {
  agent_name?: string;
  data?: {
    old_sentiment?: number;
    new_sentiment?: number;
    reason?: string;
  };
}

interface PublicOpinionChartProps {
  agents: AgentOpinion[];
  factions?: Record<string, number>;
  avgSentiment?: number;
  shifts?: OpinionShift[];
  className?: string;
}

const FACTION_COLORS: Record<string, string> = {
  Supporters: "#9BBC0F",
  Skeptics: "#E05038",
  Moderates: "#5B8CF0",
  Undecided: "#666",
};

export function PublicOpinionChart({
  agents,
  factions,
  avgSentiment,
  shifts,
  className,
}: PublicOpinionChartProps) {
  const sentimentDistribution = useMemo(() => {
    const buckets = [
      { range: "1-2", count: 0, color: "#E05038" },
      { range: "3-4", count: 0, color: "#E05038" },
      { range: "5-6", count: 0, color: "#5B8CF0" },
      { range: "7-8", count: 0, color: "#9BBC0F" },
      { range: "9-10", count: 0, color: "#9BBC0F" },
    ];
    for (const a of agents) {
      const s = a.sentiment ?? 5;
      if (s <= 2) buckets[0].count++;
      else if (s <= 4) buckets[1].count++;
      else if (s <= 6) buckets[2].count++;
      else if (s <= 8) buckets[3].count++;
      else buckets[4].count++;
    }
    return buckets;
  }, [agents]);

  const factionData = useMemo(() => {
    if (!factions) return [];
    return Object.entries(factions).map(([name, count]) => ({
      name,
      value: count,
      color: FACTION_COLORS[name] || "#666",
    }));
  }, [factions]);

  return (
    <div className={`flex flex-col gap-3 p-2 ${className || ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-widest text-[#9BBC0F]">
          Public Opinion
        </h3>
        {avgSentiment !== undefined && (
          <span className="font-[family-name:var(--font-pixel)] text-[8px] text-[#F8B800]">
            AVG: {avgSentiment.toFixed(1)}/10
          </span>
        )}
      </div>

      {/* Sentiment Distribution */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2"
      >
        <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
          Sentiment Distribution
        </span>
        <div className="mt-1" style={{ width: "100%", height: 120 }}>
          <ResponsiveContainer width="100%" height={120} minWidth={100} minHeight={80}>
            <BarChart data={sentimentDistribution}>
              <XAxis
                dataKey="range"
                tick={{ fontSize: 8, fontFamily: "var(--font-pixel-sm)" }}
                stroke="var(--border)"
              />
              <YAxis
                tick={{ fontSize: 8 }}
                stroke="var(--border)"
                width={25}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "2px solid var(--border)",
                  fontFamily: "var(--font-pixel-body)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count">
                {sentimentDistribution.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Factions Pie */}
      {factionData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2"
        >
          <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
            Factions
          </span>
          <div className="flex items-center gap-3">
            <div style={{ width: 100, height: 100 }}>
              <ResponsiveContainer width={100} height={100} minWidth={80} minHeight={80}>
                <PieChart>
                  <Pie
                    data={factionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={20}
                    outerRadius={40}
                    dataKey="value"
                  >
                    {factionData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1">
              {factionData.map((f) => (
                <div key={f.name} className="flex items-center gap-1.5">
                  <span className="size-2.5" style={{ background: f.color }} />
                  <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-foreground">
                    {f.name}: {f.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Recent Shifts */}
      {shifts && shifts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2"
        >
          <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
            Recent Opinion Shifts
          </span>
          <div className="mt-1 space-y-1 max-h-[120px] overflow-y-auto">
            {shifts.slice(0, 10).map((s, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] font-[family-name:var(--font-pixel-body)]">
                <span className="text-[#F8B800]">↗</span>
                <span className="text-foreground/80">{s.agent_name}</span>
                <span className="text-muted-foreground">
                  {s.data?.old_sentiment?.toFixed(1)} → {s.data?.new_sentiment?.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
