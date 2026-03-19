"use client";

import { useParams } from "next/navigation";
import { SimReportPage } from "@/components/simulation/sim-report-page";

export default function ProductSimReportPage() {
  const params = useParams();
  const simId = params.simId as string;

  return (
    <SimReportPage
      simId={simId}
      mode="product"
      title="Product Launch Report"
      breadcrumbs={[
        { label: "PRODUCT SIM" },
        { label: simId.slice(0, 8) },
        { label: "REPORT" },
      ]}
    />
  );
}
