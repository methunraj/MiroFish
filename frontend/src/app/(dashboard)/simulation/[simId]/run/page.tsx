"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
import { AgentNetworkGraph } from "@/components/viz/agent-network-graph";
import type { AgentEdge, AgentNode } from "@/components/viz/agent-network-graph";
import { MultiLaneTimeline } from "@/components/viz/multi-lane-timeline";
import type { MultiLaneTimelineProps } from "@/components/viz/multi-lane-timeline";
import { HeatmapGrid } from "@/components/viz/heatmap-grid";
import type { HeatmapGridProps } from "@/components/viz/heatmap-grid";
import { SankeyFlow } from "@/components/viz/sankey-flow";
import type { SankeyFlowProps } from "@/components/viz/sankey-flow";
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

/** Maps UI viz id → unified `/sim/:id/viz-data` type (see document_engine.get_viz_data). */
const VIZ_API_TYPE: Record<string, string> = {
  "agent-network": "network",
  timeline: "timeline",
  heatmap: "heatmap",
  sankey: "sankey",
};

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
  const [vizData, setVizData] = useState<unknown>(null);
  const [vizLoading, setVizLoading] = useState(false);
  const [actions, setActions] = useState<RunStatus["actions"]>([]);
  const actionCountRef = useRef(0);
  const vizFetchGen = useRef(0);

  useEffect(() => {
    if (!simId) return;
    const apiType = VIZ_API_TYPE[activeViz] ?? activeViz;
    const vizKey = activeViz;
    const gen = ++vizFetchGen.current;
    setVizLoading(true);
    setVizData(null);
    simulationApi
      .getVizData(simId, apiType)
      .then((r) => {
        if (gen !== vizFetchGen.current) return;
        const raw = r.data as Record<string, unknown>;
        if (raw?.error) {
          setVizData(null);
          return;
        }

        if (vizKey === "agent-network" && raw?.nodes) {
          const nodes = (raw.nodes as Record<string, unknown>[]).map((n) => ({
            id: String(n.id),
            name: String(n.name ?? n.id),
            activity:
              ((n.interest as number) ?? (n.activity as number) ?? 5) / 10,
            group: (n.income_level ?? n.group ?? n.occupation ?? "default") as
              | string
              | number,
          }));
          const edges = (
            (raw.edges as Record<string, unknown>[]) ?? []
          ).map((e) => ({
            source: String(e.source),
            target: String(e.target),
            weight:
              ((e.shared as string[])?.length ?? (e.weight as number) ?? 1) *
              0.5,
            type:
              ((e.shared as string[]) ?? [])[0] != null
                ? String((e.shared as string[])[0])
                : String(e.type ?? "link"),
          }));
          setVizData({ nodes, edges });
          return;
        }

        if (vizKey === "timeline" && Array.isArray(raw?.events)) {
          const evs = raw.events as {
            round?: number;
            actions?: number;
            lane?: string;
            start?: number;
            end?: number;
            label?: string;
            type?: string;
          }[];
          if (evs.length && typeof evs[0]?.round === "number") {
            setVizData({
              lanes: [{ id: "activity", label: "Actions / round" }],
              events: evs.map((e) => ({
                lane: "activity",
                start: e.round!,
                end: e.round! + 0.85,
                label: `${e.actions ?? 0} actions`,
                type: "action",
              })),
            });
            return;
          }
          setVizData(raw);
          return;
        }

        if (vizKey === "heatmap") {
          setVizData(raw);
          return;
        }

        if (vizKey === "sankey") {
          setVizData(raw);
          return;
        }

        setVizData(null);
      })
      .catch(() => {
        if (gen === vizFetchGen.current) setVizData(null);
      })
      .finally(() => {
        if (gen === vizFetchGen.current) setVizLoading(false);
      });
  }, [simId, activeViz]);

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
          <PixelCard className="min-h-[320px] p-2 flex flex-col">
            {vizLoading ? (
              <div className="flex flex-1 min-h-[280px] items-center justify-center">
                <span className="font-[family-name:var(--font-pixel)] text-[10px] text-muted-foreground uppercase">
                  Loading visualization…
                </span>
              </div>
            ) : (
              <>
                {activeViz === "agent-network" && (
                  <AgentNetworkGraph
                    data={
                      vizData as { nodes: AgentNode[]; edges: AgentEdge[] } | null
                    }
                    isLive
                    className="min-h-[280px] flex-1"
                  />
                )}
                {activeViz === "timeline" && (
                  <MultiLaneTimeline
                    data={vizData as MultiLaneTimelineProps["data"]}
                    className="min-h-[280px] flex-1"
                  />
                )}
                {activeViz === "heatmap" && (
                  <HeatmapGrid
                    data={vizData as HeatmapGridProps["data"]}
                    className="min-h-[280px] flex-1"
                  />
                )}
                {activeViz === "sankey" && (
                  <SankeyFlow
                    data={vizData as SankeyFlowProps["data"]}
                    className="min-h-[280px] flex-1"
                  />
                )}
              </>
            )}
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
