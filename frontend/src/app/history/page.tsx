"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import api from "@/lib/api/client";
import { StandaloneNav } from "@/components/layout/standalone-nav";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { PixelButton } from "@/components/ui/pixel-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingState } from "@/components/shared/loading-state";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion/presets";

interface Simulation {
  id: string;
  mode: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  population_count: number;
  actions_count?: number;
  created_at: string;
  updated_at?: string;
}

const MODE_ROUTES: Record<string, (id: string) => string> = {
  prompt: (id) => `/prompt-sim/${id}`,
  product_launch: (id) => `/product-sim/${id}`,
  economy: (id) => `/economy-sim/${id}`,
  document: () => "/",
};

const MODE_LABELS: Record<string, string> = {
  prompt: "MARKET",
  product_launch: "PRODUCT",
  economy: "ECONOMY",
  document: "DOCUMENT",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getSimLink(sim: Simulation): { href: string; label: string } {
  const baseRoute = MODE_ROUTES[sim.mode]?.(sim.id) ?? "/";
  if (sim.mode === "document") return { href: baseRoute, label: "HOME" };
  const isComplete = ["completed", "failed", "stopped"].includes(
    (sim.status || "").toLowerCase()
  );
  if (isComplete) {
    return {
      href: `${baseRoute}/report`,
      label: "REPORT",
    };
  }
  return { href: baseRoute, label: "LIVE" };
}

export default function HistoryPage() {
  const [sims, setSims] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchSims() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<Simulation[]>("/sim/list", { params: { limit: 100 } });
        const list = Array.isArray(res.data) ? res.data : [];
        const sorted = [...list].sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });
        if (!cancelled) setSims(sorted);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load simulations");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSims();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <StandaloneNav />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mb-8"
        >
          <h1 className="font-[family-name:var(--font-pixel)] text-2xl uppercase tracking-wider text-foreground mb-1">
            SIMULATION HISTORY
          </h1>
          <p className="font-[family-name:var(--font-pixel-body)] text-muted-foreground text-sm">
            All simulations, sorted by most recent first.
          </p>
        </motion.div>

        {loading && <LoadingState message="LOADING SIMULATIONS..." />}

        {!loading && error && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="py-12"
          >
            <PixelCard className="border-[#E05038] bg-[#E05038]/10">
              <p className="font-[family-name:var(--font-pixel-body)] text-[#E05038]">
                {error}
              </p>
            </PixelCard>
          </motion.div>
        )}

        {!loading && !error && sims.length === 0 && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="py-16 text-center"
          >
            <p className="font-[family-name:var(--font-pixel-body)] text-muted-foreground">
              No simulations yet. Create one from Market, Product, or Economy.
            </p>
          </motion.div>
        )}

        {!loading && !error && sims.length > 0 && (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-2 border-b-2 border-border font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wider text-muted-foreground">
              <span>NAME</span>
              <span>MODE</span>
              <span>STATUS</span>
              <span>POP</span>
              <span>CREATED</span>
              <span />
            </div>
            {sims.map((sim) => {
              const { href, label } = getSimLink(sim);
              const modeLabel = MODE_LABELS[sim.mode] ?? sim.mode?.toUpperCase() ?? "—";
              return (
                <motion.div key={sim.id} variants={staggerItem}>
                  <PixelCard className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                    <div className="flex-1 min-w-0">
                      <p className="font-[family-name:var(--font-pixel)] text-[10px] uppercase truncate text-foreground">
                        {sim.name || "Untitled"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <PixelBadge variant="blue">{modeLabel}</PixelBadge>
                      <StatusBadge status={sim.status || "pending"} />
                      <span className="font-[family-name:var(--font-pixel-body)] text-sm text-muted-foreground">
                        {sim.population_count ?? 0}
                      </span>
                      <span className="font-[family-name:var(--font-pixel-body)] text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(sim.created_at)}
                      </span>
                      <Link href={href}>
                        <PixelButton variant="default" size="sm">
                          {label}
                        </PixelButton>
                      </Link>
                    </div>
                  </PixelCard>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </main>
    </div>
  );
}
