"use client";

import { useParams } from "next/navigation";
import { SimReportPage } from "@/components/simulation/sim-report-page";

export default function EconomySimReportPage() {
  const params = useParams();
  const simId = params.simId as string;

  return (
    <SimReportPage
      simId={simId}
      mode="economy"
      title="Economic Analysis Report"
      breadcrumbs={[
        { label: "ECONOMY SIM" },
        { label: simId.slice(0, 8) },
        { label: "REPORT" },
      ]}
    />
  );
}
