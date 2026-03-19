"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { StandaloneNav } from "@/components/layout/standalone-nav";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { NumberCounter } from "@/components/shared/number-counter";
import { LoadingState } from "@/components/shared/loading-state";
import { usePolling } from "@/lib/hooks/use-polling";
import { simulationApi } from "@/lib/api/simulation";
import { reportApi } from "@/lib/api/report";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion/presets";

interface SimReportPageProps {
  simId: string;
  mode: string;
  title: string;
  breadcrumbs?: { label: string; href?: string }[];
}

interface ReportData {
  status: string;
  score?: number;
  sections?: { title: string; content: string }[];
  summary?: string;
  generated_at?: string;
}

export function SimReportPage({
  simId,
  mode,
  title,
  breadcrumbs,
}: SimReportPageProps) {
  const [downloading, setDownloading] = useState(false);

  const fetcher = useCallback(
    () => simulationApi.getReport(simId).then((r) => r.data as ReportData),
    [simId]
  );

  const { data: report, loading } = usePolling<ReportData>({
    fetcher,
    interval: 3000,
    enabled: true,
  });

  const reportReady = report?.status === "completed" || report?.sections;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await reportApi.download(simId);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mode}-report-${simId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setDownloading(false);
  };

  if (!report && loading) {
    return <LoadingState message="LOADING REPORT..." />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <StandaloneNav />

      <div className="flex-1 p-4 md:p-6 space-y-6 overflow-auto max-w-4xl mx-auto w-full">
        {/* Score */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-center py-8"
        >
          <PixelBadge variant="blue" className="mb-3">
            {mode.toUpperCase()} REPORT
          </PixelBadge>
          <h1 className="font-[family-name:var(--font-pixel)] text-sm uppercase tracking-wider mb-6">
            {title}
          </h1>

          {report?.score != null && (
            <div className="mb-4">
              <p className="font-[family-name:var(--font-pixel)] text-[10px] uppercase text-muted-foreground mb-2">
                Overall Score
              </p>
              <NumberCounter
                value={report.score}
                format={(v) => `${v}%`}
                className="text-5xl md:text-7xl text-primary"
              />
            </div>
          )}
        </motion.div>

        {/* Summary */}
        {report?.summary && (
          <PixelCard className="p-5">
            <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Summary
            </h2>
            <p className="text-sm text-foreground leading-relaxed">
              {report.summary}
            </p>
          </PixelCard>
        )}

        {/* Sections */}
        {report?.sections && report.sections.length > 0 && (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {report.sections.map((section, i) => (
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

        {/* Charts placeholder */}
        {reportReady && (
          <PixelCard className="min-h-[200px] flex items-center justify-center">
            <span className="font-[family-name:var(--font-pixel)] text-[10px] text-muted-foreground uppercase">
              [ CHARTS & VISUALIZATIONS — PLACEHOLDER ]
            </span>
          </PixelCard>
        )}

        {!reportReady && report && (
          <LoadingState message="GENERATING REPORT..." />
        )}

        {/* Actions */}
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
            Use the floating chat (bottom-right) to ask questions about this report
          </p>
        </div>
      </div>
    </div>
  );
}
