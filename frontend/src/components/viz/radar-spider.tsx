"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

interface RadarAxis {
  key: string;
  label: string;
  max: number;
}

interface RadarDataset {
  label: string;
  values: Record<string, number>;
  color?: string;
}

interface RadarSpiderData {
  axes: RadarAxis[];
  datasets: RadarDataset[];
}

interface RadarSpiderProps {
  data: RadarSpiderData;
  className?: string;
}

const NES_COLORS = ["#9BBC0F", "#5B8CF0", "#E05038", "#F8B800"];

export function RadarSpider({ data, className }: RadarSpiderProps) {
  if (!data.axes.length || !data.datasets.length) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center border-2 border-border bg-card min-h-[320px]",
          className
        )}
      >
        <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
          NO RADAR DATA
        </span>
      </div>
    );
  }

  const chartData = data.axes.map((axis) => {
    const point: Record<string, string | number> = {
      axis: axis.label,
      fullMark: axis.max,
    };
    data.datasets.forEach((ds) => {
      point[ds.label] = ds.values[axis.key] ?? 0;
    });
    return point;
  });

  return (
    <div
      className={cn(
        "relative border-2 border-border bg-card p-4 min-h-[320px]",
        className
      )}
    >
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="#306230" strokeDasharray="2 2" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{
              fill: "#E0F8D0",
              fontSize: 10,
              fontFamily: "var(--font-pixel)",
            }}
          />
          {data.datasets.map((ds, i) => (
            <Radar
              key={ds.label}
              name={ds.label}
              dataKey={ds.label}
              stroke={ds.color ?? NES_COLORS[i % NES_COLORS.length]}
              fill={ds.color ?? NES_COLORS[i % NES_COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
          <Legend
            wrapperStyle={{
              fontFamily: "var(--font-pixel)",
              fontSize: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
