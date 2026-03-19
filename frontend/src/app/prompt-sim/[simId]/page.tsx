"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
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
import { TwitterFeed } from "@/components/viz/twitter-feed";
import { PublicOpinionChart } from "@/components/viz/public-opinion-chart";
import { FactionMap } from "@/components/viz/faction-map";
import { LiveActivityFeed } from "@/components/viz/live-activity-feed";
import { AgentSpotlight } from "@/components/viz/agent-spotlight";
import { usePolling } from "@/lib/hooks/use-polling";
import { useSimStream } from "@/lib/hooks/use-sim-stream";
import { simulationApi } from "@/lib/api/simulation";
import { socialApi } from "@/lib/api/social";
import { useAppStore } from "@/lib/store/app-store";
import { FloatingChat } from "@/components/layout/floating-chat";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion/presets";

const VIZ_OPTIONS: VizOption[] = [
  { id: "grid", label: "Reaction Grid" },
  { id: "network", label: "Demographic Network" },
  { id: "social", label: "Social Feed" },
  { id: "opinion", label: "Public Opinion" },
  { id: "factions", label: "Factions" },
  { id: "live_feed", label: "Live Feed" },
];

interface PromptStatus {
  status: string;
  progress?: number;
  stale?: boolean;
  idea_summary?: string;
  current_round?: number;
  total_rounds?: number;
  simulated_hour?: number;
  total_hours?: number;
  sim_phase?: string;
  social_counts?: { posts: number; threads: number; debates: number };
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
  const setActiveSimId = useAppStore((s) => s.setActiveSimId);

  useEffect(() => {
    setActiveSimId(simId);
    return () => setActiveSimId(null);
  }, [simId, setActiveSimId]);

  const [activeViz, setActiveViz] = useState(VIZ_OPTIONS[0].id);
  const [networkData, setNetworkData] = useState<{ nodes: DemoNode[]; edges: DemoEdge[] } | null>(null);
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

  const [pollingEnabled, setPollingEnabled] = useState(true);

  const { data: status, loading } = usePolling<PromptStatus>({
    fetcher,
    interval: 3000,
    enabled: pollingEnabled,
  });

  const isTerminal =
    status?.status === "completed" ||
    status?.status === "failed" ||
    status?.status === "stopped";

  useEffect(() => {
    if (isTerminal) setPollingEnabled(false);
  }, [isTerminal]);

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
        if (statesRes.status === "fulfilled")
          setFactionAgents(
            (statesRes.value.data || []).map((a: any) => ({
              id: a.id,
              name: a.name,
              sentiment: a.sentiment || 5,
              faction: a.faction || "",
              influence: a.influence || 0.5,
            }))
          );
      } catch {
        /* ignore */
      }
    };
    loadSocial();
    const timer = setInterval(loadSocial, 8000);
    return () => clearInterval(timer);
  }, [simId]);

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

        {/* Progress + Round Indicator */}
        {status?.progress != null && (
          <PixelProgress value={status.progress} segments={24} />
        )}
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

        {/* Viz area */}
        <VizSelector
          options={VIZ_OPTIONS}
          active={activeViz}
          onChange={setActiveViz}
        />
        <PixelCard className="min-h-[300px] p-4">
          {activeViz === "grid" && (() => {
            const reactionMap = new Map((status?.reactions ?? []).map(r => [r.id, r]));
            const agents = population.length > 0
              ? population.map(p => ({ id: p.id, name: p.name, demographics: p.demographics || {} }))
              : (status?.reactions ?? []).map(r => ({ id: r.id, name: r.agent, demographics: {} }));
            const responses = agents.map(a => {
              const r = reactionMap.get(a.id);
              return r
                ? { agent_id: a.id, interest: 0.7, reaction: r.sentiment, status: "responded" as const }
                : { agent_id: a.id, interest: 0, reaction: "waiting", status: "waiting" as const };
            });
            return <ReactionGrid agents={agents} responses={responses} />;
          })()}
          {activeViz === "network" && (
            <DemographicNetwork data={networkData} className="h-[400px]" />
          )}
          {activeViz === "social" && (
            <TwitterFeed posts={socialPosts} onAgentClick={setSpotlightAgent} className="max-h-[400px]" />
          )}
          {activeViz === "opinion" && opinionData && (
            <PublicOpinionChart
              agents={opinionData.agents || []}
              factions={opinionData.factions}
              avgSentiment={opinionData.avg_sentiment}
              shifts={opinionData.shifts}
            />
          )}
          {activeViz === "opinion" && !opinionData && (
            <div className="flex items-center justify-center h-[300px]">
              <span className="font-[family-name:var(--font-pixel)] text-[8px] text-muted-foreground uppercase">
                Opinion data will appear after social phases run...
              </span>
            </div>
          )}
          {activeViz === "factions" && (
            <FactionMap agents={factionAgents} onAgentClick={setSpotlightAgent} />
          )}
          {activeViz === "live_feed" && (
            <LiveActivityFeed events={streamEvents} onAgentClick={setSpotlightAgent} className="h-[400px]" />
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
          <Link href={`/sim-theater/${simId}`}>
            <PixelButton variant="outline" size="sm">
              SIMULATION THEATER
            </PixelButton>
          </Link>
          <PixelButton
            size="lg"
            disabled={!isTerminal}
            onClick={handleReport}
          >
            {isTerminal ? ">> GENERATE REPORT" : "SIMULATION IN PROGRESS..."}
          </PixelButton>
        </div>
      </div>

      <AgentSpotlight simId={simId} agentId={spotlightAgent} onClose={() => setSpotlightAgent(null)} />
      <FloatingChat />
    </div>
  );
}
