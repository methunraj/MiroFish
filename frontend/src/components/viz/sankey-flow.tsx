"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import * as d3 from "d3";
import { sankey, sankeyLinkHorizontal, type SankeyNode, type SankeyLink } from "d3-sankey";
import { cn } from "@/lib/utils";

const DEFAULT_LINK_COLORS = ["#9BBC0F", "#5B8CF0", "#F8B800", "#E05038"];

export interface SankeyNodeDatum {
  id: string;
  name: string;
}

export interface SankeyLinkDatum {
  source: string;
  target: string;
  value: number;
  color?: string;
}

export interface SankeyFlowProps {
  data: { nodes: SankeyNodeDatum[]; links: SankeyLinkDatum[] } | null;
  className?: string;
}

type SNode = SankeyNode<SankeyNodeDatum, SankeyLinkDatum>;
type SLink = SankeyLink<SankeyNodeDatum, SankeyLinkDatum>;

export function SankeyFlow({ data, className }: SankeyFlowProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const render = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !data?.nodes?.length || !data?.links?.length) return;

    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const margin = { top: 16, right: 16, bottom: 16, left: 16 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const defs = svg.append("defs");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const nodeMap = new Map(data.nodes.map((n, i) => [n.id, i]));

    const sankeyGen = sankey<SankeyNodeDatum, SankeyLinkDatum>()
      .nodeId((d) => (d as SankeyNodeDatum).id)
      .nodeWidth(14)
      .nodePadding(10)
      .extent([[0, 0], [innerW, innerH]]);

    const graph = sankeyGen({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({
        ...l,
        source: nodeMap.get(l.source) ?? 0,
        target: nodeMap.get(l.target) ?? 0,
      })) as unknown as Array<SankeyLink<SankeyNodeDatum, SankeyLinkDatum>>,
    });

    graph.links.forEach((link, i) => {
      const sourceNode = link.source as SNode;
      const targetNode = link.target as SNode;
      const srcColor = (link as SankeyLinkDatum).color ?? DEFAULT_LINK_COLORS[i % DEFAULT_LINK_COLORS.length];
      const tgtColor = DEFAULT_LINK_COLORS[((nodeMap.get((targetNode as unknown as SankeyNodeDatum).id) ?? i) + 1) % DEFAULT_LINK_COLORS.length];

      const gradientId = `sankey-grad-${i}`;
      const gradient = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("gradientUnits", "userSpaceOnUse")
        .attr("x1", sourceNode.x1 ?? 0)
        .attr("x2", targetNode.x0 ?? 0);
      gradient.append("stop").attr("offset", "0%").attr("stop-color", srcColor).attr("stop-opacity", 0.6);
      gradient.append("stop").attr("offset", "100%").attr("stop-color", tgtColor).attr("stop-opacity", 0.6);
    });

    g.append("g")
      .selectAll("path")
      .data(graph.links)
      .join("path")
      .attr("d", sankeyLinkHorizontal())
      .attr("fill", "none")
      .attr("stroke", (_d, i) => `url(#sankey-grad-${i})`)
      .attr("stroke-width", (d) => Math.max(1, (d as SLink).width ?? 1))
      .attr("stroke-opacity", 0.7)
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => {
        const [x, y] = d3.pointer(event, container);
        const src = (d.source as SNode) as unknown as SankeyNodeDatum;
        const tgt = (d.target as SNode) as unknown as SankeyNodeDatum;
        setTooltip({ x, y: y - 10, text: `${src.name} → ${tgt.name}: ${d.value}` });
      })
      .on("mouseout", () => setTooltip(null));

    g.append("g")
      .selectAll("rect")
      .data(graph.nodes)
      .join("rect")
      .attr("x", (d) => (d as SNode).x0 ?? 0)
      .attr("y", (d) => (d as SNode).y0 ?? 0)
      .attr("width", (d) => ((d as SNode).x1 ?? 0) - ((d as SNode).x0 ?? 0))
      .attr("height", (d) => Math.max(1, ((d as SNode).y1 ?? 0) - ((d as SNode).y0 ?? 0)))
      .attr("fill", (_d, i) => DEFAULT_LINK_COLORS[i % DEFAULT_LINK_COLORS.length])
      .attr("stroke", "#E0F8D0")
      .attr("stroke-width", 2);

    g.append("g")
      .selectAll("text")
      .data(graph.nodes)
      .join("text")
      .attr("x", (d) => {
        const n = d as SNode;
        return ((n.x0 ?? 0) + (n.x1 ?? 0)) / 2 < innerW / 2
          ? (n.x1 ?? 0) + 6
          : (n.x0 ?? 0) - 6;
      })
      .attr("y", (d) => ((d as SNode).y0 ?? 0))
      .attr("dy", (d) => {
        const n = d as SNode;
        return ((n.y1 ?? 0) - (n.y0 ?? 0)) / 2 + 3;
      })
      .attr("text-anchor", (d) => {
        const n = d as SNode;
        return ((n.x0 ?? 0) + (n.x1 ?? 0)) / 2 < innerW / 2 ? "start" : "end";
      })
      .attr("font-size", "8px")
      .attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0")
      .text((d) => (d as unknown as SankeyNodeDatum).name);
  }, [data]);

  useEffect(() => {
    render();
    const observer = new ResizeObserver(() => render());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [render]);

  if (!data?.nodes?.length || !data?.links?.length) {
    return (
      <div className={cn("flex items-center justify-center border-2 border-border bg-card p-8", className)}>
        <span className="text-[10px] font-[family-name:var(--font-pixel)] uppercase text-muted-foreground">
          No flow data
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
