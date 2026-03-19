"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import * as d3 from "d3";
import { cn } from "@/lib/utils";

const GROUP_COLORS = ["#9BBC0F", "#5B8CF0", "#F8B800", "#E05038"];

export interface AgentNode {
  id: string;
  name: string;
  portrait?: string;
  activity: number;
  group: string | number;
}

export interface AgentEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
  timestamp?: string | number;
}

export interface AgentNetworkGraphProps {
  data: { nodes: AgentNode[]; edges: AgentEdge[] } | null;
  isLive?: boolean;
  className?: string;
}

interface SimAgentNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  portrait?: string;
  activity: number;
  group: string | number;
}

interface SimAgentLink extends d3.SimulationLinkDatum<SimAgentNode> {
  weight: number;
  type: string;
  timestamp?: string | number;
  isNew?: boolean;
}

function groupColor(group: string | number): string {
  if (typeof group === "number") return GROUP_COLORS[group % GROUP_COLORS.length];
  let hash = 0;
  for (let i = 0; i < String(group).length; i++) hash = String(group).charCodeAt(i) + ((hash << 5) - hash);
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

export function AgentNetworkGraph({ data, isLive = false, className }: AgentNetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<SimAgentNode, SimAgentLink> | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null);

  const render = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !data?.nodes?.length) return;

    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const defs = svg.append("defs");
    const pulseFilter = defs.append("filter").attr("id", "glow-pulse");
    pulseFilter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    const merge = pulseFilter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    const groups = [...new Set(data.nodes.map((n) => String(n.group)))];

    const nodes: SimAgentNode[] = data.nodes.map((n) => ({ ...n }));
    const now = Date.now();
    const links: SimAgentLink[] = data.edges.map((e) => {
      const ts = e.timestamp ? new Date(e.timestamp).getTime() : 0;
      return {
        source: e.source,
        target: e.target,
        weight: e.weight,
        type: e.type,
        timestamp: e.timestamp,
        isNew: isLive && now - ts < 5000,
      };
    });

    const simulation = d3.forceSimulation<SimAgentNode>(nodes)
      .force("link", d3.forceLink<SimAgentNode, SimAgentLink>(links).id((d) => d.id).distance(100).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-250))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(18))
      .force("cluster", d3.forceX<SimAgentNode>((d) => {
        const gi = groups.indexOf(String(d.group));
        return width * 0.3 + (gi / Math.max(1, groups.length - 1)) * width * 0.4;
      }).strength(0.05))
      .force("clusterY", d3.forceY<SimAgentNode>((d) => {
        const gi = groups.indexOf(String(d.group));
        return height * 0.3 + (gi % 2) * height * 0.4;
      }).strength(0.05));

    simulationRef.current = simulation;

    const link = g
      .append("g")
      .selectAll<SVGLineElement, SimAgentLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => d.isNew ? "#9BBC0F" : "#306230")
      .attr("stroke-width", (d) => Math.max(1, Math.min(4, d.weight * 1.5)))
      .attr("stroke-opacity", (d) => d.isNew ? 1 : 0.4);

    if (isLive) {
      link.filter((d) => !!d.isNew)
        .attr("stroke-dasharray", "4 2")
        .each(function pulseEdge() {
          d3.select(this)
            .transition().duration(800).attr("stroke-opacity", 0.2)
            .transition().duration(800).attr("stroke-opacity", 1)
            .on("end", pulseEdge);
        });
    }

    const node = g
      .append("g")
      .selectAll<SVGCircleElement, SimAgentNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => 6 + Math.min(6, d.activity * 2))
      .attr("fill", (d) => groupColor(d.group))
      .attr("stroke", "#E0F8D0")
      .attr("stroke-width", 2)
      .style("cursor", "pointer");

    if (isLive) {
      node.filter((d) => d.activity > 0.5)
        .attr("filter", "url(#glow-pulse)")
        .each(function pulseNode() {
          const r = 6 + Math.min(6, (d3.select(this).datum() as SimAgentNode).activity * 2);
          d3.select(this)
            .transition().duration(600).attr("r", r + 3)
            .transition().duration(600).attr("r", r)
            .on("end", pulseNode);
        });
    }

    const label = g
      .append("g")
      .selectAll<SVGTextElement, SimAgentNode>("text")
      .data(nodes)
      .join("text")
      .text((d) => d.name)
      .attr("font-size", "7px")
      .attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => -(10 + Math.min(6, d.activity * 2)))
      .style("pointer-events", "none");

    const drag = d3.drag<SVGCircleElement, SimAgentNode>()
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
      setTooltip({ x, y: y - 10, name: d.name });
    });
    node.on("mouseout", () => setTooltip(null));

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimAgentNode).x!)
        .attr("y1", (d) => (d.source as SimAgentNode).y!)
        .attr("x2", (d) => (d.target as SimAgentNode).x!)
        .attr("y2", (d) => (d.target as SimAgentNode).y!);
      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
    });

    return () => simulation.stop();
  }, [data, isLive]);

  useEffect(() => {
    const cleanup = render();
    const observer = new ResizeObserver(() => render());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      cleanup?.();
      simulationRef.current?.stop();
      observer.disconnect();
    };
  }, [render]);

  if (!data?.nodes?.length) {
    return (
      <div className={cn("flex items-center justify-center border-2 border-border bg-card p-8", className)}>
        <span className="text-[10px] font-[family-name:var(--font-pixel)] uppercase text-muted-foreground">
          No agent data
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative w-full h-full min-h-[300px] border-2 border-border bg-[#0F380F] overflow-hidden", className)}>
      <svg ref={svgRef} className="block w-full h-full" />
      {isLive && (
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <span className="block h-2 w-2 bg-[#E05038] pixel-blink" />
          <span className="text-[7px] font-[family-name:var(--font-pixel)] uppercase text-[#E05038]">Live</span>
        </div>
      )}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 border-2 border-primary bg-card px-2 py-1 text-[8px] font-[family-name:var(--font-pixel)] uppercase text-primary shadow-[2px_2px_0px_var(--border)]"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.name}
        </div>
      )}
    </div>
  );
}
