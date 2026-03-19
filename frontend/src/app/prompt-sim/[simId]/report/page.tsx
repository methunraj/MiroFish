"use client";

import { useState, useCallback, useMemo } from "react";
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

interface ViabilityReport {
  status: string;
  score?: number;
  viability_score?: number;
  avg_interest?: number;
  total_respondents?: number;
  summary?: string;
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

        {/* Summary */}
        {report?.summary && (
          <PixelCard className="p-5">
            <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Executive Summary
            </h2>
            <p className="text-sm text-foreground leading-relaxed">
              {report.summary}
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
