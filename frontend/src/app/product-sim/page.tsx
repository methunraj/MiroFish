"use client";

import { SimInputWizard, type FieldConfig } from "@/components/simulation/sim-input-wizard";
import { simulationApi } from "@/lib/api/simulation";

const FIELDS: FieldConfig[] = [
  {
    name: "product_name",
    label: "Product Name",
    type: "text",
    placeholder: "e.g. SmartFit Pro, EcoBottle, CloudSync...",
  },
  {
    name: "product_description",
    label: "Product Description",
    type: "textarea",
    placeholder: "Describe the product, its features, and unique selling points...",
  },
  {
    name: "target_market",
    label: "Target Market",
    type: "text",
    placeholder: "e.g. Fitness enthusiasts aged 25-40, Enterprise SaaS buyers...",
  },
  {
    name: "price_point",
    label: "Price Point",
    type: "select",
    options: [
      { value: "free", label: "Free / Freemium" },
      { value: "budget", label: "Budget ($1-$50)" },
      { value: "mid", label: "Mid-range ($50-$500)" },
      { value: "premium", label: "Premium ($500+)" },
      { value: "enterprise", label: "Enterprise" },
    ],
  },
  {
    name: "launch_channels",
    label: "Launch Channels",
    type: "multi-select",
    options: [
      { value: "social_media", label: "Social Media" },
      { value: "email", label: "Email Marketing" },
      { value: "influencer", label: "Influencer" },
      { value: "pr", label: "PR / Press" },
      { value: "paid_ads", label: "Paid Ads" },
      { value: "organic", label: "Organic / SEO" },
      { value: "retail", label: "Retail Partners" },
    ],
  },
  {
    name: "population_size",
    label: "Population Size",
    type: "slider",
    min: 20,
    max: 200,
    step: 10,
    defaultValue: 50,
  },
];

export default function ProductSimPage() {
  return (
    <SimInputWizard
      mode="product_launch"
      title="Product Launch Simulation"
      subtitle="Simulate market reception and adoption of your product"
      fields={FIELDS}
      redirectPrefix="/product-sim"
      onSubmit={async (values) => {
        const res = await simulationApi.create({ mode: "product_launch", config: values });
        return res.data?.id ?? res.data?.sim_id;
      }}
    />
  );
}
