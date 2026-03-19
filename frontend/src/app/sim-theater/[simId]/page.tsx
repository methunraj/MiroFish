"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { StandaloneNav } from "@/components/layout/standalone-nav";
import { PixelButton } from "@/components/ui/pixel-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { AgentPortrait } from "@/components/shared/agent-portrait";
import { TwitterFeed } from "@/components/viz/twitter-feed";
import { RedditThread } from "@/components/viz/reddit-thread";
import { AgentDebateView } from "@/components/viz/agent-debate";
import { PublicOpinionChart } from "@/components/viz/public-opinion-chart";
import { EmotionalStatePanel } from "@/components/viz/emotional-state-panel";
import { TrendingPanel } from "@/components/viz/trending-panel";
import { FactionMap } from "@/components/viz/faction-map";
import { LiveActivityFeed } from "@/components/viz/live-activity-feed";
import { AgentSpotlight } from "@/components/viz/agent-spotlight";
import { useSimStream } from "@/lib/hooks/use-sim-stream";
import { usePolling } from "@/lib/hooks/use-polling";
import { socialApi } from "@/lib/api/social";
import { simulationApi } from "@/lib/api/simulation";
import { fadeUp } from "@/lib/motion/presets";

type Tab = "twitter" | "reddit" | "debates" | "opinion" | "emotions" | "factions";

const TABS: { id: Tab; label: string; color: string }[] = [
  { id: "twitter", label: "SOCIAL", color: "#5B8CF0" },
  { id: "reddit", label: "THREADS", color: "#E05038" },
  { id: "debates", label: "DEBATES", color: "#F8B800" },
  { id: "opinion", label: "OPINION", color: "#9BBC0F" },
  { id: "emotions", label: "MOOD", color: "#5B8CF0" },
  { id: "factions", label: "FACTIONS", color: "#E05038" },
];

export default function SimulationTheaterPage() {
  const params = useParams();
  const router = useRouter();
  const simId = params?.simId as string;
  const [activeTab, setActiveTab] = useState<Tab>("twitter");
  const [spotlightAgent, setSpotlightAgent] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [debates, setDebates] = useState<any[]>([]);
  const [opinionData, setOpinionData] = useState<any>(null);
  const [trendingData, setTrendingData] = useState<any>(null);
  const [agentStates, setAgentStates] = useState<any[]>([]);
  const [eventText, setEventText] = useState("");

  const { events, connected } = useSimStream(simId, true);

  const statusFetcher = useCallback(
    () => simulationApi.getStatus(simId).then((r) => r.data as any),
    [simId]
  );
  const { data: status } = usePolling({ fetcher: statusFetcher, interval: 3000, enabled: true });

  // Poll social data
  useEffect(() => {
    if (!simId) return;
    const load = async () => {
      try {
        const [postsRes, threadsRes, debatesRes, opinionRes, trendingRes, statesRes] = await Promise.allSettled([
          socialApi.getPosts(simId),
          socialApi.getThreads(simId),
          socialApi.getDebates(simId),
          socialApi.getOpinion(simId),
          socialApi.getTrending(simId),
          socialApi.getAgentStates(simId),
        ]);
        if (postsRes.status === "fulfilled") setPosts(postsRes.value.data || []);
        if (threadsRes.status === "fulfilled") setThreads(threadsRes.value.data || []);
        if (debatesRes.status === "fulfilled") setDebates(debatesRes.value.data || []);
        if (opinionRes.status === "fulfilled") setOpinionData(opinionRes.value.data || null);
        if (trendingRes.status === "fulfilled") setTrendingData(trendingRes.value.data || null);
        if (statesRes.status === "fulfilled") setAgentStates(statesRes.value.data || []);
      } catch (err) {
        console.error("[Theater] Social data fetch failed:", err);
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [simId]);

  const handleInjectEvent = async () => {
    if (!eventText.trim()) return;
    try {
      await socialApi.injectEvent(simId, eventText);
      setEventText("");
    } catch (err) {
      console.error("[Theater] Inject event failed:", err);
    }
  };

  const isTerminal = status?.status === "completed" || status?.status === "failed" || status?.status === "stopped";

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <StandaloneNav />

      {/* Top Header Bar */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="border-b-2 border-border px-4 py-2 flex items-center justify-between gap-3 bg-card/50"
      >
        <div className="flex items-center gap-3">
          <h1 className="font-[family-name:var(--font-pixel)] text-[9px] uppercase tracking-wider text-foreground">
            SIMULATION THEATER
          </h1>
          <StatusBadge status={status?.status ?? "pending"} />
          {connected && (
            <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-[#9BBC0F] flex items-center gap-1">
              <span className="size-1.5 bg-[#9BBC0F] pixel-pulse inline-block" /> LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground">
            {events.length} events · {agentStates.length} agents · {posts.length} posts
          </span>
          <PixelButton
            size="sm"
            variant="outline"
            onClick={() => router.back()}
          >
            ← BACK
          </PixelButton>
        </div>
      </motion.div>

      {/* Main Content: Left (65%) + Right (35%) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <div className="flex-[65] flex flex-col border-r-2 border-border overflow-hidden">
          {/* Viz Tabs */}
          <div className="flex border-b-2 border-border bg-card/30 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 font-[family-name:var(--font-pixel)] text-[7px] uppercase tracking-wider border-r border-border/40 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-card text-foreground border-b-2"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                }`}
                style={activeTab === tab.id ? { borderBottomColor: tab.color } : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Active Visualization */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "twitter" && (
              <TwitterFeed posts={posts} onAgentClick={setSpotlightAgent} />
            )}
            {activeTab === "reddit" && (
              <RedditThread threads={threads} onAgentClick={setSpotlightAgent} />
            )}
            {activeTab === "debates" && (
              <AgentDebateView debates={debates} onAgentClick={setSpotlightAgent} />
            )}
            {activeTab === "opinion" && opinionData && (
              <PublicOpinionChart
                agents={opinionData.agents || []}
                factions={opinionData.factions}
                avgSentiment={opinionData.avg_sentiment}
                shifts={opinionData.shifts}
              />
            )}
            {activeTab === "emotions" && (
              <EmotionalStatePanel
                agents={agentStates.map((a: any) => ({
                  id: a.id,
                  name: a.name,
                  portrait_url: a.portrait_url,
                  mood: a.mood || "neutral",
                  sentiment: a.sentiment || 5,
                }))}
              />
            )}
            {activeTab === "factions" && (
              <FactionMap
                agents={agentStates.map((a: any) => ({
                  id: a.id,
                  name: a.name,
                  sentiment: a.sentiment || 5,
                  faction: a.faction || "",
                  influence: a.influence || 0.5,
                }))}
                onAgentClick={setSpotlightAgent}
              />
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-[35] flex flex-col overflow-hidden">
          {/* Agent Grid */}
          <div className="border-b-2 border-border p-2 max-h-[140px] overflow-y-auto">
            <span className="font-[family-name:var(--font-pixel)] text-[7px] text-muted-foreground uppercase tracking-wider mb-1 block">
              Agents ({agentStates.length})
            </span>
            <div className="flex flex-wrap gap-1">
              {agentStates.slice(0, 40).map((agent: any) => {
                const moodColor =
                  agent.mood === "excited" || agent.mood === "confident"
                    ? "#9BBC0F"
                    : agent.mood === "frustrated" || agent.mood === "anxious"
                    ? "#E05038"
                    : "#5B8CF0";
                return (
                  <div
                    key={agent.id}
                    className="relative cursor-pointer"
                    onClick={() => setSpotlightAgent(agent.id)}
                    title={`${agent.name}: ${agent.mood}`}
                  >
                    <AgentPortrait
                      src={agent.portrait_url}
                      name={agent.name}
                      size="sm"
                      className="!size-7"
                    />
                    <span
                      className="absolute -bottom-0.5 -right-0.5 size-2 border border-background"
                      style={{ background: moodColor }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trending Sidebar */}
          {trendingData && (
            <div className="border-b-2 border-border max-h-[160px] overflow-y-auto">
              <TrendingPanel
                topics={trendingData.topics || []}
                viralPosts={trendingData.viral_posts || []}
              />
            </div>
          )}

          {/* Live Activity Feed */}
          <div className="flex-1 overflow-hidden">
            <LiveActivityFeed
              events={events}
              onAgentClick={setSpotlightAgent}
              className="h-full"
            />
          </div>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="border-t-2 border-border px-4 py-2 flex items-center gap-3 bg-card/50">
        <div className="flex items-center gap-2 flex-1">
          <input
            type="text"
            value={eventText}
            onChange={(e) => setEventText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInjectEvent()}
            placeholder="Inject event: 'Breaking news: competitor launches...'"
            className="flex-1 max-w-[300px] px-2 py-1 border-2 border-border bg-background font-[family-name:var(--font-pixel-body)] text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#9BBC0F]"
          />
          <PixelButton size="sm" variant="outline" onClick={handleInjectEvent} disabled={!eventText.trim()}>
            ⚡ INJECT
          </PixelButton>
        </div>
        <div className="flex items-center gap-4 font-[family-name:var(--font-pixel-sm)] text-[8px] text-muted-foreground">
          <span>{posts.length} posts</span>
          <span>{debates.length} debates</span>
          <span>{threads.length} threads</span>
        </div>
        {isTerminal && (
          <PixelButton
            size="sm"
            onClick={() => {
              simulationApi.generateReport(simId).then(() => {
                const mode = status?.mode || "prompt";
                router.push(`/${mode}-sim/${simId}/report`);
              });
            }}
          >
            {">> REPORT"}
          </PixelButton>
        )}
      </div>

      {/* Agent Spotlight Overlay */}
      <AgentSpotlight
        simId={simId}
        agentId={spotlightAgent}
        onClose={() => setSpotlightAgent(null)}
      />
    </div>
  );
}
