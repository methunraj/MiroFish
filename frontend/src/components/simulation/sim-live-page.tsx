"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { DemographicNetwork } from "@/components/viz/demographic-network";
import { HeatmapGrid } from "@/components/viz/heatmap-grid";
import { TwitterFeed } from "@/components/viz/twitter-feed";
import { PublicOpinionChart } from "@/components/viz/public-opinion-chart";
import { FactionMap } from "@/components/viz/faction-map";
import { LiveActivityFeed } from "@/components/viz/live-activity-feed";
import { AgentSpotlight } from "@/components/viz/agent-spotlight";
import { CardStream } from "@/components/viz/card-stream";
import { SankeyFlow } from "@/components/viz/sankey-flow";
import { MultiLaneTimeline } from "@/components/viz/multi-lane-timeline";
import { useSimStream } from "@/lib/hooks/use-sim-stream";
import { socialApi } from "@/lib/api/social";
import { usePolling } from "@/lib/hooks/use-polling";
import { simulationApi } from "@/lib/api/simulation";
import { useAppStore } from "@/lib/store/app-store";
import { FloatingChat } from "@/components/layout/floating-chat";
import api from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem, fadeUp } from "@/lib/motion/presets";

interface SimLivePageProps {
  simId: string;
  mode: string;
  title: string;
  vizOptions: VizOption[];
  breadcrumbs?: { label: string; href?: string }[];
  statsConfig?: { key: string; label: string; format?: (v: number) => string }[];
}

interface SimStatus {
  status: string;
  round?: number;
  total_rounds?: number;
  current_round?: number;
  simulated_hour?: number;
  total_hours?: number;
  sim_phase?: string;
  social_counts?: { posts: number; threads: number; debates: number };
  progress?: number;
  stats?: Record<string, number>;
  stale?: boolean;
  actions?: { id: string; agent?: string; action?: string; round?: number; content?: string }[];
}

export function SimLivePage({
  simId,
  mode,
  title,
  vizOptions,
  breadcrumbs,
  statsConfig,
}: SimLivePageProps) {
  const router = useRouter();
  const setActiveSimId = useAppStore((s) => s.setActiveSimId);

  useEffect(() => {
    setActiveSimId(simId);
    return () => setActiveSimId(null);
  }, [simId, setActiveSimId]);

  const [activeViz, setActiveViz] = useState(vizOptions[0]?.id ?? "");
  const [vizData, setVizData] = useState<unknown>(null);
  const [vizLoading, setVizLoading] = useState(false);
  const [actions, setActions] = useState<SimStatus["actions"]>([]);
  const actionCountRef = useRef(0);
  const [spotlightAgent, setSpotlightAgent] = useState<string | null>(null);
  const [socialPosts, setSocialPosts] = useState<any[]>([]);
  const [opinionData, setOpinionData] = useState<any>(null);
  const [factionAgents, setFactionAgents] = useState<any[]>([]);
  const [population, setPopulation] = useState<any[]>([]);

  useEffect(() => {
    if (!simId) return;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const fetchPop = () => {
      simulationApi.getPopulation(simId)
        .then((r) => {
          const pop = r.data?.population || [];
          if (pop.length > 0) {
            setPopulation(pop);
          } else if (retries < 8) {
            retries++;
            timer = setTimeout(fetchPop, 3000 + retries * 2000);
          }
        })
        .catch(() => {
          if (retries < 8) {
            retries++;
            timer = setTimeout(fetchPop, 3000 + retries * 2000);
          }
        });
    };
    fetchPop();
    return () => clearTimeout(timer);
  }, [simId]);

  useEffect(() => {
    if (!activeViz) return;
    const VIZ_TYPE_MAP: Record<string, string> = {
      network: "demographic_network",
      adoption_network: "demographic_network",
      trade_network: "demographic_network",
      grid: "demographic_network",
      reaction_grid: "demographic_network",
    };
    const apiType = VIZ_TYPE_MAP[activeViz] ?? activeViz;
    setVizLoading(true);
    setVizData(null);
    simulationApi
      .getVizData(simId, apiType)
      .then((r) => {
        const raw = r.data;
        if (raw?.error) { setVizData(null); return; }
        if (raw?.nodes) {
          const nodes = raw.nodes.map((n: Record<string, unknown>) => ({
            id: n.id as string,
            name: n.name as string,
            activity: ((n.interest as number) ?? (n.activity as number) ?? 5) / 10,
            group: (n.income_level ?? n.group ?? n.occupation ?? "default") as string,
          }));
          const edges = (raw.edges ?? []).map((e: Record<string, unknown>) => ({
            source: e.source as string,
            target: e.target as string,
            weight: ((e.shared as string[])?.length ?? (e.weight as number) ?? 1) * 0.5,
            type: ((e.shared as string[]) ?? [])[0] ?? (e.type as string) ?? "shared_trait",
          }));
          setVizData({ nodes, edges });
        } else {
          setVizData(raw ?? null);
        }
      })
      .catch(() => setVizData(null))
      .finally(() => setVizLoading(false));
  }, [simId, activeViz]);

  const fetcher = useCallback(
    () => simulationApi.getStatus(simId).then((r) => r.data as SimStatus),
    [simId]
  );

  const { data: status, loading } = usePolling<SimStatus>({
    fetcher,
    interval: 3000,
    enabled: true,
    onData: (d) => {
      if (d.actions && d.actions.length > actionCountRef.current) {
        setActions(d.actions);
        actionCountRef.current = d.actions.length;
      }
    },
  });

  const isTerminal = status?.status === "completed" || status?.status === "failed" || status?.status === "stopped";

  const { events: streamEvents } = useSimStream(simId, !isTerminal);

  useEffect(() => {
    if (!simId) return;
    const loadSocial = async () => {
      try {
        const [postsRes, opinionRes, statesRes] = await Promise.allSettled([
          socialApi.getPosts(simId),
          socialApi.getOpinion(simId),
          socialApi.getAgentStates(simId),
        ]);
        if (postsRes.status === "fulfilled") setSocialPosts(postsRes.value.data || []);
        if (opinionRes.status === "fulfilled") setOpinionData(opinionRes.value.data || null);
        if (statesRes.status === "fulfilled") setFactionAgents((statesRes.value.data || []).map((a: any) => ({
          id: a.id, name: a.name, sentiment: a.sentiment || 5, faction: a.faction || "", influence: a.influence || 0.5,
        })));
      } catch (err) {
        console.error("[SimLive] Social data load failed:", err);
      }
    };
    loadSocial();
    const timer = setInterval(loadSocial, 8000);
    return () => clearInterval(timer);
  }, [simId]);

  const handleStop = async () => {
    try {
      await simulationApi.stop(simId);
    } catch (err) {
      console.error("[SimLive] Stop failed:", err);
    }
  };

  const handleReport = async () => {
    try {
      await simulationApi.generateReport(simId);
      router.push(`/${mode}-sim/${simId}/report`);
    } catch (err) {
      console.error("[SimLive] Report generation failed:", err);
      router.push(`/${mode}-sim/${simId}/report`);
    }
  };

  const handleForceComplete = async () => {
    try {
      await api.post(`/sim/${simId}/force-complete`);
    } catch (err) {
      console.error("[SimLive] Force complete failed:", err);
    }
  };

  if (!status && loading) {
    return <LoadingState message="CONNECTING TO SIMULATION..." />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <StandaloneNav />

      <div className="flex-1 p-4 md:p-6 space-y-4 overflow-auto">
        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible">
          <PixelCard className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <h1 className="font-[family-name:var(--font-pixel)] text-xs uppercase tracking-wider">
                {title}
              </h1>
              <StatusBadge status={status?.status ?? "pending"} />
            </div>
            <div className="flex items-center gap-4">
              {status?.round != null && (
                <span className="font-[family-name:var(--font-pixel)] text-[10px] text-muted-foreground">
                  ROUND{" "}
                  <NumberCounter
                    value={status.round}
                    className="text-foreground"
                  />{" "}
                  / {status.total_rounds ?? "?"}
                </span>
              )}
            </div>
          </PixelCard>
        </motion.div>

        {/* Progress */}
        {status?.progress != null && (
          <PixelProgress
            value={status.progress}
            label="Simulation Progress"
            segments={24}
          />
        )}

        {/* Round Indicator */}
        {(status?.current_round ?? 0) > 0 && (
          <PixelCard className="p-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-[family-name:var(--font-pixel)] text-[9px] uppercase text-muted-foreground">Round</span>
              <span className="font-[family-name:var(--font-pixel)] text-[11px] text-primary">
                {status?.current_round}/{status?.total_rounds || "?"}
              </span>
            </div>
            {(status?.simulated_hour ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-[family-name:var(--font-pixel)] text-[9px] uppercase text-muted-foreground">Hour</span>
                <span className="font-[family-name:var(--font-pixel)] text-[11px] text-foreground">
                  {status?.simulated_hour}h / {status?.total_hours || "?"}h
                </span>
              </div>
            )}
            {status?.sim_phase && (
              <PixelBadge variant="green" className="text-[8px]">
                {status.sim_phase.replace(/_/g, " ").toUpperCase()}
              </PixelBadge>
            )}
            {status?.social_counts && (
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-[9px] text-muted-foreground">
                  {status.social_counts.posts} posts
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {status.social_counts.threads} threads
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {status.social_counts.debates} debates
                </span>
              </div>
            )}
          </PixelCard>
        )}

        {/* Stats Row */}
        {statsConfig && status?.stats && (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
          >
            {statsConfig.map((sc) => (
              <motion.div key={sc.key} variants={staggerItem}>
                <PixelCard className="p-3 text-center">
                  <p className="font-[family-name:var(--font-pixel)] text-[9px] uppercase text-muted-foreground mb-1">
                    {sc.label}
                  </p>
                  <NumberCounter
                    value={status.stats?.[sc.key] ?? 0}
                    format={sc.format}
                    className="text-lg text-primary"
                  />
                </PixelCard>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Viz area */}
        <div className="space-y-3">
          <VizSelector
            options={vizOptions}
            active={activeViz}
            onChange={setActiveViz}
          />
          <PixelCard className="min-h-[300px] overflow-hidden">
            {vizLoading ? (
              <div className="flex items-center justify-center h-[400px]">
                <span className="font-[family-name:var(--font-pixel)] text-[10px] text-muted-foreground uppercase">
                  Loading visualization...
                </span>
              </div>
            ) : (() => {
              const vizId = activeViz;
              if (vizId === "network" || vizId === "adoption_network" || vizId === "trade_network") {
                return (
                  <DemographicNetwork
                    data={vizData as { nodes: unknown[]; edges: unknown[] } | null}
                    className="h-[400px]"
                  />
                );
              }
              if (vizId === "grid" || vizId === "reaction_grid") {
                return (
                  <ReactionGrid
                    agents={[]}
                    responses={[]}
                    className="p-4"
                  />
                );
              }
              if (vizId === "heatmap" || vizId === "heatmap_grid") {
                return (
                  <HeatmapGrid
                    data={vizData as { xLabels: string[]; yLabels: string[]; values: number[][] } | null}
                    className="h-[400px]"
                  />
                );
              }
              if (vizId === "social" || vizId === "twitter") {
                return <TwitterFeed posts={socialPosts} onAgentClick={setSpotlightAgent} className="p-2" />;
              }
              if (vizId === "opinion") {
                return opinionData ? (
                  <PublicOpinionChart agents={opinionData.agents || []} factions={opinionData.factions} avgSentiment={opinionData.avg_sentiment} shifts={opinionData.shifts} />
                ) : null;
              }
              if (vizId === "factions" || vizId === "faction_map") {
                return <FactionMap agents={factionAgents} onAgentClick={setSpotlightAgent} />;
              }
              if (vizId === "live_feed" || vizId === "activity") {
                return <LiveActivityFeed events={streamEvents} onAgentClick={setSpotlightAgent} className="h-[400px]" />;
              }
              if (vizId === "sankey" || vizId === "flow") {
                return <SankeyFlow data={vizData as any} className="h-[400px]" />;
              }
              if (vizId === "timeline" || vizId === "multi_timeline") {
                return <MultiLaneTimeline data={vizData as any} className="h-[400px]" />;
              }
              if (vizId === "card_stream") {
                return <CardStream data={vizData as any} className="h-[400px]" />;
              }
              return (
                <div className="flex items-center justify-center h-[400px]">
                  <span className="font-[family-name:var(--font-pixel)] text-[10px] text-muted-foreground uppercase tracking-wider">
                    Coming soon
                  </span>
                </div>
              );
            })()}
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
                    className="px-4 py-2 flex items-start gap-3"
                  >
                    <span className="font-[family-name:var(--font-pixel)] text-[9px] text-muted-foreground min-w-[2.5rem]">
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
        <PixelCard className={cn("flex items-center justify-between gap-3 p-3")}>
          {!isTerminal && (
            <PixelButton variant="destructive" size="sm" onClick={handleStop}>
              ■ STOP
            </PixelButton>
          )}
          {status?.stale === true && (
            <PixelButton variant="outline" size="sm" onClick={handleForceComplete}>
              FORCE COMPLETE
            </PixelButton>
          )}
          <div className="flex-1" />
          <Link href={`/sim-theater/${simId}`}>
            <PixelButton variant="outline" size="sm">
              SIMULATION THEATER
            </PixelButton>
          </Link>
          <PixelButton
            size="sm"
            disabled={!isTerminal}
            onClick={handleReport}
          >
            {isTerminal ? ">> GENERATE REPORT" : "AWAITING COMPLETION..."}
          </PixelButton>
        </PixelCard>
      </div>

      <AgentSpotlight simId={simId} agentId={spotlightAgent} onClose={() => setSpotlightAgent(null)} />
      <FloatingChat />
    </div>
  );
}
