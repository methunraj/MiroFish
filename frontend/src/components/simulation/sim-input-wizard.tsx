"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelInput, PixelTextarea } from "@/components/ui/pixel-input";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { cn } from "@/lib/utils";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion/presets";
import { StandaloneNav } from "@/components/layout/standalone-nav";

export interface FieldConfig {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "multi-select" | "slider" | "sim-preset";
  placeholder?: string;
  options?: { value: string; label: string; desc?: string; icon?: string }[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: string | number;
}

interface SimInputWizardProps {
  mode: string;
  title: string;
  subtitle?: string;
  fields: FieldConfig[];
  onSubmit: (values: Record<string, unknown>) => Promise<string>;
  redirectPrefix: string;
}

export function SimInputWizard({
  mode,
  title,
  subtitle,
  fields,
  onSubmit,
  redirectPrefix,
}: SimInputWizardProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "multi-select") init[f.name] = [];
      else if (f.type === "slider") init[f.name] = f.defaultValue ?? f.min ?? 0;
      else init[f.name] = f.defaultValue ?? "";
    }
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = useCallback(
    (name: string, value: unknown) =>
      setValues((prev) => ({ ...prev, [name]: value })),
    []
  );

  const toggleMulti = useCallback(
    (name: string, val: string) =>
      setValues((prev) => {
        const arr = (prev[name] as string[]) || [];
        return {
          ...prev,
          [name]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val],
        };
      }),
    []
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const simId = await onSubmit(values);
      router.push(`${redirectPrefix}/${simId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
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
              {mode.toUpperCase()}
            </PixelBadge>
            <h1 className="font-[family-name:var(--font-pixel)] text-sm uppercase tracking-wider mb-1">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-5"
          >
            {fields.map((field) => (
              <motion.div key={field.name} variants={staggerItem}>
                <label className="block mb-1.5 font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                  {field.label}
                </label>

                {field.type === "text" && (
                  <PixelInput
                    placeholder={field.placeholder}
                    value={(values[field.name] as string) || ""}
                    onChange={(e) => set(field.name, e.target.value)}
                  />
                )}

                {field.type === "number" && (
                  <PixelInput
                    type="number"
                    placeholder={field.placeholder}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={(values[field.name] as number) || ""}
                    onChange={(e) => set(field.name, Number(e.target.value))}
                  />
                )}

                {field.type === "textarea" && (
                  <PixelTextarea
                    rows={4}
                    placeholder={field.placeholder}
                    value={(values[field.name] as string) || ""}
                    onChange={(e) => set(field.name, e.target.value)}
                  />
                )}

                {field.type === "select" && (
                  <div className="flex flex-wrap gap-1.5">
                    {field.options?.map((opt) => {
                      const active = values[field.name] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => set(field.name, opt.value)}
                          className={cn(
                            "px-3 py-1 border-2 text-[9px] font-[family-name:var(--font-pixel)] uppercase tracking-wider transition-all",
                            active
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50"
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {field.type === "multi-select" && (
                  <div className="flex flex-wrap gap-1.5">
                    {field.options?.map((opt) => {
                      const selected = ((values[field.name] as string[]) || []).includes(
                        opt.value
                      );
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => toggleMulti(field.name, opt.value)}
                          className={cn(
                            "px-3 py-1 border-2 text-[9px] font-[family-name:var(--font-pixel)] uppercase tracking-wider transition-all",
                            selected
                              ? "border-[#9BBC0F] bg-[#9BBC0F]/20 text-[#9BBC0F]"
                              : "border-border text-muted-foreground hover:border-[#9BBC0F]/50"
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {field.type === "sim-preset" && (
                  <div className="grid grid-cols-2 gap-2">
                    {field.options?.map((opt) => {
                      const active = values[field.name] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => set(field.name, opt.value)}
                          className={cn(
                            "p-3 border-2 text-left transition-all",
                            active
                              ? "border-[#9BBC0F] bg-[#9BBC0F]/10"
                              : "border-border hover:border-[#9BBC0F]/50"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {opt.icon && <span className="text-base">{opt.icon}</span>}
                            <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-foreground">
                              {opt.label}
                            </span>
                          </div>
                          {opt.desc && (
                            <p className="text-[9px] text-muted-foreground leading-tight">{opt.desc}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {field.type === "slider" && (
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={field.min ?? 0}
                      max={field.max ?? 100}
                      step={field.step ?? 1}
                      value={(values[field.name] as number) || 0}
                      onChange={(e) => set(field.name, Number(e.target.value))}
                      className="flex-1 accent-[#9BBC0F]"
                    />
                    <span className="font-[family-name:var(--font-pixel)] text-[10px] text-foreground min-w-[3ch] text-right">
                      {String(values[field.name])}
                    </span>
                  </div>
                )}
              </motion.div>
            ))}

            {error && (
              <p className="text-[10px] font-[family-name:var(--font-pixel)] text-[#E05038] uppercase">
                {error}
              </p>
            )}

            <PixelButton
              size="lg"
              className="w-full mt-4"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? ">> LAUNCHING..." : ">> LAUNCH SIMULATION"}
            </PixelButton>
          </motion.div>
        </PixelCard>
      </motion.div>
      </div>
    </div>
  );
}
