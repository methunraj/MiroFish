"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { TopBar } from "@/components/layout/top-bar";
import { FloatingChat } from "@/components/layout/floating-chat";
import { LoadingState } from "@/components/shared/loading-state";
import api from "@/lib/api/client";

interface ReportData {
  id: string;
  title: string;
  sim_id: string;
  content: string;
  agent_logs: AgentLog[];
  created_at: string;
}

interface AgentLog {
  agent_name: string;
  entries: { timestamp: string; content: string }[];
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

function extractToc(markdown: string): TocEntry[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const entries: TocEntry[] = [];
  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    entries.push({ id, text, level });
  }
  return entries;
}

function renderMarkdown(content: string): string {
  return content
    .replace(/^### (.+)$/gm, (_, t) => {
      const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return `<h3 id="${id}" class="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider mt-6 mb-2">${t}</h3>`;
    })
    .replace(/^## (.+)$/gm, (_, t) => {
      const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return `<h2 id="${id}" class="font-[family-name:var(--font-pixel)] text-xs uppercase tracking-wider mt-8 mb-3">${t}</h2>`;
    })
    .replace(/^# (.+)$/gm, (_, t) => {
      const id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return `<h1 id="${id}" class="font-[family-name:var(--font-pixel)] text-sm uppercase tracking-wider mt-10 mb-4">${t}</h1>`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm leading-relaxed">$1</li>')
    .replace(/\n\n/g, '<p class="mb-3"></p>')
    .replace(/\n/g, "<br />");
}

export default function ReportPage() {
  const params = useParams();
  const reportId = params.reportId as string;

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const fetchReport = useCallback(async () => {
    try {
      const res = await api.get(`/report/${reportId}`);
      setReport(res.data ?? null);
    } catch (err) {
      console.error("Failed to fetch report:", err);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const toc = useMemo(
    () => (report ? extractToc(report.content) : []),
    [report]
  );

  const htmlContent = useMemo(
    () => (report ? renderMarkdown(report.content) : ""),
    [report]
  );

  const toggleLog = (agentName: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
  };

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([report.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.title || "report"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleChat = async (message: string, history: { role: string; content: string }[]) => {
    const res = await api.post(`/report/${reportId}/chat`, { message, history });
    return res.data?.reply ?? "No response";
  };

  if (loading) return <LoadingState message="LOADING REPORT..." />;

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <PixelCard className="text-center py-12">
          <p className="text-xs text-muted-foreground">Report not found</p>
        </PixelCard>
      </div>
    );
  }

  return (
    <>
      <TopBar
        breadcrumbs={[
          { label: "REPORTS" },
          { label: reportId.slice(0, 8) },
        ]}
      />

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
          {/* Main Article */}
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-[family-name:var(--font-pixel)] text-sm uppercase tracking-wider">
                  {report.title}
                </h1>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(report.created_at).toLocaleString()}
                </p>
              </div>
              <PixelButton size="sm" variant="secondary" onClick={handleDownload}>
                DOWNLOAD .MD
              </PixelButton>
            </div>

            {/* Article Content */}
            <PixelCard>
              <article
                className="prose prose-sm max-w-none text-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            </PixelCard>

            {/* Agent Logs Accordion */}
            {report.agent_logs.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                  Agent Logs
                </h2>
                {report.agent_logs.map((log) => {
                  const expanded = expandedLogs.has(log.agent_name);
                  return (
                    <PixelCard key={log.agent_name} className="p-0 overflow-hidden">
                      <button
                        onClick={() => toggleLog(log.agent_name)}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                      >
                        <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider">
                          {log.agent_name}
                        </span>
                        <div className="flex items-center gap-2">
                          <PixelBadge variant="muted">
                            {log.entries.length} entries
                          </PixelBadge>
                          <span className="text-xs text-muted-foreground">
                            {expanded ? "▲" : "▼"}
                          </span>
                        </div>
                      </button>
                      {expanded && (
                        <div className="border-t-2 border-border p-3 space-y-2 max-h-64 overflow-y-auto">
                          {log.entries.map((entry, i) => (
                            <div key={i} className="text-xs">
                              <span className="text-[8px] font-[family-name:var(--font-pixel)] text-muted-foreground mr-2">
                                {entry.timestamp}
                              </span>
                              <span className="text-foreground/90">
                                {entry.content}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </PixelCard>
                  );
                })}
              </section>
            )}
          </div>

          {/* Sticky TOC Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-16 space-y-3">
              <h3 className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wider text-muted-foreground">
                Table of Contents
              </h3>
              <nav className="space-y-1">
                {toc.map((entry) => (
                  <a
                    key={entry.id}
                    href={`#${entry.id}`}
                    className="block text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
                    style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}
                  >
                    {entry.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        </div>
      </div>

      <FloatingChat onSend={handleChat} />
    </>
  );
}
