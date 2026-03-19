"use client";

import { motion } from "framer-motion";
import { AgentPortrait } from "@/components/shared/agent-portrait";

interface DebateTurn {
  id?: number;
  speaker_id: string;
  content: string;
  round: number;
  emotional_tone?: string;
}

interface Debate {
  id: string;
  topic: string;
  agent_a_id: string;
  agent_b_id: string;
  agent_a_name?: string;
  agent_b_name?: string;
  agent_a_portrait?: string;
  agent_b_portrait?: string;
  agent_a_stance?: string;
  agent_b_stance?: string;
  outcome?: string;
  winner_id?: string;
  turns?: DebateTurn[];
}

interface AgentDebateViewProps {
  debates: Debate[];
  onAgentClick?: (agentId: string) => void;
  className?: string;
}

function ToneIndicator({ tone }: { tone?: string }) {
  const colors: Record<string, string> = {
    calm: "bg-[#5B8CF0]",
    passionate: "bg-[#E05038]",
    frustrated: "bg-[#E05038]",
    confident: "bg-[#9BBC0F]",
    neutral: "bg-muted-foreground",
  };
  return (
    <span
      className={`inline-block size-2 ${colors[tone || "neutral"] || colors.neutral}`}
      title={tone}
    />
  );
}

export function AgentDebateView({ debates, onAgentClick, className }: AgentDebateViewProps) {
  if (!debates.length) {
    return (
      <div className={`flex items-center justify-center py-8 ${className || ""}`}>
        <span className="font-[family-name:var(--font-pixel)] text-[7px] uppercase tracking-widest text-muted-foreground">
          No debates yet...
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 overflow-y-auto max-h-[600px] p-2 ${className || ""}`}>
      {debates.map((debate, di) => (
        <motion.div
          key={debate.id || di}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: di * 0.1 }}
          className="border-2 border-border bg-card shadow-[3px_3px_0px_var(--border)]"
        >
          {/* Topic header */}
          <div className="px-3 py-2 border-b-2 border-border bg-background/50">
            <div className="flex items-center gap-2">
              <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-[#F8B800]">⚔</span>
              <span className="font-[family-name:var(--font-pixel)] text-[7px] uppercase tracking-wider text-foreground">
                {debate.topic?.slice(0, 80) || "Debate"}
              </span>
            </div>
          </div>

          {/* Debaters header */}
          <div className="flex border-b border-dashed border-border/40">
            <div
              className="flex-1 flex items-center gap-2 px-3 py-1.5 border-r border-dashed border-border/40 cursor-pointer hover:bg-card/60"
              onClick={() => debate.agent_a_id && onAgentClick?.(debate.agent_a_id)}
            >
              <AgentPortrait src={debate.agent_a_portrait} name={debate.agent_a_name || "A"} size="sm" />
              <div>
                <div className="font-[family-name:var(--font-pixel)] text-[6px] text-foreground">
                  {debate.agent_a_name || "Agent A"}
                </div>
                <div className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-[#E05038]">
                  {debate.agent_a_stance || "opposing"}
                </div>
              </div>
            </div>
            <div className="flex items-center px-2">
              <span className="font-[family-name:var(--font-pixel)] text-[7px] text-muted-foreground">VS</span>
            </div>
            <div
              className="flex-1 flex items-center gap-2 px-3 py-1.5 justify-end cursor-pointer hover:bg-card/60"
              onClick={() => debate.agent_b_id && onAgentClick?.(debate.agent_b_id)}
            >
              <div className="text-right">
                <div className="font-[family-name:var(--font-pixel)] text-[6px] text-foreground">
                  {debate.agent_b_name || "Agent B"}
                </div>
                <div className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-[#9BBC0F]">
                  {debate.agent_b_stance || "supporting"}
                </div>
              </div>
              <AgentPortrait src={debate.agent_b_portrait} name={debate.agent_b_name || "B"} size="sm" />
            </div>
          </div>

          {/* Turns */}
          <div className="px-2 py-1.5 space-y-1.5 max-h-[250px] overflow-y-auto">
            {(debate.turns || []).map((turn, ti) => {
              const isA = turn.speaker_id === debate.agent_a_id;
              return (
                <motion.div
                  key={turn.id ?? ti}
                  initial={{ opacity: 0, x: isA ? -10 : 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: ti * 0.05 }}
                  className={`flex ${isA ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] px-2 py-1.5 border border-border/60 ${
                      isA ? "bg-[#E05038]/5 border-l-2 border-l-[#E05038]" : "bg-[#9BBC0F]/5 border-r-2 border-r-[#9BBC0F]"
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="font-[family-name:var(--font-pixel-sm)] text-[7px] text-muted-foreground">
                        R{turn.round}
                      </span>
                      <ToneIndicator tone={turn.emotional_tone} />
                    </div>
                    <p className="font-[family-name:var(--font-pixel-body)] text-[12px] text-foreground/85 leading-tight">
                      {turn.content}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Outcome */}
          {debate.outcome && (
            <div className="px-3 py-1.5 border-t-2 border-border bg-background/50">
              <div className="flex items-center justify-between">
                <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground">
                  OUTCOME
                </span>
                {debate.winner_id && (
                  <span className="font-[family-name:var(--font-pixel)] text-[6px] text-[#F8B800] bg-[#F8B800]/10 px-1.5 py-0.5 border border-[#F8B800]/30">
                    WINNER: {debate.winner_id === debate.agent_a_id ? debate.agent_a_name : debate.agent_b_name}
                  </span>
                )}
              </div>
              <p className="font-[family-name:var(--font-pixel-body)] text-[12px] text-foreground/70 mt-0.5">
                {debate.outcome}
              </p>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
