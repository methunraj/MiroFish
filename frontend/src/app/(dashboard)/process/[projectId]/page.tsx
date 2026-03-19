"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TopBar } from "@/components/layout/top-bar";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { PixelProgress } from "@/components/ui/pixel-progress";
import { PixelDialog } from "@/components/ui/pixel-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingState } from "@/components/shared/loading-state";
import { AgentPortrait } from "@/components/shared/agent-portrait";
import { usePolling } from "@/lib/hooks/use-polling";
import { graphApi } from "@/lib/api/graph";
import { simulationApi } from "@/lib/api/simulation";
import { cn } from "@/lib/utils";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion/presets";

type SubStep = "ontology" | "building" | "environment";

interface ProjectData {
  id: string;
  name?: string;
  status?: string;
  ontology?: {
    entity_types?: string[];
    edge_types?: string[];
  };
  graph_id?: string;
  build_progress?: number;
  agents?: { id: string; name: string; role: string; avatar?: string }[];
  environment?: Record<string, unknown>;
  simulation_id?: string;
}

export default function ProcessPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [subStep, setSubStep] = useState<SubStep>("ontology");
  const [graphModalOpen, setGraphModalOpen] = useState(false);
  const [launching, setLaunching] = useState(false);

  const fetcher = useCallback(
    () => graphApi.getProject(projectId).then((r) => r.data as ProjectData),
    [projectId]
  );

  const { data: project, loading } = usePolling<ProjectData>({
    fetcher,
    interval: 3000,
    enabled: true,
  });

  useEffect(() => {
    if (!project) return;
    if (project.build_progress != null && project.build_progress >= 100) {
      setSubStep("environment");
    } else if (project.ontology) {
      if (subStep === "ontology" && project.graph_id) {
        setSubStep("building");
      }
    }
  }, [project, subStep]);

  const handleBuildGraph = async () => {
    if (!project?.graph_id) return;
    try {
      await graphApi.build({
        project_id: projectId,
        graph_id: project.graph_id,
      });
      setSubStep("building");
    } catch { /* ignore */ }
  };

  const handleLaunchSim = async () => {
    setLaunching(true);
    try {
      const res = await simulationApi.legacyCreate({
        project_id: projectId,
        graph_id: project?.graph_id,
      });
      const simId = res.data?.simulation_id ?? res.data?.id ?? res.data;
      router.push(`/simulation/${simId}/run`);
    } catch { /* ignore */ }
    setLaunching(false);
  };

  if (!project && loading) {
    return <LoadingState message="LOADING PROJECT..." />;
  }

  const SUB_STEPS: { key: SubStep; label: string }[] = [
    { key: "ontology", label: "Ontology Review" },
    { key: "building", label: "Graph Building" },
    { key: "environment", label: "Environment Setup" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        breadcrumbs={[
          { label: "PROJECTS" },
          { label: project?.name ?? projectId.slice(0, 8) },
          { label: subStep.toUpperCase() },
        ]}
      />

      <div className="flex-1 p-4 md:p-6 space-y-5 overflow-auto">
        {/* Sub-step tabs */}
        <div className="flex items-center gap-1">
          {SUB_STEPS.map((ss, i) => {
            const active = ss.key === subStep;
            const done =
              (ss.key === "ontology" && subStep !== "ontology") ||
              (ss.key === "building" && subStep === "environment");
            return (
              <div key={ss.key} className="flex items-center gap-1">
                {i > 0 && <div className="w-6 h-0.5 bg-border" />}
                <button
                  onClick={() => setSubStep(ss.key)}
                  className={cn(
                    "px-3 py-1.5 border-2 font-[family-name:var(--font-pixel)] text-[9px] uppercase tracking-wider transition-all",
                    active
                      ? "border-primary bg-primary/20 text-primary"
                      : done
                        ? "border-[#9BBC0F] bg-[#9BBC0F]/10 text-[#9BBC0F]"
                        : "border-border text-muted-foreground"
                  )}
                >
                  {done && "✓ "}
                  {ss.label}
                </button>
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {/* Ontology Review */}
          {subStep === "ontology" && (
            <motion.div
              key="ontology"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <PixelCard className="p-5">
                <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
                  Entity Types
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {project?.ontology?.entity_types?.length ? (
                    project.ontology.entity_types.map((t) => (
                      <PixelBadge key={t} variant="blue">
                        {t}
                      </PixelBadge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Generating ontology...
                    </span>
                  )}
                </div>
              </PixelCard>

              <PixelCard className="p-5">
                <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
                  Edge Types
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {project?.ontology?.edge_types?.length ? (
                    project.ontology.edge_types.map((t) => (
                      <PixelBadge key={t} variant="gold">
                        {t}
                      </PixelBadge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Generating ontology...
                    </span>
                  )}
                </div>
              </PixelCard>

              <div className="flex gap-2">
                <PixelButton
                  variant="outline"
                  onClick={() => setGraphModalOpen(true)}
                  disabled={!project?.graph_id}
                >
                  VIEW KNOWLEDGE GRAPH
                </PixelButton>
                <PixelButton onClick={handleBuildGraph} disabled={!project?.graph_id}>
                  {`>> BUILD GRAPH`}
                </PixelButton>
              </div>
            </motion.div>
          )}

          {/* Graph Building */}
          {subStep === "building" && (
            <motion.div
              key="building"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <PixelCard className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider">
                    Graph Build Progress
                  </h2>
                  <StatusBadge
                    status={
                      (project?.build_progress ?? 0) >= 100
                        ? "completed"
                        : "running"
                    }
                  />
                </div>
                <PixelProgress
                  value={project?.build_progress ?? 0}
                  segments={24}
                  label="Building knowledge graph..."
                />
              </PixelCard>

              <PixelButton
                variant="outline"
                onClick={() => setGraphModalOpen(true)}
              >
                VIEW KNOWLEDGE GRAPH
              </PixelButton>
            </motion.div>
          )}

          {/* Environment Setup */}
          {subStep === "environment" && (
            <motion.div
              key="environment"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <PixelCard className="p-5">
                <h2 className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground mb-4">
                  Agent Profiles
                </h2>
                {project?.agents?.length ? (
                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
                  >
                    {project.agents.map((agent) => (
                      <motion.div key={agent.id} variants={staggerItem}>
                        <PixelCard className="p-3 flex flex-col items-center gap-2 text-center">
                          <AgentPortrait
                            name={agent.name}
                            src={agent.avatar}
                          />
                          <p className="font-[family-name:var(--font-pixel)] text-[9px] uppercase text-foreground">
                            {agent.name}
                          </p>
                          <PixelBadge variant="muted">{agent.role}</PixelBadge>
                        </PixelCard>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Agent profiles will appear once the graph is built.
                  </p>
                )}
              </PixelCard>

              <PixelButton
                size="lg"
                className="w-full"
                disabled={launching}
                onClick={handleLaunchSim}
              >
                {launching
                  ? "PREPARING SIMULATION..."
                  : ">> LAUNCH SIMULATION"}
              </PixelButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Knowledge Graph Modal */}
      <PixelDialog
        open={graphModalOpen}
        onOpenChange={setGraphModalOpen}
        title="Knowledge Graph"
        description="Interactive graph visualization"
      >
        <div className="min-h-[300px] flex items-center justify-center">
          <span className="font-[family-name:var(--font-pixel)] text-[10px] text-muted-foreground uppercase">
            [ KNOWLEDGE GRAPH VISUALIZATION — PLACEHOLDER ]
          </span>
        </div>
      </PixelDialog>
    </div>
  );
}
