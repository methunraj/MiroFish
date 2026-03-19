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

export default function PromptSimPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [budgetRange, setBudgetRange] = useState("");
  const [populationSize, setPopulationSize] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggleIndustry = useCallback((tag: string) => {
    setIndustries((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

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

            {/* Population Size */}
            <motion.div variants={staggerItem}>
              <label className="block mb-1.5 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                Population Size
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={200}
                  step={10}
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
