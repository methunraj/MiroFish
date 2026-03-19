"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { AgentPortrait } from "@/components/shared/agent-portrait";

interface Agent {
  id: string;
  name: string;
  portrait?: string;
  demographics?: Record<string, string>;
}

interface AgentResponse {
  agent_id: string;
  interest: number;
  reaction: string;
  status: string;
}

interface ReactionGridProps {
  agents: Agent[];
  responses: AgentResponse[];
  className?: string;
}

const REACTION_COLORS: Record<string, string> = {
  positive: "#9BBC0F",
  interested: "#9BBC0F",
  neutral: "#5B8CF0",
  curious: "#5B8CF0",
  negative: "#E05038",
  critical: "#E05038",
  excited: "#F8B800",
};

function reactionBadgeVariant(
  reaction: string
): "green" | "blue" | "coral" | "gold" | "muted" {
  const lower = reaction.toLowerCase();
  if (lower === "positive" || lower === "interested") return "green";
  if (lower === "neutral" || lower === "curious") return "blue";
  if (lower === "negative" || lower === "critical") return "coral";
  if (lower === "excited") return "gold";
  return "muted";
}

function StatusLED({ status }: { status: "waiting" | "evaluating" | "responded" }) {
  return (
    <span
      className={cn(
        "inline-block size-2 border border-current",
        status === "waiting" && "bg-muted-foreground/40 text-muted-foreground pixel-blink",
        status === "evaluating" && "bg-primary text-primary pixel-pulse",
        status === "responded" && "bg-[#9BBC0F] text-[#9BBC0F]"
      )}
    />
  );
}

export function ReactionGrid({ agents, responses, className }: ReactionGridProps) {
  const responseMap = useMemo(() => {
    const map = new Map<string, AgentResponse>();
    responses.forEach((r) => map.set(r.agent_id, r));
    return map;
  }, [responses]);

  if (!agents.length) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center border-2 border-border bg-card min-h-[200px]",
          className
        )}
      >
        <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
          NO AGENTS
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 md:grid-cols-4 gap-3",
        className
      )}
    >
      {agents.map((agent) => {
        const resp = responseMap.get(agent.id);
        const status: "waiting" | "evaluating" | "responded" = !resp
          ? "waiting"
          : resp.status === "evaluating"
            ? "evaluating"
            : "responded";

        const borderColor =
          status === "responded" && resp
            ? REACTION_COLORS[resp.reaction.toLowerCase()]
            : undefined;

        return (
          <PixelCard
            key={agent.id}
            glow={status === "evaluating"}
            className={cn(
              "flex flex-col items-center gap-2 p-3 transition-all",
              status === "waiting" && "opacity-60"
            )}
            style={borderColor ? { borderColor } : undefined}
          >
            <div className="flex items-center justify-between w-full">
              <StatusLED status={status} />
              {resp && status === "responded" && (
                <PixelBadge variant={reactionBadgeVariant(resp.reaction)}>
                  {resp.reaction}
                </PixelBadge>
              )}
            </div>

            <AgentPortrait src={agent.portrait} name={agent.name} size="md" />

            <span className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wider text-center truncate w-full">
              {agent.name}
            </span>

            {resp && status === "responded" && (
              <div className="w-full mt-1">
                <div className="flex items-center gap-1">
                  <span className="font-[family-name:var(--font-pixel)] text-[7px] text-muted-foreground uppercase">
                    INT
                  </span>
                  <div className="flex-1 h-1.5 bg-muted border border-border">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, resp.interest * 100))}%`,
                        backgroundColor:
                          REACTION_COLORS[resp.reaction.toLowerCase()] ?? "#8BAC0F",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {agent.demographics && Object.keys(agent.demographics).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(agent.demographics)
                  .slice(0, 2)
                  .map(([k, v]) => (
                    <span
                      key={k}
                      className="text-[6px] font-[family-name:var(--font-pixel)] text-muted-foreground uppercase"
                    >
                      {k}: {v}
                    </span>
                  ))}
              </div>
            )}
          </PixelCard>
        );
      })}
    </div>
  );
}
