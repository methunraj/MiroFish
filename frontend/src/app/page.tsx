"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { PixelCard } from "@/components/ui/pixel-card";
import { staggerContainer, staggerItem } from "@/lib/motion/presets";

const SIM_MODES = [
  {
    icon: "◈",
    name: "DOCUMENT",
    desc: "Upload docs, build knowledge graphs, and run social simulations from your own data",
    href: "/new-project",
    color: "#9BBC0F",
    tag: "KNOWLEDGE",
  },
  {
    icon: "◎",
    name: "MARKET",
    desc: "Test business ideas against diverse consumer personas and market conditions",
    href: "/prompt-sim",
    color: "#5B8CF0",
    tag: "ANALYSIS",
  },
  {
    icon: "▣",
    name: "PRODUCT",
    desc: "Model product launch lifecycle — adoption, churn, and competitor response",
    href: "/product-sim",
    color: "#E05038",
    tag: "LIFECYCLE",
  },
  {
    icon: "♦",
    name: "ECONOMY",
    desc: "Simulate economic ecosystems with producers, consumers, and market dynamics",
    href: "/economy-sim",
    color: "#F8B800",
    tag: "SYSTEMS",
  },
];

const MATRIX_CHARS = "01アイウエオカキクケコ◈◎▣♦⟐⟡⬡⬢";

function PixelParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      size: number;
      alpha: number;
    }[] = [];

    const columns: {
      x: number;
      y: number;
      speed: number;
      chars: string[];
      alpha: number;
    }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const COLORS = ["#9BBC0F", "#F8B800", "#5B8CF0", "#306230", "#E05038"];
    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: Math.random() > 0.6 ? 4 : 2,
        alpha: 0.3 + Math.random() * 0.5,
      });
    }

    const colCount = Math.floor(canvas.width / 40);
    for (let i = 0; i < colCount; i++) {
      columns.push({
        x: i * 40 + Math.random() * 20,
        y: Math.random() * canvas.height * -1,
        speed: 0.3 + Math.random() * 0.8,
        chars: Array.from(
          { length: 6 + Math.floor(Math.random() * 8) },
          () => MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        ),
        alpha: 0.03 + Math.random() * 0.06,
      });
    }

    const animate = () => {
      ctx.fillStyle = "rgba(15, 56, 15, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const col of columns) {
        col.y += col.speed;
        if (col.y > canvas.height) {
          col.y = -col.chars.length * 16;
          col.x = Math.random() * canvas.width;
        }
        ctx.font = "12px monospace";
        for (let j = 0; j < col.chars.length; j++) {
          const charAlpha = col.alpha * (1 - j / col.chars.length);
          ctx.fillStyle = `rgba(155, 188, 15, ${charAlpha})`;
          ctx.fillText(col.chars[j], col.x, col.y + j * 16);
        }
      }

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" />;
}

function TypewriterText({ text, className }: { text: string; className?: string }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(timer);
    }, 60);
    return () => clearInterval(timer);
  }, [text]);
  return <span className={className}>{displayed}<span className="pixel-blink">_</span></span>;
}

export default function HomePage() {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div className="relative min-h-screen flex flex-col">
      <PixelParticleCanvas />

      <div className="fixed inset-0 pointer-events-none crt-scanline z-[1]" />

      {/* Top Bar */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="relative z-20 flex items-center justify-between px-6 py-4"
      >
        <div className="font-[family-name:var(--font-pixel)] text-[9px] text-primary tracking-[0.3em]">
          PARALLAX v1.0
        </div>
        <div className="flex items-center gap-4 text-[10px] font-[family-name:var(--font-pixel-body)] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-[#9BBC0F] inline-block pixel-pulse" />
            SYSTEM ONLINE
          </span>
          <span>4 MODES</span>
        </div>
      </motion.header>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mb-5"
          >
            <span className="inline-block px-3 py-1 border-2 border-primary/30 text-[8px] font-[family-name:var(--font-pixel)] text-primary/70 tracking-widest">
              MULTI-AGENT SIMULATION ENGINE
            </span>
          </motion.div>
          <h1 className="font-[family-name:var(--font-pixel)] text-3xl md:text-5xl lg:text-6xl text-foreground mb-5 tracking-[0.15em]">
            <TypewriterText text="PARALLAX" />
          </h1>
          <p className="font-[family-name:var(--font-pixel-body)] text-xl md:text-2xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Simulate Parallel Realities
          </p>
          <p className="font-[family-name:var(--font-pixel-body)] text-base text-muted-foreground/50 mt-2 max-w-md mx-auto">
            Market analysis · Product lifecycle · Economic systems · Knowledge graphs
          </p>
        </motion.div>

        {/* Mode Grid — 2x2 */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl w-full px-2"
        >
          {SIM_MODES.map((mode, idx) => (
            <motion.div key={mode.name} variants={staggerItem}>
              <Link href={mode.href}>
                <PixelCard
                  className="h-full group cursor-pointer relative overflow-hidden transition-all duration-200 hover:border-current p-5"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{
                    borderColor: hoveredIdx === idx ? mode.color : undefined,
                    boxShadow:
                      hoveredIdx === idx
                        ? `0 0 24px ${mode.color}22, 4px 4px 0px ${mode.color}44`
                        : undefined,
                  }}
                >
                  <AnimatePresence>
                    {hoveredIdx === idx && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: `radial-gradient(ellipse at 30% 20%, ${mode.color}10, transparent 60%)`,
                        }}
                      />
                    )}
                  </AnimatePresence>

                  <div className="relative flex items-start gap-4">
                    <div
                      className="text-3xl mt-0.5 transition-transform duration-200 group-hover:scale-110"
                      style={{ color: mode.color }}
                    >
                      {mode.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3
                          className="font-[family-name:var(--font-pixel)] text-xs tracking-wider"
                          style={{ color: mode.color }}
                        >
                          {mode.name}
                        </h3>
                        <span
                          className="text-[7px] font-[family-name:var(--font-pixel)] tracking-wider opacity-40"
                          style={{ color: mode.color }}
                        >
                          {mode.tag}
                        </span>
                      </div>
                      <p className="text-xs font-[family-name:var(--font-pixel-body)] text-muted-foreground leading-relaxed">
                        {mode.desc}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground/30 font-[family-name:var(--font-pixel)] opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                      →
                    </div>
                  </div>
                </PixelCard>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom status bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="mt-10 flex items-center gap-6 text-[9px] font-[family-name:var(--font-pixel-body)] text-muted-foreground/40"
        >
          <span>READY FOR INPUT</span>
          <span>·</span>
          <span>SELECT A SIMULATION MODE TO BEGIN</span>
        </motion.div>
      </div>
    </div>
  );
}
