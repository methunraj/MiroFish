"use client";

import { useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TopBar } from "@/components/layout/top-bar";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelProgress } from "@/components/ui/pixel-progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { NumberCounter } from "@/components/shared/number-counter";
import { LoadingState } from "@/components/shared/loading-state";
import { VizSelector, type VizOption } from "@/components/viz/viz-selector";
import { usePolling } from "@/lib/hooks/use-polling";
import { simulationApi } from "@/lib/api/simulation";
import { cn } from "@/lib/utils";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion/presets";

const VIZ_OPTIONS: VizOption[] = [
  { id: "agent-network", label: "Agent Network" },
  { id: "timeline", label: "Timeline" },
  { id: "heatmap", label: "Heatmap" },
  { id: "sankey", label: "Sankey Flow" },
];

interface RunStatus {
  status: string;
  round?: number;
  total_rounds?: number;
  progress?: number;
  agent_count?: number;
  interaction_count?: number;
  actions?: {
    id: string;
    agent?: string;
    action?: string;
    round?: number;
    content?: string;
    timestamp?: string;
  }[];
}

export default function SimulationRunPage() {
  const params = useParams();
  const router = useRouter();
  const simId = params.simId as string;

  const [activeViz, setActiveViz] = useState(VIZ_OPTIONS[0].id);
  const [actions, setActions] = useState<RunStatus["actions"]>([]);
  const actionCountRef = useRef(0);

  const fetcher = useCallback(
    () =>
      simulationApi.legacyRunStatus(simId).then((r) => r.data as RunStatus),
    [simId]
  );

  const { data: status, loading } = usePolling<RunStatus>({
    fetcher,
    interval: 2000,
    enabled: true,
    onData: (d) => {
      if (d.actions && d.actions.length > actionCountRef.current) {
        setActions(d.actions);
        actionCountRef.current = d.actions.length;
      }
    },
  });

  const isTerminal =
    status?.status === "completed" ||
    status?.status === "failed" ||
    status?.status === "stopped";

  const handleStop = async () => {
    try {
      await simulationApi.legacyStop({ simulation_id: simId });
    } catch {
      /* ignore */
    }
  };

  const handleReport = () => {
    router.push(`/simulation/${simId}/report`);
  };

  if (!status && loading) {
    return <LoadingState message="CONNECTING TO SIMULATION..." />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        breadcrumbs={[
          { label: "SIMULATIONS" },
          { label: simId.slice(0, 8) },
          { label: "RUN" },
        ]}
      />

      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        {/* Sim Header */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible">
          <PixelCard className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <h1 className="font-[family-name:var(--font-pixel)] text-xs uppercase tracking-wider">
                Document Simulation
              </h1>
              <StatusBadge status={status?.status ?? "pending"} />
            </div>
            <div className="flex items-center gap-6 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="font-[family-name:var(--font-pixel)] text-muted-foreground">
                  ROUND
                </span>
                <NumberCounter
                  value={status?.round ?? 0}
                  className="text-foreground"
                />
                <span className="text-muted-foreground">
                  / {status?.total_rounds ?? "?"}
                </span>
              </div>
              {status?.agent_count != null && (
                <div className="flex items-center gap-1.5 font-[family-name:var(--font-pixel)]">
                  <span className="text-muted-foreground">AGENTS</span>
                  <NumberCounter
                    value={status.agent_count}
                    className="text-foreground"
                  />
                </div>
              )}
              {status?.interaction_count != null && (
                <div className="flex items-center gap-1.5 font-[family-name:var(--font-pixel)]">
                  <span className="text-muted-foreground">ACTIONS</span>
                  <NumberCounter
                    value={status.interaction_count}
                    className="text-foreground"
                  />
                </div>
              )}
            </div>
          </PixelCard>
        </motion.div>

        {/* Progress bar */}
        {status?.progress != null && (
          <PixelProgress
            value={status.progress}
            label="Simulation Progress"
            segments={24}
          />
        )}

        {/* Viz selector + placeholder */}
        <div className="space-y-3">
          <VizSelector
            options={VIZ_OPTIONS}
            active={activeViz}
            onChange={setActiveViz}
          />
          <PixelCard className="min-h-[320px] flex items-center justify-center">
            <span className="font-[family-name:var(--font-pixel)] text-[10px] text-muted-foreground uppercase">
              [{" "}
              {VIZ_OPTIONS.find((v) => v.id === activeViz)?.label ?? "VIZ"} —
              PLACEHOLDER ]
            </span>
          </PixelCard>
        </div>

        {/* Action Feed */}
        <div>
          <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Action Feed
          </h2>
          <PixelCard className="max-h-[320px] overflow-y-auto p-0">
            {actions && actions.length > 0 ? (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="divide-y-2 divide-border"
              >
                {[...actions].reverse().map((a, i) => (
                  <motion.div
                    key={a.id ?? i}
                    variants={staggerItem}
                    className="px-4 py-2.5 flex items-start gap-3"
                  >
                    <span className="font-[family-name:var(--font-pixel)] text-[9px] text-muted-foreground min-w-[2.5rem] shrink-0">
                      R{a.round ?? "?"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-[family-name:var(--font-pixel)] text-[10px] text-primary">
                        {a.agent ?? "SYSTEM"}
                      </p>
                      <p className="text-xs text-foreground truncate">
                        {a.content ?? a.action ?? "—"}
                      </p>
                    </div>
                    {a.timestamp && (
                      <span className="text-[9px] text-muted-foreground shrink-0 font-[family-name:var(--font-pixel)]">
                        {new Date(a.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="p-6 text-center">
                <span className="font-[family-name:var(--font-pixel)] text-[10px] text-muted-foreground uppercase">
                  Waiting for actions...
                </span>
              </div>
            )}
          </PixelCard>
        </div>

        {/* Control Bar */}
        <PixelCard
          className={cn("flex items-center justify-between gap-3 p-3")}
        >
          {!isTerminal && (
            <PixelButton variant="destructive" size="sm" onClick={handleStop}>
              ■ STOP
            </PixelButton>
          )}
          <div className="flex-1" />
          <PixelButton size="sm" disabled={!isTerminal} onClick={handleReport}>
            {isTerminal ? ">> GENERATE REPORT" : "AWAITING COMPLETION..."}
          </PixelButton>
        </PixelCard>
      </div>
    </div>
  );
}
