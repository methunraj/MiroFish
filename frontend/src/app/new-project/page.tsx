"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { PixelCard } from "@/components/ui/pixel-card";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelInput, PixelTextarea } from "@/components/ui/pixel-input";
import { PixelBadge } from "@/components/ui/pixel-badge";
import { cn } from "@/lib/utils";
import { graphApi } from "@/lib/api/graph";
import { fadeUp } from "@/lib/motion/presets";
import { StandaloneNav } from "@/components/layout/standalone-nav";

const STEPS = ["Upload", "Requirements", "Launch"] as const;

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [requirements, setRequirements] = useState("");
  const [projectName, setProjectName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      setStep(1);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) {
        setFile(f);
        setStep(1);
      }
    },
    []
  );

  const handleSubmit = async () => {
    if (!file || !projectName.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("project_name", projectName.trim());
      if (requirements.trim()) form.append("requirements", requirements.trim());
      const res = await graphApi.generateOntology(form);
      const projectId = res.data?.project_id ?? res.data?.id ?? res.data;
      router.push(`/process/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed =
    (step === 0 && file) ||
    (step === 1) ||
    (step === 2 && projectName.trim());

  return (
    <div className="min-h-screen flex flex-col">
      <StandaloneNav />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="w-full max-w-xl"
      >
        <PixelCard glow className="p-6 md:p-8">
          {/* Step dots */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <button
                  onClick={() => { if (i < step || (i === step)) return; }}
                  className={cn(
                    "size-3 border-2 transition-all",
                    i <= step
                      ? "border-primary bg-primary"
                      : "border-border bg-transparent"
                  )}
                />
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-8 h-0.5",
                      i < step ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-8 mb-6">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wider",
                  i === step ? "text-primary" : "text-muted-foreground"
                )}
              >
                {s}
              </span>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* Step 0 — Upload */}
            {step === 0 && (
              <motion.div
                key="upload"
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -8 }}
              >
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all min-h-[180px]",
                    dragging
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="size-10 border-2 border-muted-foreground/40 flex items-center justify-center">
                    <span className="text-xl text-muted-foreground">↑</span>
                  </div>
                  <p className="font-[family-name:var(--font-pixel)] text-[10px] uppercase text-muted-foreground text-center">
                    {file
                      ? file.name
                      : "Drop your document here or click to browse"}
                  </p>
                  <PixelBadge variant="muted">PDF, DOCX, TXT</PixelBadge>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.csv,.json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {file && (
                  <PixelButton
                    className="w-full mt-4"
                    onClick={() => setStep(1)}
                  >
                    {`>> NEXT`}
                  </PixelButton>
                )}
              </motion.div>
            )}

            {/* Step 1 — Requirements */}
            {step === 1 && (
              <motion.div
                key="requirements"
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4"
              >
                <label className="block font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                  Simulation Requirements (optional)
                </label>
                <PixelTextarea
                  rows={5}
                  placeholder="Describe what you want to simulate, any constraints or focus areas..."
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                />
                <div className="flex gap-2">
                  <PixelButton
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(0)}
                  >
                    BACK
                  </PixelButton>
                  <PixelButton
                    className="flex-1"
                    onClick={() => setStep(2)}
                  >
                    {`>> NEXT`}
                  </PixelButton>
                </div>
              </motion.div>
            )}

            {/* Step 2 — Launch */}
            {step === 2 && (
              <motion.div
                key="launch"
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -8 }}
                className="space-y-4"
              >
                <label className="block font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
                  Project Name
                </label>
                <PixelInput
                  placeholder="My Simulation Project"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />

                {file && (
                  <div className="flex items-center gap-2">
                    <PixelBadge variant="green">READY</PixelBadge>
                    <span className="text-xs text-muted-foreground truncate">
                      {file.name}
                    </span>
                  </div>
                )}

                {error && (
                  <p className="text-[10px] font-[family-name:var(--font-pixel)] text-[#E05038] uppercase">
                    {error}
                  </p>
                )}

                <div className="flex gap-2">
                  <PixelButton
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(1)}
                  >
                    BACK
                  </PixelButton>
                  <PixelButton
                    className="flex-1"
                    disabled={!projectName.trim() || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? "CREATING..." : ">> CREATE PROJECT"}
                  </PixelButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </PixelCard>
      </motion.div>
      </div>
    </div>
  );
}
