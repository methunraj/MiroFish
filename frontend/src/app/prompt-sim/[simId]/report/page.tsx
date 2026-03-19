"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { StandaloneNav } from "@/components/layout/standalone-nav";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { NumberCounter } from "@/components/shared/number-counter";
import { LoadingState } from "@/components/shared/loading-state";
import { usePolling } from "@/lib/hooks/use-polling";
import { simulationApi } from "@/lib/api/simulation";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion/presets";
import { socialApi } from "@/lib/api/social";
import { PublicOpinionChart } from "@/components/viz/public-opinion-chart";
import { AgentDebateView } from "@/components/viz/agent-debate";
import { FactionMap } from "@/components/viz/faction-map";

interface ViabilityReport {
  status: string;
  score?: number;
  viability_score?: number;
  avg_interest?: number;
  total_respondents?: number;
  summary?: string;
  executive_summary?: string;
  reaction_distribution?: Record<string, number>;
  demographic_breakdown?: Record<string, { count: number; avg_interest: number }>;
  concern_clusters?: { concern: string; frequency: number }[];
  strengths?: string[];
  price_sensitivity?: { avg_wtp: number | null; min_wtp: number | null; max_wtp: number | null };
  sections?: { title: string; content: string }[];
}

export default function PromptSimReportPage() {
  const params = useParams();
  const simId = params.simId as string;
  const [downloading, setDownloading] = useState(false);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [socialData, setSocialData] = useState<{ opinion: any; debates: any[]; agents: any[] }>({
    opinion: null, debates: [], agents: [],
  });

  useEffect(() => {
    if (!simId) return;
    simulationApi.getInterviews(simId)
      .then((r) => setInterviews(r.data || []))
      .catch(() => {});
  }, [simId]);

  const fetcher = useCallback(
    () =>
      simulationApi.getReport(simId).then((r) => r.data as ViabilityReport),
    [simId]
  );

  const { data: report, loading } = usePolling<ViabilityReport>({
    fetcher,
    interval: 3000,
    enabled: true,
  });

  const reportReady = report?.status === "completed" || report?.sections;
  const score = report?.score ?? report?.viability_score ?? 0;

  const sections = useMemo(() => {
    if (!report) return [];
    if (report.sections?.length) return report.sections;
    const s: { title: string; content: string }[] = [];

    if (report.reaction_distribution) {
      const lines = Object.entries(report.reaction_distribution)
        .map(([k, v]) => `${k}: ${v} respondent${v !== 1 ? "s" : ""}`)
        .join("\n");
      s.push({ title: "Reaction Distribution", content: lines });
    }

    if (report.demographic_breakdown) {
      const lines = Object.entries(report.demographic_breakdown)
        .map(([k, v]) => `${k}: ${v.count} people, avg interest ${v.avg_interest}/10`)
        .join("\n");
      s.push({ title: "Demographic Breakdown", content: lines });
    }

    if (report.concern_clusters?.length) {
      const lines = report.concern_clusters
        .map((c) => `• ${c.concern} (mentioned ${c.frequency}x)`)
        .join("\n");
      s.push({ title: "Top Concerns", content: lines });
    }

    if (report.strengths?.length) {
      s.push({ title: "Strengths & Suggestions", content: report.strengths.map((x) => `• ${x}`).join("\n") });
    }

    if (report.price_sensitivity?.avg_wtp != null) {
      const ps = report.price_sensitivity;
      s.push({
        title: "Price Sensitivity",
        content: `Average WTP: $${ps.avg_wtp}\nRange: $${ps.min_wtp ?? "?"} — $${ps.max_wtp ?? "?"}`,
      });
    }

    return s;
  }, [report]);

  useEffect(() => {
    if (!simId) return;
    Promise.allSettled([
      socialApi.getOpinion(simId),
      socialApi.getDebates(simId),
      socialApi.getAgentStates(simId),
    ]).then(([opRes, debRes, statesRes]) => {
      setSocialData({
        opinion: opRes.status === "fulfilled" ? opRes.value.data : null,
        debates: debRes.status === "fulfilled" ? (debRes.value.data || []) : [],
        agents: statesRes.status === "fulfilled" ? (statesRes.value.data || []) : [],
      });
    });
  }, [simId]);

  const handleDownload = () => {
    if (!report) return;
    setDownloading(true);
    try {
      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `viability-report-${simId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    setDownloading(false);
  };

  if (!report && loading) {
    return <LoadingState message="LOADING REPORT..." />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <StandaloneNav />

      <div className="flex-1 p-4 md:p-6 space-y-6 overflow-auto max-w-4xl mx-auto w-full">
        {/* Large animated viability score */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-center py-8"
        >
          <PixelBadge variant="blue" className="mb-3">
            VIABILITY REPORT
          </PixelBadge>
          <h1 className="font-[family-name:var(--font-pixel)] text-sm uppercase tracking-wider mb-6">
            Market Analysis Results
          </h1>

          {score > 0 && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            >
              <p className="font-[family-name:var(--font-pixel)] text-[10px] uppercase text-muted-foreground mb-2">
                Viability Score
              </p>
              <NumberCounter
                value={score}
                format={(v) => `${v}%`}
                className="text-6xl md:text-8xl text-primary"
                duration={1200}
              />
            </motion.div>
          )}
        </motion.div>

        {/* Executive Summary */}
        {(report?.executive_summary || report?.summary) && (
          <PixelCard className="p-5">
            <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Executive Summary
            </h2>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {report.executive_summary || report.summary}
            </p>
          </PixelCard>
        )}

        {/* Report sections */}
        {sections.length > 0 && (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {sections.map((section, i) => (
              <motion.div key={i} variants={staggerItem}>
                <PixelCard className="p-5">
                  <h3 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-primary mb-2">
                    {section.title}
                  </h3>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {section.content}
                  </p>
                </PixelCard>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Social Analysis */}
        {socialData.opinion && socialData.opinion.agents?.length > 0 && (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-4">
            <motion.div variants={staggerItem}>
              <PixelCard className="p-5">
                <h3 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-[#9BBC0F] mb-3">
                  Social Simulation Analysis
                </h3>
                <PublicOpinionChart
                  agents={socialData.opinion.agents}
                  factions={socialData.opinion.factions}
                  avgSentiment={socialData.opinion.avg_sentiment}
                  shifts={socialData.opinion.shifts}
                />
              </PixelCard>
            </motion.div>

            {socialData.debates.length > 0 && (
              <motion.div variants={staggerItem}>
                <PixelCard className="p-5">
                  <h3 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-[#F8B800] mb-3">
                    Key Debates
                  </h3>
                  <AgentDebateView debates={socialData.debates.slice(0, 3)} />
                </PixelCard>
              </motion.div>
            )}

            {socialData.agents.length > 0 && (
              <motion.div variants={staggerItem}>
                <PixelCard className="p-5">
                  <h3 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-[#E05038] mb-3">
                    Faction Analysis
                  </h3>
                  <FactionMap
                    agents={socialData.agents.map((a: any) => ({
                      id: a.id,
                      name: a.name,
                      sentiment: a.sentiment || 5,
                      faction: a.faction || "",
                      influence: a.influence || 0.5,
                    }))}
                  />
                </PixelCard>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Agent Interviews */}
        {interviews.length > 0 && (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
            <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-[#5B8CF0]">
              Agent Interviews ({interviews.length})
            </h2>
            {interviews.map((iv: any, idx: number) => (
              <motion.div key={idx} variants={staggerItem}>
                <PixelCard className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-[family-name:var(--font-pixel)] text-[9px] text-primary">
                      {iv.agent_name}
                    </span>
                    {iv.occupation && (
                      <PixelBadge variant="muted" className="text-[7px]">
                        {iv.occupation}
                      </PixelBadge>
                    )}
                  </div>
                  <p className="text-sm text-foreground leading-relaxed font-[family-name:var(--font-pixel-body)]">
                    &ldquo;{iv.response}&rdquo;
                  </p>
                </PixelCard>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Stats summary */}
        {reportReady && report?.total_respondents && (
          <PixelCard className="p-4 text-center">
            <span className="font-[family-name:var(--font-pixel)] text-[9px] text-muted-foreground uppercase">
              Based on {report.total_respondents} respondent{report.total_respondents !== 1 ? "s" : ""} • Avg Interest: {report.avg_interest}/10
            </span>
          </PixelCard>
        )}

        {!reportReady && report && (
          <LoadingState message="GENERATING REPORT..." />
        )}

        {/* Download */}
        <div className="flex items-center justify-center gap-3 pb-8">
          <PixelButton
            size="lg"
            disabled={!reportReady || downloading}
            onClick={handleDownload}
          >
            {downloading ? "DOWNLOADING..." : ">> DOWNLOAD REPORT"}
          </PixelButton>
        </div>

        {/* Floating chat note */}
        <div className="text-center pb-4">
          <p className="text-[10px] font-[family-name:var(--font-pixel)] text-muted-foreground uppercase">
            Use the floating chat (bottom-right) to ask questions about this
            report
          </p>
        </div>
      </div>
    </div>
  );
}
