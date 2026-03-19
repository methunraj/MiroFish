"use client";

import { useState, createContext, useContext, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
}

interface ToastContextValue {
  addToast: (message: string, type?: Toast["type"]) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`px-4 py-3 border-2 text-xs font-[family-name:var(--font-pixel-body)] ${
                toast.type === "error"
                  ? "bg-[#E05038]/10 border-[#E05038] text-[#E05038]"
                  : toast.type === "success"
                  ? "bg-[#9BBC0F]/10 border-[#9BBC0F] text-[#9BBC0F]"
                  : "bg-[#5B8CF0]/10 border-[#5B8CF0] text-[#5B8CF0]"
              }`}
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
