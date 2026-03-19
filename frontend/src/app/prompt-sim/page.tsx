"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelInput, PixelTextarea } from "@/components/ui/pixel-input";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { cn } from "@/lib/utils";
import { simulationApi } from "@/lib/api/simulation";
import api from "@/lib/api/client";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion/presets";
import { StandaloneNav } from "@/components/layout/standalone-nav";

const INDUSTRIES = [
  "Tech", "Healthcare", "Finance", "Retail", "Education",
  "Energy", "Real Estate", "Media", "Food & Bev", "Automotive",
];

const BUDGET_RANGES = [
  { value: "bootstrap", label: "$0 – $10K" },
  { value: "seed", label: "$10K – $100K" },
  { value: "series-a", label: "$100K – $1M" },
  { value: "growth", label: "$1M+" },
];

const SIM_PRESETS = [
  { value: "quick", label: "Quick", desc: "~15 agents, 4 rounds, 1hr sim", icon: "⚡" },
  { value: "standard", label: "Standard", desc: "~50 agents, 12 rounds, 4hr sim", icon: "⚖️" },
  { value: "deep", label: "Deep", desc: "~100 agents, 30 rounds, 12hr sim", icon: "🔬" },
  { value: "auto", label: "Automatic", desc: "AI decides everything", icon: "🤖" },
];

export default function PromptSimPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [budgetRange, setBudgetRange] = useState("");
  const [simPreset, setSimPreset] = useState("standard");
  const [populationSize, setPopulationSize] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoRationale, setAutoRationale] = useState("");
  const [error, setError] = useState("");

  const toggleIndustry = useCallback((tag: string) => {
    setIndustries((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const handlePresetChange = async (preset: string) => {
    setSimPreset(preset);
    setAutoRationale("");
    if (preset === "quick") setPopulationSize(15);
    else if (preset === "standard") setPopulationSize(50);
    else if (preset === "deep") setPopulationSize(100);
    else if (preset === "auto" && idea.trim()) {
      setAutoLoading(true);
      try {
        const res = await api.post("/sim/auto-config", { topic: idea.trim(), mode: "prompt" });
        const data = res.data;
        if (data?.population_size) setPopulationSize(data.population_size);
        if (data?.rationale) setAutoRationale(data.rationale);
      } catch {
        setAutoRationale("AI config unavailable — using Standard defaults");
        setPopulationSize(50);
      } finally {
        setAutoLoading(false);
      }
    }
  };

  const handleSubmit = async () => {
    if (!idea.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await simulationApi.create({
        mode: "prompt",
        config: {
          idea: idea.trim(),
          target_market: targetMarket.trim(),
          industries,
          budget_range: budgetRange,
          population_size: populationSize,
          sim_preset: simPreset,
          ...(simPreset === "quick" && { total_simulation_hours: 1, max_rounds: 4, minutes_per_round: 15 }),
          ...(simPreset === "standard" && { total_simulation_hours: 4, max_rounds: 12, minutes_per_round: 20 }),
          ...(simPreset === "deep" && { total_simulation_hours: 12, max_rounds: 30, minutes_per_round: 24 }),
        },
      });
      const simId = res.data?.id ?? res.data?.sim_id;
      router.push(`/prompt-sim/${simId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create simulation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <StandaloneNav />
      <div className="flex-1 flex items-start justify-center px-4 py-12">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="w-full max-w-2xl"
      >
        <PixelCard glow className="p-6 md:p-8">
          <div className="mb-6 text-center">
            <PixelBadge variant="blue" className="mb-3">
              MARKET ANALYSIS
            </PixelBadge>
            <h1 className="font-[family-name:var(--font-pixel)] text-sm uppercase tracking-wider mb-1">
              Test Your Idea
            </h1>
            <p className="text-sm text-muted-foreground">
              Simulate market reactions to your business idea
            </p>
          </div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-5"
          >
            {/* Idea */}
            <motion.div variants={staggerItem}>
              <label className="block mb-1.5 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                Your Idea
              </label>
              <PixelTextarea
                rows={4}
                placeholder="Describe your business idea, product, or service concept..."
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
              />
            </motion.div>

            {/* Target Market */}
            <motion.div variants={staggerItem}>
              <label className="block mb-1.5 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                Target Market
              </label>
              <PixelInput
                placeholder="e.g. Small business owners, Gen-Z consumers, Enterprise IT..."
                value={targetMarket || ""}
                onChange={(e) => setTargetMarket(e.target.value)}
              />
            </motion.div>

            {/* Industry Tags */}
            <motion.div variants={staggerItem}>
              <label className="block mb-1.5 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                Industry Tags
              </label>
              <div className="flex flex-wrap gap-1.5">
                {INDUSTRIES.map((tag) => {
                  const selected = industries.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleIndustry(tag)}
                      className={cn(
                        "px-3 py-1 border-2 text-[9px] font-[family-name:var(--font-pixel)] uppercase tracking-wider transition-all",
                        selected
                          ? "border-[#9BBC0F] bg-[#9BBC0F]/20 text-[#9BBC0F]"
                          : "border-border text-muted-foreground hover:border-[#9BBC0F]/50"
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Budget Range */}
            <motion.div variants={staggerItem}>
              <label className="block mb-1.5 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                Budget Range
              </label>
              <div className="flex flex-wrap gap-1.5">
                {BUDGET_RANGES.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => setBudgetRange(b.value)}
                    className={cn(
                      "px-3 py-1 border-2 text-[9px] font-[family-name:var(--font-pixel)] uppercase tracking-wider transition-all",
                      budgetRange === b.value
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    )}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Simulation Mode Preset */}
            <motion.div variants={staggerItem}>
              <label className="block mb-1.5 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                Simulation Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SIM_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => handlePresetChange(p.value)}
                    className={cn(
                      "p-3 border-2 text-left transition-all",
                      simPreset === p.value
                        ? "border-[#9BBC0F] bg-[#9BBC0F]/10"
                        : "border-border hover:border-[#9BBC0F]/50"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{p.icon}</span>
                      <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-foreground">
                        {p.label}
                      </span>
                    </div>
                    <p className="text-[9px] text-muted-foreground leading-tight">{p.desc}</p>
                  </button>
                ))}
              </div>
              {autoLoading && (
                <p className="mt-2 text-[9px] font-[family-name:var(--font-pixel)] text-[#9BBC0F] animate-pulse uppercase">
                  AI is analyzing your topic...
                </p>
              )}
              {autoRationale && !autoLoading && (
                <p className="mt-2 text-[9px] text-muted-foreground leading-tight border-l-2 border-[#9BBC0F]/50 pl-2">
                  {autoRationale}
                </p>
              )}
            </motion.div>

            {/* Population Size */}
            <motion.div variants={staggerItem}>
              <label className="block mb-1.5 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                Population Size {simPreset === "auto" && "(AI-suggested)"}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={200}
                  step={5}
                  value={populationSize}
                  onChange={(e) => setPopulationSize(Number(e.target.value))}
                  className="flex-1 accent-[#9BBC0F]"
                />
                <span className="font-[family-name:var(--font-pixel)] text-[10px] text-foreground min-w-[3ch] text-right">
                  {populationSize}
                </span>
              </div>
            </motion.div>

            {error && (
              <p className="text-[10px] font-[family-name:var(--font-pixel)] text-[#E05038] uppercase">
                {error}
              </p>
            )}

            <PixelButton
              size="lg"
              className="w-full mt-4"
              disabled={!idea.trim() || submitting}
              onClick={handleSubmit}
            >
              {submitting ? ">> LAUNCHING..." : ">> LAUNCH MARKET ANALYSIS"}
            </PixelButton>
          </motion.div>
        </PixelCard>
      </motion.div>
      </div>
    </div>
  );
}
