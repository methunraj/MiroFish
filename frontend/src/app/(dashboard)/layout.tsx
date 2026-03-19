"use client";

import { PixelSidebar } from "@/components/layout/pixel-sidebar";
import { FloatingPhasePill } from "@/components/layout/floating-phase-pill";
import { CommandPalette } from "@/components/layout/command-palette";
import { FloatingChat } from "@/components/layout/floating-chat";
import { MobileDrawer } from "@/components/layout/mobile-drawer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <PixelSidebar />
      <MobileDrawer />
      <main className="md:ml-14 min-h-screen">{children}</main>
      <FloatingPhasePill />
      <CommandPalette />
      <FloatingChat />
    </div>
  );
}
