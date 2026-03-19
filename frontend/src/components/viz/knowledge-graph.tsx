"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import * as d3 from "d3";
import { cn } from "@/lib/utils";

const NODE_COLORS: Record<string, string> = {
  default: "#9BBC0F",
  person: "#5B8CF0",
  event: "#F8B800",
  location: "#E05038",
  concept: "#9BBC0F",
  organization: "#5B8CF0",
  resource: "#F8B800",
  action: "#E05038",
};

const PALETTE = ["#9BBC0F", "#5B8CF0", "#F8B800", "#E05038"];

export interface KGNode {
  id: string;
  label: string;
  type: string;
  attributes?: Record<string, unknown>;
}

export interface KGEdge {
  source: string;
  target: string;
  label?: string;
  weight?: number;
}

export interface KnowledgeGraphProps {
  data: { nodes: KGNode[]; edges: KGEdge[] } | null;
  onNodeClick?: (node: KGNode) => void;
  className?: string;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: string;
  attributes?: Record<string, unknown>;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  label?: string;
  weight?: number;
}

function colorForType(type: string): string {
  if (NODE_COLORS[type]) return NODE_COLORS[type];
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function KnowledgeGraph({ data, onNodeClick, className }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

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

    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label,
      weight: e.weight ?? 1,
    }));

    const simulation = d3.forceSimulation<SimNode>(nodes)
      .force("link", d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(20));

    const link = g
      .append("g")
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", "#306230")
      .attr("stroke-width", (d) => Math.max(1, Math.min(4, (d.weight ?? 1) * 1.5)))
      .attr("stroke-opacity", 0.6);

    const node = g
      .append("g")
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 8)
      .attr("fill", (d) => colorForType(d.type))
      .attr("stroke", "#E0F8D0")
      .attr("stroke-width", 2)
      .style("cursor", "pointer");

    const label = g
      .append("g")
      .selectAll<SVGTextElement, SimNode>("text")
      .data(nodes)
      .join("text")
      .text((d) => d.label)
      .attr("font-size", "8px")
      .attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0")
      .attr("text-anchor", "middle")
      .attr("dy", -14)
      .style("pointer-events", "none");

    const drag = d3.drag<SVGCircleElement, SimNode>()
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
      setTooltip({ x, y: y - 10, label: d.label });
      d3.select(event.currentTarget as SVGCircleElement)
        .transition().duration(100)
        .attr("r", 11)
        .attr("stroke-width", 3);
    });

    node.on("mouseout", (event) => {
      setTooltip(null);
      d3.select(event.currentTarget as SVGCircleElement)
        .transition().duration(100)
        .attr("r", 8)
        .attr("stroke-width", 2);
    });

    node.on("click", (_event, d) => {
      onNodeClick?.({
        id: d.id,
        label: d.label,
        type: d.type,
        attributes: d.attributes,
      });
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!);
      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
    });

    return () => simulation.stop();
  }, [data, onNodeClick]);

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
          No graph data
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
          {tooltip.label}
        </div>
      )}
    </div>
  );
}
