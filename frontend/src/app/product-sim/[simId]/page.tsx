"use client";

import { useParams } from "next/navigation";
import { SimLivePage } from "@/components/simulation/sim-live-page";

const VIZ_OPTIONS = [
  { id: "network", label: "Adoption Network" },
  { id: "timeline", label: "Launch Timeline" },
  { id: "heatmap", label: "Sentiment Heatmap" },
  { id: "sankey", label: "Channel Flow" },
];

const STATS = [
  { key: "adoption_rate", label: "Adoption %" },
  { key: "avg_rating", label: "Avg Rating", format: (v: number) => `${(v / 10).toFixed(1)}/5` },
  { key: "word_of_mouth", label: "WoM Score" },
  { key: "responses", label: "Responses" },
];

export default function ProductSimLivePage() {
  const params = useParams();
  const simId = params.simId as string;

  return (
    <SimLivePage
      simId={simId}
      mode="product"
      title="Product Launch Simulation"
      vizOptions={VIZ_OPTIONS}
      statsConfig={STATS}
      breadcrumbs={[
        { label: "PRODUCT SIM" },
        { label: simId.slice(0, 8) },
        { label: "LIVE" },
      ]}
    />
  );
}
