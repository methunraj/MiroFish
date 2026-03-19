"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store/app-store";
import { PixelButton } from "@/components/ui/pixel-button";
import { PixelInput } from "@/components/ui/pixel-input";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface FloatingChatProps {
  onSend?: (message: string, history: Message[]) => Promise<string>;
}

export function FloatingChat({ onSend }: FloatingChatProps) {
  const open = useAppStore((s) => s.chatOpen);
  const setOpen = useAppStore((s) => s.setChatOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !onSend) return;
    const msg = input.trim();
    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const reply = await onSend(msg, newMessages);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Error: could not get response" },
      ]);
    }
    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-4 right-4 z-50 size-12 border-2 border-primary bg-card",
          "flex items-center justify-center shadow-[3px_3px_0px_var(--border)]",
          "hover:shadow-[0_0_12px_color-mix(in_srgb,var(--primary)_40%,transparent)] transition-all",
          "font-[family-name:var(--font-pixel)] text-primary text-sm"
        )}
      >
        {open ? "×" : ">>"}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-20 right-4 z-50 w-80 h-96 border-2 border-border bg-card shadow-[4px_4px_0px_var(--border)] flex flex-col"
          >
            <div className="h-10 border-b-2 border-border px-3 flex items-center">
              <span className="font-[family-name:var(--font-pixel)] text-[8px] text-foreground">
                CHAT
              </span>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-sm p-2 border-2",
                    m.role === "user"
                      ? "border-primary/40 bg-primary/10 ml-6"
                      : "border-border bg-muted mr-6"
                  )}
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="text-sm p-2 border-2 border-border bg-muted mr-6 font-[family-name:var(--font-pixel-body)] text-muted-foreground">
                  THINKING...
                </div>
              )}
            </div>

            <div className="border-t-2 border-border p-2 flex gap-2">
              <PixelInput
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Message..."
                className="flex-1 h-8 text-sm"
              />
              <PixelButton size="sm" onClick={send} disabled={loading}>
                &gt;&gt;
              </PixelButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
