"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import * as d3 from "d3";
import { cn } from "@/lib/utils";

export interface HeatmapGridProps {
  data: {
    xLabels: string[];
    yLabels: string[];
    values: number[][];
    colorScale?: { min: string; max: string };
  } | null;
  className?: string;
}

export function HeatmapGrid({ data, className }: HeatmapGridProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const render = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !data?.xLabels?.length || !data?.yLabels?.length) return;

    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const margin = { top: 8, right: 8, bottom: 40, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const { xLabels, yLabels, values } = data;
    const minColor = data.colorScale?.min ?? "#0F380F";
    const maxColor = data.colorScale?.max ?? "#9BBC0F";

    const allValues = values.flat();
    const extent = d3.extent(allValues) as [number, number];

    const colorScale = d3.scaleLinear<string>()
      .domain(extent)
      .range([minColor, maxColor])
      .interpolate(d3.interpolateRgb);

    const cellW = innerW / xLabels.length;
    const cellH = innerH / yLabels.length;

    const cells: { x: number; y: number; val: number; xLabel: string; yLabel: string }[] = [];
    yLabels.forEach((yLabel, yi) => {
      xLabels.forEach((xLabel, xi) => {
        cells.push({
          x: xi,
          y: yi,
          val: values[yi]?.[xi] ?? 0,
          xLabel,
          yLabel,
        });
      });
    });

    g.selectAll("rect")
      .data(cells)
      .join("rect")
      .attr("x", (d) => d.x * cellW)
      .attr("y", (d) => d.y * cellH)
      .attr("width", Math.max(1, cellW - 1))
      .attr("height", Math.max(1, cellH - 1))
      .attr("fill", (d) => colorScale(d.val))
      .attr("stroke", "#306230")
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => {
        const [x, y] = d3.pointer(event, container);
        setTooltip({
          x,
          y: y - 10,
          text: `${d.yLabel} × ${d.xLabel}: ${d.val.toFixed(2)}`,
        });
        d3.select(event.currentTarget as SVGRectElement)
          .attr("stroke", "#E0F8D0")
          .attr("stroke-width", 2);
      })
      .on("mouseout", (event) => {
        setTooltip(null);
        d3.select(event.currentTarget as SVGRectElement)
          .attr("stroke", "#306230")
          .attr("stroke-width", 1);
      });

    // X-axis labels
    g.append("g")
      .attr("transform", `translate(0,${innerH + 4})`)
      .selectAll("text")
      .data(xLabels)
      .join("text")
      .attr("x", (_d, i) => i * cellW + cellW / 2)
      .attr("y", 0)
      .attr("dy", "0.8em")
      .attr("text-anchor", "end")
      .attr("transform", (_d, i) => `rotate(-45, ${i * cellW + cellW / 2}, 0)`)
      .attr("font-size", "7px")
      .attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0")
      .text((d) => d.length > 8 ? d.slice(0, 7) + "…" : d);

    // Y-axis labels
    g.append("g")
      .attr("transform", "translate(-4, 0)")
      .selectAll("text")
      .data(yLabels)
      .join("text")
      .attr("x", 0)
      .attr("y", (_d, i) => i * cellH + cellH / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("font-size", "7px")
      .attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0")
      .text((d) => d.length > 8 ? d.slice(0, 7) + "…" : d);

    // Color legend
    const legendW = Math.min(120, innerW * 0.3);
    const legendH = 8;
    const legendG = svg.append("g")
      .attr("transform", `translate(${width - margin.right - legendW}, ${margin.top})`);

    const legendScale = d3.scaleLinear().domain([0, legendW]).range(extent);
    const legendData = d3.range(0, legendW, 1);

    legendG.selectAll("rect")
      .data(legendData)
      .join("rect")
      .attr("x", (d) => d)
      .attr("y", 0)
      .attr("width", 1)
      .attr("height", legendH)
      .attr("fill", (d) => colorScale(legendScale(d)));

    legendG.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", legendW).attr("height", legendH)
      .attr("fill", "none")
      .attr("stroke", "#306230")
      .attr("stroke-width", 1);

    legendG.append("text")
      .attr("x", 0).attr("y", legendH + 10)
      .attr("font-size", "6px").attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0").text(extent[0].toFixed(1));

    legendG.append("text")
      .attr("x", legendW).attr("y", legendH + 10)
      .attr("text-anchor", "end")
      .attr("font-size", "6px").attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0").text(extent[1].toFixed(1));
  }, [data]);

  useEffect(() => {
    render();
    const observer = new ResizeObserver(() => render());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [render]);

  if (!data?.xLabels?.length || !data?.yLabels?.length || !data?.values?.length) {
    return (
      <div className={cn("flex items-center justify-center border-2 border-border bg-card p-8", className)}>
        <span className="text-[10px] font-[family-name:var(--font-pixel)] uppercase text-muted-foreground">
          No heatmap data
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative w-full h-full min-h-[250px] border-2 border-border bg-[#0F380F] overflow-hidden", className)}>
      <svg ref={svgRef} className="block w-full h-full" />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 border-2 border-primary bg-card px-2 py-1 text-[8px] font-[family-name:var(--font-pixel)] uppercase text-primary shadow-[2px_2px_0px_var(--border)]"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
