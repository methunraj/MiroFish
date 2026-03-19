"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import * as d3 from "d3";
import { cn } from "@/lib/utils";

const EVENT_COLORS: Record<string, string> = {
  default: "#9BBC0F",
  action: "#5B8CF0",
  decision: "#F8B800",
  conflict: "#E05038",
  communication: "#8BAC0F",
};

const FALLBACK_COLORS = ["#9BBC0F", "#5B8CF0", "#F8B800", "#E05038"];

export interface TimelineLane {
  id: string;
  label: string;
}

export interface TimelineEvent {
  lane: string;
  start: number;
  end: number;
  label: string;
  type: string;
  color?: string;
}

export interface MultiLaneTimelineProps {
  data: { lanes: TimelineLane[]; events: TimelineEvent[] } | null;
  className?: string;
}

export function MultiLaneTimeline({ data, className }: MultiLaneTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const render = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !data?.lanes?.length) return;

    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const margin = { top: 24, right: 16, bottom: 24, left: 80 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const { lanes, events } = data;
    if (!events.length) return;

    const timeExtent = d3.extent(events.flatMap((e) => [e.start, e.end])) as [number, number];

    const xScale = d3.scaleLinear().domain(timeExtent).range([0, innerW]);

    const laneHeight = Math.min(40, innerH / lanes.length);
    const yScale = d3.scaleBand()
      .domain(lanes.map((l) => l.id))
      .range([0, lanes.length * laneHeight])
      .padding(0.15);

    // Lane backgrounds
    g.append("g")
      .selectAll("rect")
      .data(lanes)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d) => yScale(d.id) ?? 0)
      .attr("width", innerW)
      .attr("height", yScale.bandwidth())
      .attr("fill", (_d, i) => i % 2 === 0 ? "rgba(48, 98, 48, 0.15)" : "transparent");

    // Lane labels
    g.append("g")
      .selectAll("text")
      .data(lanes)
      .join("text")
      .attr("x", -8)
      .attr("y", (d) => (yScale(d.id) ?? 0) + yScale.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("font-size", "7px")
      .attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0")
      .text((d) => d.label.length > 10 ? d.label.slice(0, 9) + "…" : d.label);

    // Lane separators
    g.append("g")
      .selectAll("line")
      .data(lanes)
      .join("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", (d) => (yScale(d.id) ?? 0) + yScale.bandwidth())
      .attr("y2", (d) => (yScale(d.id) ?? 0) + yScale.bandwidth())
      .attr("stroke", "#306230")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2 2");

    function eventColor(e: TimelineEvent, i: number): string {
      if (e.color) return e.color;
      if (EVENT_COLORS[e.type]) return EVENT_COLORS[e.type];
      return FALLBACK_COLORS[i % FALLBACK_COLORS.length];
    }

    // Events
    const eventPadding = 2;
    g.append("g")
      .selectAll<SVGRectElement, TimelineEvent>("rect")
      .data(events)
      .join("rect")
      .attr("x", (d) => xScale(d.start))
      .attr("y", (d) => (yScale(d.lane) ?? 0) + eventPadding)
      .attr("width", (d) => Math.max(4, xScale(d.end) - xScale(d.start)))
      .attr("height", yScale.bandwidth() - eventPadding * 2)
      .attr("fill", (d, i) => eventColor(d, i))
      .attr("fill-opacity", 0.8)
      .attr("stroke", "#E0F8D0")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => {
        const [x, y] = d3.pointer(event, container);
        setTooltip({ x, y: y - 10, text: `${d.label} (${d.start}–${d.end})` });
        d3.select(event.currentTarget as SVGRectElement)
          .attr("stroke-width", 3)
          .attr("fill-opacity", 1);
      })
      .on("mouseout", (event) => {
        setTooltip(null);
        d3.select(event.currentTarget as SVGRectElement)
          .attr("stroke-width", 2)
          .attr("fill-opacity", 0.8);
      });

    // Event labels (only if wide enough)
    g.append("g")
      .selectAll<SVGTextElement, TimelineEvent>("text")
      .data(events)
      .join("text")
      .attr("x", (d) => xScale(d.start) + 4)
      .attr("y", (d) => (yScale(d.lane) ?? 0) + yScale.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("font-size", "6px")
      .attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#0F380F")
      .style("pointer-events", "none")
      .text((d) => {
        const w = xScale(d.end) - xScale(d.start);
        if (w < 30) return "";
        const maxChars = Math.floor(w / 5);
        return d.label.length > maxChars ? d.label.slice(0, maxChars - 1) + "…" : d.label;
      });

    // Time axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(10, innerW / 60))
      .tickSize(4);

    g.append("g")
      .attr("transform", `translate(0,${lanes.length * laneHeight})`)
      .call(xAxis)
      .selectAll("text")
      .attr("font-size", "6px")
      .attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0");

    g.selectAll(".domain, .tick line").attr("stroke", "#306230");
  }, [data]);

  useEffect(() => {
    render();
    const observer = new ResizeObserver(() => render());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [render]);

  if (!data?.lanes?.length || !data?.events?.length) {
    return (
      <div className={cn("flex items-center justify-center border-2 border-border bg-card p-8", className)}>
        <span className="text-[10px] font-[family-name:var(--font-pixel)] uppercase text-muted-foreground">
          No timeline data
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative w-full h-full min-h-[200px] border-2 border-border bg-[#0F380F] overflow-hidden", className)}>
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
