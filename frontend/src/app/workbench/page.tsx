"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api/client";
import { StandaloneNav } from "@/components/layout/standalone-nav";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { PixelInput, PixelTextarea } from "@/components/ui/pixel-input";
import { PixelDialog } from "@/components/ui/pixel-dialog";
import { LoadingState } from "@/components/shared/loading-state";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

const ROLES = ["general", "researcher", "analyst", "developer"] as const;

const TOOL_OPTIONS = [
  { id: "web_browser", label: "Web browser" },
  { id: "code_executor", label: "Code executor" },
  { id: "file_manager", label: "File manager" },
  { id: "api_client", label: "API client" },
  { id: "web_search", label: "Web search" },
] as const;

type Role = (typeof ROLES)[number];

interface WorkbenchAgent {
  id: string;
  name: string;
  role: string;
  goals: string[];
  tools: string[];
  status: string;
  created_at?: string;
  task?: string | null;
  memory_size?: number;
  artifacts_count: number;
  is_running?: boolean;
}

interface ActivityEntry {
  id: string;
  type: string;
  agent_name: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ArtifactEntry {
  path: string;
  size: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WorkbenchPage() {
  const [agents, setAgents] = useState<WorkbenchAgent[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("general");
  const [goalsText, setGoalsText] = useState("");
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    () => new Set()
  );
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deployOpen, setDeployOpen] = useState(false);
  const [deployAgent, setDeployAgent] = useState<WorkbenchAgent | null>(null);
  const [deployTask, setDeployTask] = useState("");
  const [deploySubmitting, setDeploySubmitting] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const [detailAgent, setDetailAgent] = useState<WorkbenchAgent | null>(null);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [actionId, setActionId] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setListError(null);
    setListLoading(true);
    try {
      const { data } = await api.get<{ agents: WorkbenchAgent[]; count: number }>(
        "/workbench/agents"
      );
      setAgents(data.agents ?? []);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String(
              (e as { response?: { data?: { error?: string } } }).response?.data
                ?.error ?? "Failed to load agents"
            )
          : "Failed to load agents";
      setListError(msg);
      setAgents([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const loadDetail = useCallback(async (agentId: string) => {
    setDetailError(null);
    setDetailLoading(true);
    try {
      const [actRes, artRes] = await Promise.all([
        api.get<{ activities: ActivityEntry[]; total: number }>(
          `/workbench/${agentId}/activities`
        ),
        api.get<{ artifacts: ArtifactEntry[]; count: number }>(
          `/workbench/${agentId}/artifacts`
        ),
      ]);
      setActivities(actRes.data.activities ?? []);
      setArtifacts(artRes.data.artifacts ?? []);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String(
              (e as { response?: { data?: { error?: string } } }).response?.data
                ?.error ?? "Failed to load detail"
            )
          : "Failed to load detail";
      setDetailError(msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!detailAgent) return;
    loadDetail(detailAgent.id);
    const t = setInterval(() => loadDetail(detailAgent.id), 4000);
    return () => clearInterval(t);
  }, [detailAgent, loadDetail]);

  const toggleTool = (id: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const goals = goalsText
      .split(/\n/)
      .map((g) => g.trim())
      .filter(Boolean);
    if (!name.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreateSubmitting(true);
    try {
      const { data } = await api.post<{ status?: string; agent?: WorkbenchAgent }>(
        "/workbench/create-agent",
        {
          name: name.trim(),
          role,
          goals,
          tools: Array.from(selectedTools),
        }
      );
      if (data.agent) {
        setName("");
        setGoalsText("");
        setSelectedTools(new Set());
        setRole("general");
      }
      await fetchAgents();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String(
              (e as { response?: { data?: { error?: string } } }).response?.data
                ?.error ?? "Create failed"
            )
          : "Create failed";
      setCreateError(msg);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openDeploy = (a: WorkbenchAgent) => {
    setDeployAgent(a);
    setDeployTask("");
    setDeployError(null);
    setDeployOpen(true);
  };

  const handleDeploy = async () => {
    if (!deployAgent || !deployTask.trim()) {
      setDeployError("Task description is required");
      return;
    }
    setDeployError(null);
    setDeploySubmitting(true);
    try {
      await api.post("/workbench/deploy", {
        agent_id: deployAgent.id,
        task: deployTask.trim(),
      });
      setDeployOpen(false);
      setDeployAgent(null);
      await fetchAgents();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String(
              (e as { response?: { data?: { error?: string } } }).response?.data
                ?.error ?? "Deploy failed"
            )
          : "Deploy failed";
      setDeployError(msg);
    } finally {
      setDeploySubmitting(false);
    }
  };

  const handleStop = async (id: string) => {
    setActionId(id);
    try {
      await api.post(`/workbench/${id}/stop`);
      await fetchAgents();
      if (detailAgent?.id === id) {
        setDetailAgent((prev) =>
          prev ? { ...prev, is_running: false, status: "idle" } : null
        );
      }
    } finally {
      setActionId(null);
    }
  };

  const statusBadgeVariant = (a: WorkbenchAgent) => {
    if (a.is_running) return "green" as const;
    const s = (a.status || "idle").toLowerCase();
    if (s === "error" || s === "failed") return "coral" as const;
    if (s === "busy" || s === "working") return "blue" as const;
    if (s === "idle") return "muted" as const;
    return "gold" as const;
  };

  const displayStatus = (a: WorkbenchAgent) =>
    a.is_running ? "running" : a.status || "idle";

  return (
    <div className="min-h-dvh bg-background">
      <StandaloneNav />

      <motion.main
        className="max-w-6xl mx-auto px-4 py-8 pb-24"
        initial="hidden"
        animate="visible"
        variants={fadeUp}
      >
        <header className="mb-10 border-b-2 border-border pb-6">
          <h1
            className="font-[family-name:var(--font-pixel)] text-xl sm:text-2xl tracking-[0.2em] text-[#9BBC0F]"
            style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.15)" }}
          >
            AGENT WORKBENCH
          </h1>
          <p className="mt-2 font-[family-name:var(--font-pixel-body)] text-sm text-muted-foreground max-w-xl">
            Create autonomous agents, assign tools and goals, deploy tasks, and
            monitor activity and artifacts.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
          <motion.section variants={fadeUp}>
            <PixelCard className="border-[#9BBC0F]/40">
              <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[#5B8CF0] mb-4">
                Create agent
              </h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Name
                  </label>
                  <PixelInput
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Research Alpha"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className={cn(
                      "flex h-9 w-full border-2 border-border bg-background px-3 py-1",
                      "font-[family-name:var(--font-pixel-body)] text-sm text-foreground",
                      "focus:border-[#9BBC0F] focus:outline-none"
                    )}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Goals (one per line)
                  </label>
                  <PixelTextarea
                    value={goalsText}
                    onChange={(e) => setGoalsText(e.target.value)}
                    placeholder="One goal per line, e.g. summarize competitor pricing"
                    rows={4}
                    className="text-sm min-h-[100px]"
                  />
                </div>
                <div>
                  <span className="block font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wider text-muted-foreground mb-2">
                    Tools
                  </span>
                  <div className="space-y-2">
                    {TOOL_OPTIONS.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 cursor-pointer font-[family-name:var(--font-pixel-body)] text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTools.has(t.id)}
                          onChange={() => toggleTool(t.id)}
                          className="size-4 border-2 border-border accent-[#9BBC0F] rounded-none"
                        />
                        <span className="text-foreground/90">{t.label}</span>
                        <span className="text-muted-foreground text-[10px] font-mono">
                          {t.id}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                {createError && (
                  <p className="text-sm font-[family-name:var(--font-pixel-body)] text-[#E05038]">
                    {createError}
                  </p>
                )}
                <PixelButton
                  type="submit"
                  disabled={createSubmitting}
                  className="w-full border-[#9BBC0F]"
                >
                  {createSubmitting ? "Creating…" : "Create agent"}
                </PixelButton>
              </form>
            </PixelCard>
          </motion.section>

          <section>
            <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[#F8B800] mb-4">
              Your agents
            </h2>
            {listLoading ? (
              <LoadingState message="LOADING AGENTS…" />
            ) : listError ? (
              <PixelCard className="border-[#E05038]/50">
                <p className="font-[family-name:var(--font-pixel-body)] text-[#E05038]">
                  {listError}
                </p>
                <PixelButton
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => fetchAgents()}
                >
                  Retry
                </PixelButton>
              </PixelCard>
            ) : agents.length === 0 ? (
              <PixelCard className="border-dashed">
                <p className="font-[family-name:var(--font-pixel-body)] text-muted-foreground text-sm">
                  No agents yet. Create one using the form.
                </p>
              </PixelCard>
            ) : (
              <motion.ul
                className="grid gap-4 sm:grid-cols-1 xl:grid-cols-2"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {agents.map((a) => (
                  <motion.li key={a.id} variants={staggerItem}>
                    <PixelCard className="h-full flex flex-col gap-3 border-[#5B8CF0]/25">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-[family-name:var(--font-pixel)] text-xs uppercase tracking-wide text-foreground">
                            {a.name}
                          </h3>
                          <p className="font-[family-name:var(--font-pixel-body)] text-xs text-muted-foreground mt-0.5">
                            {a.id}
                          </p>
                        </div>
                        <PixelBadge variant={statusBadgeVariant(a)}>
                          {displayStatus(a)}
                        </PixelBadge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <PixelBadge variant="blue">{a.role}</PixelBadge>
                        <PixelBadge variant="gold">
                          {a.artifacts_count ?? 0} artifacts
                        </PixelBadge>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-auto pt-2">
                        <PixelButton
                          size="sm"
                          onClick={() => openDeploy(a)}
                          className="border-[#9BBC0F]"
                        >
                          Deploy
                        </PixelButton>
                        <PixelButton
                          size="sm"
                          variant="secondary"
                          disabled={actionId === a.id}
                          onClick={() => handleStop(a.id)}
                        >
                          {actionId === a.id ? "Stopping…" : "Stop"}
                        </PixelButton>
                        <PixelButton
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDetailAgent(a);
                            setActivities([]);
                            setArtifacts([]);
                          }}
                        >
                          View
                        </PixelButton>
                      </div>
                    </PixelCard>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </section>
        </div>
      </motion.main>

      <PixelDialog
        open={deployOpen}
        onOpenChange={setDeployOpen}
        title="Deploy task"
        description={
          deployAgent
            ? `Agent: ${deployAgent.name} (${deployAgent.id})`
            : undefined
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Task description
            </label>
            <PixelTextarea
              value={deployTask}
              onChange={(e) => setDeployTask(e.target.value)}
              placeholder="Describe what the agent should accomplish…"
              rows={5}
              className="text-sm"
            />
          </div>
          {deployError && (
            <p className="text-sm font-[family-name:var(--font-pixel-body)] text-[#E05038]">
              {deployError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <PixelButton
              variant="ghost"
              size="sm"
              onClick={() => setDeployOpen(false)}
            >
              Cancel
            </PixelButton>
            <PixelButton
              size="sm"
              disabled={deploySubmitting}
              onClick={handleDeploy}
              className="bg-[#5B8CF0] border-[#5B8CF0] text-white hover:brightness-110"
            >
              {deploySubmitting ? "Submitting…" : "Submit deploy"}
            </PixelButton>
          </div>
        </div>
      </PixelDialog>

      <AnimatePresence>
        {detailAgent && (
          <>
            <motion.button
              type="button"
              aria-label="Close detail panel"
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetailAgent(null)}
            />
            <motion.aside
              className="fixed top-0 right-0 z-50 h-full w-full max-w-lg border-l-2 border-border bg-card shadow-[-6px_0_0_var(--border)] flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
            >
              <div className="border-b-2 border-border px-4 py-3 flex items-start justify-between gap-2 shrink-0">
                <div>
                  <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-widest text-[#9BBC0F]">
                    Agent detail
                  </h2>
                  <p className="font-[family-name:var(--font-pixel)] text-xs mt-1 text-foreground">
                    {detailAgent.name}
                  </p>
                  <p className="font-[family-name:var(--font-pixel-body)] text-[10px] text-muted-foreground font-mono">
                    {detailAgent.id}
                  </p>
                </div>
                <PixelButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetailAgent(null)}
                >
                  Close
                </PixelButton>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {detailLoading && activities.length === 0 && artifacts.length === 0 ? (
                  <LoadingState message="LOADING DETAIL…" className="py-8" />
                ) : null}
                {detailError && (
                  <p className="text-sm font-[family-name:var(--font-pixel-body)] text-[#E05038]">
                    {detailError}
                  </p>
                )}

                <div>
                  <h3 className="font-[family-name:var(--font-pixel)] text-[9px] uppercase tracking-wider text-[#5B8CF0] mb-3">
                    Activity stream
                  </h3>
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto border-2 border-border p-2 bg-background/80">
                    {activities.length === 0 ? (
                      <p className="font-[family-name:var(--font-pixel-body)] text-xs text-muted-foreground py-4 text-center">
                        No activities yet.
                      </p>
                    ) : (
                      activities.map((act) => (
                        <div
                          key={act.id}
                          className="border-2 border-border/60 p-2 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <PixelBadge variant="blue" className="text-[7px]">
                              {act.type}
                            </PixelBadge>
                            <span className="font-[family-name:var(--font-pixel-body)] text-[10px] text-muted-foreground">
                              {act.timestamp}
                            </span>
                          </div>
                          <p className="font-[family-name:var(--font-pixel-body)] text-xs text-foreground whitespace-pre-wrap">
                            {act.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-[family-name:var(--font-pixel)] text-[9px] uppercase tracking-wider text-[#F8B800] mb-3">
                    Artifacts
                  </h3>
                  <ul className="space-y-1 border-2 border-border divide-y-2 divide-border">
                    {artifacts.length === 0 ? (
                      <li className="px-3 py-4 font-[family-name:var(--font-pixel-body)] text-xs text-muted-foreground text-center">
                        No artifacts.
                      </li>
                    ) : (
                      artifacts.map((art) => (
                        <li
                          key={art.path}
                          className="px-3 py-2 flex justify-between gap-2 font-[family-name:var(--font-pixel-body)] text-xs"
                        >
                          <span className="truncate font-mono text-[11px]">
                            {art.path}
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {formatBytes(art.size)}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
