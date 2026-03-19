"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentPortrait } from "@/components/shared/agent-portrait";
import { socialApi } from "@/lib/api/social";

interface AgentSpotlightProps {
  simId: string;
  agentId: string | null;
  onClose: () => void;
}

export function AgentSpotlight({ simId, agentId, onClose }: AgentSpotlightProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    socialApi
      .getAgentSpotlight(simId, agentId)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [simId, agentId]);

  return (
    <AnimatePresence>
      {agentId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
            className="fixed right-0 top-0 bottom-0 w-[380px] max-w-full bg-background border-l-2 border-border z-50 overflow-y-auto"
          >
            <div className="p-3">
              {/* Close */}
              <button
                onClick={onClose}
                className="font-[family-name:var(--font-pixel)] text-[8px] text-muted-foreground hover:text-foreground px-2 py-1 border border-border mb-3"
              >
                ✕ CLOSE
              </button>

              {loading && (
                <div className="flex items-center justify-center py-12">
                  <span className="font-[family-name:var(--font-pixel)] text-[8px] text-muted-foreground pixel-blink">
                    LOADING...
                  </span>
                </div>
              )}

              {data && data.agent && (
                <div className="space-y-3">
                  {/* Profile */}
                  <div className="flex items-center gap-3">
                    <AgentPortrait
                      src={data.agent.portrait_url}
                      name={data.agent.name}
                      size="lg"
                    />
                    <div>
                      <h2 className="font-[family-name:var(--font-pixel)] text-[9px] text-foreground">
                        {data.agent.name}
                      </h2>
                      <p className="font-[family-name:var(--font-pixel-sm)] text-[9px] text-[#9BBC0F]">
                        {data.agent.role}
                      </p>
                      {data.agent.bio && (
                        <p className="font-[family-name:var(--font-pixel-body)] text-xs text-foreground/70 mt-1">
                          {data.agent.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Demographics */}
                  {data.agent.demographics && (
                    <div className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2">
                      <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
                        Demographics
                      </span>
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        {Object.entries(data.agent.demographics).map(([k, v]) => (
                          <div key={k} className="text-[10px] font-[family-name:var(--font-pixel-body)]">
                            <span className="text-muted-foreground">{k}: </span>
                            <span className="text-foreground">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Emotional Journey */}
                  {data.emotional_journey && data.emotional_journey.length > 0 && (
                    <div className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2">
                      <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
                        Emotional Journey
                      </span>
                      <div className="flex gap-1 mt-1 overflow-x-auto">
                        {data.emotional_journey.map((s: any, i: number) => (
                          <div key={i} className="flex flex-col items-center min-w-[40px]">
                            <span className="font-[family-name:var(--font-pixel-sm)] text-[6px] text-foreground/50">
                              {s.phase}
                            </span>
                            <span className="text-[10px]">
                              {s.mood === "excited" ? "★" : s.mood === "frustrated" ? "▼" : "●"}
                            </span>
                            <span className="font-[family-name:var(--font-pixel-sm)] text-[7px] text-foreground/60">
                              {s.sentiment?.toFixed?.(1) || "?"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Posts */}
                  {data.posts && data.posts.length > 0 && (
                    <div className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2">
                      <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
                        Posts ({data.posts.length})
                      </span>
                      <div className="mt-1 space-y-1 max-h-[150px] overflow-y-auto">
                        {data.posts.map((p: any) => (
                          <div key={p.id} className="border-b border-dashed border-border/30 pb-1">
                            <p className="font-[family-name:var(--font-pixel-body)] text-[11px] text-foreground/80">
                              {p.content?.slice(0, 150)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Debates */}
                  {data.debates && data.debates.length > 0 && (
                    <div className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2">
                      <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
                        Debates ({data.debates.length})
                      </span>
                      <div className="mt-1 space-y-1">
                        {data.debates.map((d: any) => (
                          <div key={d.id} className="flex items-center gap-1 text-[10px]">
                            <span className="text-[#F8B800]">⚔</span>
                            <span className="font-[family-name:var(--font-pixel-body)] text-foreground/70">
                              {d.topic?.slice(0, 60)}
                            </span>
                            {d.winner_id === agentId && (
                              <span className="text-[#9BBC0F] font-[family-name:var(--font-pixel)] text-[6px]">WON</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Memories */}
                  {data.memories && data.memories.length > 0 && (
                    <div className="border-2 border-border bg-card shadow-[2px_2px_0px_var(--border)] p-2">
                      <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground uppercase">
                        Memories ({data.memories.length})
                      </span>
                      <div className="mt-1 space-y-0.5 max-h-[120px] overflow-y-auto">
                        {data.memories.map((m: any) => (
                          <div key={m.id} className="font-[family-name:var(--font-pixel-body)] text-[10px] text-foreground/60">
                            [{m.memory_type}] {m.content?.slice(0, 100)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!loading && !data && (
                <div className="flex items-center justify-center py-12">
                  <span className="font-[family-name:var(--font-pixel)] text-[8px] text-muted-foreground">
                    No data available
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
