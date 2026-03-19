"use client";

import { SimInputWizard, type FieldConfig } from "@/components/simulation/sim-input-wizard";
import { simulationApi } from "@/lib/api/simulation";

const FIELDS: FieldConfig[] = [
  {
    name: "scenario_description",
    label: "Economic Scenario",
    type: "textarea",
    placeholder: "Describe the economic scenario (e.g. interest rate hike, trade war, tech boom, recession)...",
  },
  {
    name: "region",
    label: "Economic Region",
    type: "text",
    placeholder: "e.g. US Economy, EU Single Market, Southeast Asia...",
  },
  {
    name: "economic_model",
    label: "Model Type",
    type: "select",
    options: [
      { value: "macro", label: "Macroeconomic" },
      { value: "micro", label: "Microeconomic" },
      { value: "behavioral", label: "Behavioral" },
      { value: "market", label: "Market Dynamics" },
      { value: "trade", label: "Trade / Global" },
    ],
  },
  {
    name: "sectors",
    label: "Economic Sectors",
    type: "multi-select",
    options: [
      { value: "technology", label: "Technology" },
      { value: "finance", label: "Finance" },
      { value: "manufacturing", label: "Manufacturing" },
      { value: "agriculture", label: "Agriculture" },
      { value: "services", label: "Services" },
      { value: "energy", label: "Energy" },
      { value: "healthcare", label: "Healthcare" },
      { value: "real_estate", label: "Real Estate" },
    ],
  },
  {
    name: "time_horizon",
    label: "Time Horizon (quarters)",
    type: "slider",
    min: 1,
    max: 20,
    step: 1,
    defaultValue: 4,
  },
  {
    name: "sim_preset",
    label: "Simulation Mode",
    type: "sim-preset",
    defaultValue: "standard",
    options: [
      { value: "quick", label: "Quick", desc: "~15 agents, 4 rounds, 1hr sim", icon: "⚡" },
      { value: "standard", label: "Standard", desc: "~50 agents, 12 rounds, 4hr sim", icon: "⚖️" },
      { value: "deep", label: "Deep", desc: "~100 agents, 30 rounds, 12hr sim", icon: "🔬" },
      { value: "auto", label: "Automatic", desc: "AI decides everything", icon: "🤖" },
    ],
  },
  {
    name: "population_size",
    label: "Agent Population",
    type: "slider",
    min: 20,
    max: 300,
    step: 10,
    defaultValue: 80,
  },
];

export default function EconomySimPage() {
  return (
    <SimInputWizard
      mode="economy"
      title="Economic Simulation"
      subtitle="Simulate economic scenarios and their cascading effects"
      fields={FIELDS}
      redirectPrefix="/economy-sim"
      onSubmit={async (values) => {
        const res = await simulationApi.create({ mode: "economy", config: values });
        return res.data?.id ?? res.data?.sim_id;
      }}
    />
  );
}
