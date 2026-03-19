"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import * as d3 from "d3";
import { cn } from "@/lib/utils";

const CLUSTER_COLORS = [
  "#9BBC0F", "#5B8CF0", "#F8B800", "#E05038",
  "#8BAC0F", "#306230", "#E0F8D0", "#1A4A1A",
];

export interface DemoNode {
  id: string;
  name: string;
  portrait?: string;
  activity: number;
  group: string | number;
  [key: string]: unknown;
}

export interface DemoEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
  timestamp?: string | number;
}

export interface DemographicNetworkProps {
  data: { nodes: DemoNode[]; edges: DemoEdge[] } | null;
  clusterBy?: string;
  className?: string;
}

interface SimDemoNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  activity: number;
  group: string | number;
  cluster: string;
}

interface SimDemoLink extends d3.SimulationLinkDatum<SimDemoNode> {
  weight: number;
  type: string;
}

function clusterColor(cluster: string, clusters: string[]): string {
  const idx = clusters.indexOf(cluster);
  return CLUSTER_COLORS[idx >= 0 ? idx % CLUSTER_COLORS.length : 0];
}

export function DemographicNetwork({ data, clusterBy = "group", className }: DemographicNetworkProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const render = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !data?.nodes?.length) return;

    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    const nodes: SimDemoNode[] = data.nodes.map((n) => ({
      ...n,
      cluster: String(n[clusterBy] ?? n.group),
    }));
    const clusters = [...new Set(nodes.map((n) => n.cluster))];

    const links: SimDemoLink[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      type: e.type,
    }));

    const clusterCenters = new Map<string, { x: number; y: number }>();
    const angle = (2 * Math.PI) / Math.max(1, clusters.length);
    const radius = Math.min(width, height) * 0.25;
    clusters.forEach((c, i) => {
      clusterCenters.set(c, {
        x: width / 2 + radius * Math.cos(angle * i),
        y: height / 2 + radius * Math.sin(angle * i),
      });
    });

    const simulation = d3.forceSimulation<SimDemoNode>(nodes)
      .force("link", d3.forceLink<SimDemoNode, SimDemoLink>(links).id((d) => d.id).distance(60).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force("collision", d3.forceCollide().radius(14))
      .force("clusterX", d3.forceX<SimDemoNode>((d) => clusterCenters.get(d.cluster)?.x ?? width / 2).strength(0.15))
      .force("clusterY", d3.forceY<SimDemoNode>((d) => clusterCenters.get(d.cluster)?.y ?? height / 2).strength(0.15));

    const link = g
      .append("g")
      .selectAll<SVGLineElement, SimDemoLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#306230")
      .attr("stroke-width", (d) => Math.max(0.5, Math.min(3, d.weight)))
      .attr("stroke-opacity", 0.3)
      .attr("stroke-dasharray", (d) => d.type === "shared_trait" ? "4 2" : "none");

    const node = g
      .append("g")
      .selectAll<SVGCircleElement, SimDemoNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => 5 + Math.min(5, d.activity * 2))
      .attr("fill", (d) => clusterColor(d.cluster, clusters))
      .attr("stroke", "#E0F8D0")
      .attr("stroke-width", 2)
      .style("cursor", "pointer");

    const label = g
      .append("g")
      .selectAll<SVGTextElement, SimDemoNode>("text")
      .data(nodes)
      .join("text")
      .text((d) => d.name)
      .attr("font-size", "7px")
      .attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => -(9 + Math.min(5, d.activity * 2)))
      .style("pointer-events", "none");

    const drag = d3.drag<SVGCircleElement, SimDemoNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    node.on("mouseover", (event, d) => {
      const [x, y] = d3.pointer(event, container);
      setTooltip({ x, y: y - 10, text: `${d.name} (${d.cluster})` });
      d3.select(event.currentTarget as SVGCircleElement)
        .transition().duration(100)
        .attr("stroke-width", 3);
    });
    node.on("mouseout", (event) => {
      setTooltip(null);
      d3.select(event.currentTarget as SVGCircleElement)
        .transition().duration(100)
        .attr("stroke-width", 2);
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimDemoNode).x!)
        .attr("y1", (d) => (d.source as SimDemoNode).y!)
        .attr("x2", (d) => (d.target as SimDemoNode).x!)
        .attr("y2", (d) => (d.target as SimDemoNode).y!);
      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
    });

    // Draw cluster labels
    const clusterLabels = g.append("g");
    clusters.forEach((c) => {
      const center = clusterCenters.get(c)!;
      clusterLabels.append("text")
        .attr("x", center.x)
        .attr("y", center.y - radius * 0.4)
        .attr("text-anchor", "middle")
        .attr("font-size", "9px")
        .attr("font-family", "var(--font-pixel), monospace")
        .attr("fill", clusterColor(c, clusters))
        .attr("opacity", 0.5)
        .text(c.toUpperCase());
    });

    return () => simulation.stop();
  }, [data, clusterBy]);

  useEffect(() => {
    const cleanup = render();
    const observer = new ResizeObserver(() => render());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      cleanup?.();
      observer.disconnect();
    };
  }, [render]);

  if (!data?.nodes?.length) {
    return (
      <div className={cn("flex items-center justify-center border-2 border-border bg-card p-8", className)}>
        <span className="text-[10px] font-[family-name:var(--font-pixel)] uppercase text-muted-foreground">
          No demographic data
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative w-full h-full min-h-[300px] border-2 border-border bg-[#0F380F] overflow-hidden", className)}>
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
