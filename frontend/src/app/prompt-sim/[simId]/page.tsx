"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { StandaloneNav } from "@/components/layout/standalone-nav";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { PixelProgress } from "@/components/ui/pixel-progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { NumberCounter } from "@/components/shared/number-counter";
import { LoadingState } from "@/components/shared/loading-state";
import { VizSelector, type VizOption } from "@/components/viz/viz-selector";
import { ReactionGrid } from "@/components/viz/reaction-grid";
import { DemographicNetwork, type DemoNode, type DemoEdge } from "@/components/viz/demographic-network";
import { usePolling } from "@/lib/hooks/use-polling";
import { simulationApi } from "@/lib/api/simulation";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion/presets";

const VIZ_OPTIONS: VizOption[] = [
  { id: "grid", label: "Reaction Grid" },
  { id: "network", label: "Demographic Network" },
];

interface PromptStatus {
  status: string;
  progress?: number;
  stale?: boolean;
  idea_summary?: string;
  stats?: {
    viability?: number;
    avg_interest?: number;
    responses?: number;
  };
  reactions?: {
    id: string;
    agent: string;
    sentiment: string;
    comment: string;
  }[];
}

export default function PromptSimLivePage() {
  const params = useParams();
  const router = useRouter();
  const simId = params.simId as string;

  const [activeViz, setActiveViz] = useState(VIZ_OPTIONS[0].id);
  const [networkData, setNetworkData] = useState<{ nodes: DemoNode[]; edges: DemoEdge[] } | null>(null);

  useEffect(() => {
    if (activeViz !== "network") return;
    simulationApi
      .getVizData(simId, "demographic_network")
      .then((r) => {
        const raw = r.data;
        if (!raw?.nodes?.length) { setNetworkData(null); return; }
        const nodes: DemoNode[] = raw.nodes.map((n: Record<string, unknown>) => ({
          id: n.id as string,
          name: n.name as string,
          activity: ((n.interest as number) ?? 5) / 10,
          group: (n.income_level as string) ?? (n.occupation as string) ?? "default",
        }));
        const edges: DemoEdge[] = raw.edges.map((e: Record<string, unknown>) => ({
          source: e.source as string,
          target: e.target as string,
          weight: ((e.shared as string[])?.length ?? 1) * 0.5,
          type: ((e.shared as string[]) ?? [])[0] ?? "shared_trait",
        }));
        setNetworkData({ nodes, edges });
      })
      .catch(() => setNetworkData(null));
  }, [simId, activeViz]);

  const fetcher = useCallback(
    () => simulationApi.getStatus(simId).then((r) => r.data as PromptStatus),
    [simId]
  );

  const { data: status, loading } = usePolling<PromptStatus>({
    fetcher,
    interval: 2000,
    enabled: true,
  });

  const isTerminal =
    status?.status === "completed" ||
    status?.status === "failed" ||
    status?.status === "stopped";

  const handleReport = async () => {
    try {
      await simulationApi.generateReport(simId);
    } catch {
      /* ignore */
    }
    router.push(`/prompt-sim/${simId}/report`);
  };

  const handleForceComplete = async () => {
    try {
      await simulationApi.forceComplete(simId);
    } catch {
      /* ignore */
    }
  };

  if (!status && loading) {
    return <LoadingState message="CONNECTING..." />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <StandaloneNav />

      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        {/* Idea summary bar */}
        {status?.idea_summary && (
          <PixelCard className="p-3 flex items-center gap-3">
            <PixelBadge variant="blue">IDEA</PixelBadge>
            <p className="text-sm text-foreground truncate flex-1">
              {status.idea_summary}
            </p>
            <StatusBadge status={status.status ?? "pending"} />
          </PixelCard>
        )}

        {/* Live stats row */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-3 gap-3"
        >
          <motion.div variants={staggerItem}>
            <PixelCard className="p-4 text-center">
              <p className="font-[family-name:var(--font-pixel)] text-[9px] uppercase text-muted-foreground mb-1">
                Viability
              </p>
              <NumberCounter
                value={status?.stats?.viability ?? 0}
                format={(v) => `${v}%`}
                className="text-2xl text-primary"
              />
              <PixelProgress
                value={status?.stats?.viability ?? 0}
                segments={10}
                className="mt-2"
              />
            </PixelCard>
          </motion.div>

          <motion.div variants={staggerItem}>
            <PixelCard className="p-4 text-center">
              <p className="font-[family-name:var(--font-pixel)] text-[9px] uppercase text-muted-foreground mb-1">
                Avg Interest
              </p>
              <NumberCounter
                value={status?.stats?.avg_interest ?? 0}
                format={(v) => `${v}%`}
                className="text-2xl text-[#F8B800]"
              />
            </PixelCard>
          </motion.div>

          <motion.div variants={staggerItem}>
            <PixelCard className="p-4 text-center">
              <p className="font-[family-name:var(--font-pixel)] text-[9px] uppercase text-muted-foreground mb-1">
                Responses
              </p>
              <NumberCounter
                value={status?.stats?.responses ?? 0}
                className="text-2xl text-[#9BBC0F]"
              />
            </PixelCard>
          </motion.div>
        </motion.div>

        {/* Progress */}
        {status?.progress != null && (
          <PixelProgress value={status.progress} segments={24} />
        )}

        {/* Viz area */}
        <VizSelector
          options={VIZ_OPTIONS}
          active={activeViz}
          onChange={setActiveViz}
        />
        <PixelCard className="min-h-[300px] p-4">
          {activeViz === "grid" ? (
            <ReactionGrid
              agents={(status?.reactions ?? []).map((r) => ({
                id: r.id,
                name: r.agent,
                demographics: {},
              }))}
              responses={(status?.reactions ?? []).map((r) => ({
                agent_id: r.id,
                interest: 0.7,
                reaction: r.sentiment,
                status: "responded",
              }))}
            />
          ) : (
            <DemographicNetwork data={networkData} className="h-[400px]" />
          )}
        </PixelCard>

        {/* Generate Report / Force Complete */}
        <div className="flex justify-center gap-3 flex-wrap">
          {status?.stale && (
            <PixelButton
              size="lg"
              variant="outline"
              onClick={handleForceComplete}
            >
              FORCE COMPLETE
            </PixelButton>
          )}
          <PixelButton
            size="lg"
            disabled={!isTerminal}
            onClick={handleReport}
          >
            {isTerminal ? ">> GENERATE REPORT" : "SIMULATION IN PROGRESS..."}
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
