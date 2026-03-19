"use client";

import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/shared/error-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <ToastProvider>
          {mounted ? children : <div style={{ visibility: "hidden" }}>{children}</div>}
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
