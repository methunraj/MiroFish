"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import * as d3 from "d3";
import { cn } from "@/lib/utils";

const DEPTH_COLORS = ["#9BBC0F", "#5B8CF0", "#F8B800", "#E05038", "#8BAC0F"];

export interface TreeNode {
  id: string;
  label: string;
  parent?: string;
  depth: number;
  value: number;
}

export interface TreeLink {
  source: string;
  target: string;
}

export interface EvolutionTreeProps {
  data: { nodes: TreeNode[]; links: TreeLink[] } | null;
  className?: string;
}

interface HierarchyDatum {
  id: string;
  label: string;
  depth: number;
  value: number;
  children?: HierarchyDatum[];
}

function buildHierarchy(nodes: TreeNode[]): HierarchyDatum | null {
  const map = new Map<string, HierarchyDatum>();
  nodes.forEach((n) => map.set(n.id, { id: n.id, label: n.label, depth: n.depth, value: n.value, children: [] }));

  let root: HierarchyDatum | null = null;
  nodes.forEach((n) => {
    const datum = map.get(n.id)!;
    if (n.parent && map.has(n.parent)) {
      map.get(n.parent)!.children!.push(datum);
    } else {
      root = datum;
    }
  });

  if (!root && map.size > 0) {
    root = map.values().next().value ?? null;
  }

  return root;
}

export function EvolutionTree({ data, className }: EvolutionTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const render = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !data?.nodes?.length) return;

    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const margin = { top: 24, right: 24, bottom: 24, left: 24 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    const rootData = buildHierarchy(data.nodes);
    if (!rootData) return;

    const hierarchy = d3.hierarchy<HierarchyDatum>(rootData);
    const treeLayout = d3.tree<HierarchyDatum>().size([innerH, innerW]);
    const treeData = treeLayout(hierarchy);

    // Links
    g.append("g")
      .selectAll("path")
      .data(treeData.links())
      .join("path")
      .attr("d", (d) => {
        return `M${d.source.y},${d.source.x}
                C${(d.source.y + d.target.y) / 2},${d.source.x}
                 ${(d.source.y + d.target.y) / 2},${d.target.x}
                 ${d.target.y},${d.target.x}`;
      })
      .attr("fill", "none")
      .attr("stroke", "#306230")
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.6);

    // Nodes
    const nodeGroup = g.append("g")
      .selectAll<SVGGElement, d3.HierarchyPointNode<HierarchyDatum>>("g")
      .data(treeData.descendants())
      .join("g")
      .attr("transform", (d) => `translate(${d.y},${d.x})`);

    nodeGroup.append("circle")
      .attr("r", (d) => 4 + Math.min(6, d.data.value * 0.5))
      .attr("fill", (d) => DEPTH_COLORS[d.depth % DEPTH_COLORS.length])
      .attr("stroke", "#E0F8D0")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => {
        const [x, y] = d3.pointer(event, container);
        setTooltip({ x, y: y - 10, text: `${d.data.label} (val: ${d.data.value})` });
        d3.select(event.currentTarget as SVGCircleElement)
          .transition().duration(100)
          .attr("stroke-width", 3);
      })
      .on("mouseout", (event) => {
        setTooltip(null);
        d3.select(event.currentTarget as SVGCircleElement)
          .transition().duration(100)
          .attr("stroke-width", 2);
      });

    nodeGroup.append("text")
      .attr("dy", "0.31em")
      .attr("x", (d) => d.children ? -10 : 10)
      .attr("text-anchor", (d) => d.children ? "end" : "start")
      .attr("font-size", "7px")
      .attr("font-family", "var(--font-pixel), monospace")
      .attr("fill", "#E0F8D0")
      .style("pointer-events", "none")
      .text((d) => d.data.label);
  }, [data]);

  useEffect(() => {
    render();
    const observer = new ResizeObserver(() => render());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [render]);

  if (!data?.nodes?.length) {
    return (
      <div className={cn("flex items-center justify-center border-2 border-border bg-card p-8", className)}>
        <span className="text-[10px] font-[family-name:var(--font-pixel)] uppercase text-muted-foreground">
          No tree data
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
