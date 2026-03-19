"use client";

import { useParams } from "next/navigation";
import { SimLivePage } from "@/components/simulation/sim-live-page";

const VIZ_OPTIONS = [
  { id: "sankey", label: "Capital Flow" },
  { id: "heatmap", label: "Sector Heatmap" },
  { id: "timeline", label: "Economic Timeline" },
  { id: "network", label: "Trade Network" },
  { id: "social", label: "Social Feed", description: "Agent posts and reactions" },
  { id: "opinion", label: "Public Opinion", description: "Sentiment analysis" },
  { id: "factions", label: "Factions", description: "Group dynamics" },
  { id: "live_feed", label: "Live Feed", description: "Real-time events" },
];

const STATS = [
  { key: "gdp_delta", label: "GDP Delta", format: (v: number) => `${v > 0 ? "+" : ""}${v}%` },
  { key: "unemployment", label: "Unemployment", format: (v: number) => `${v}%` },
  { key: "inflation", label: "Inflation", format: (v: number) => `${v}%` },
  { key: "transactions", label: "Transactions" },
];

export default function EconomySimLivePage() {
  const params = useParams();
  const simId = params.simId as string;

  return (
    <SimLivePage
      simId={simId}
      mode="economy"
      title="Economic Simulation"
      vizOptions={VIZ_OPTIONS}
      statsConfig={STATS}
      breadcrumbs={[
        { label: "ECONOMY SIM" },
        { label: simId.slice(0, 8) },
        { label: "LIVE" },
      ]}
    />
  );
}
