"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/utils";

interface LandscapeLabel {
  x: number;
  z: number;
  text: string;
}

interface Landscape3DData {
  grid: number[][];
  xSize: number;
  zSize: number;
  colorMap?: number[][][];
  labels?: LandscapeLabel[];
}

interface Landscape3DProps {
  data: Landscape3DData;
  className?: string;
}

const NES_GRADIENT = [
  new THREE.Color("#0F380F"),
  new THREE.Color("#306230"),
  new THREE.Color("#8BAC0F"),
  new THREE.Color("#9BBC0F"),
  new THREE.Color("#F8B800"),
  new THREE.Color("#E05038"),
];

function lerpNesColor(t: number): THREE.Color {
  const clamped = Math.max(0, Math.min(1, t));
  const segCount = NES_GRADIENT.length - 1;
  const segment = Math.min(Math.floor(clamped * segCount), segCount - 1);
  const local = clamped * segCount - segment;
  return NES_GRADIENT[segment].clone().lerp(NES_GRADIENT[segment + 1], local);
}

function Terrain({
  grid,
  xSize,
  zSize,
}: {
  grid: number[][];
  xSize: number;
  zSize: number;
}) {
  const { geometry } = useMemo(() => {
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    if (!rows || !cols) return { geometry: new THREE.BufferGeometry() };

    const geo = new THREE.PlaneGeometry(xSize, zSize, cols - 1, rows - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    let minH = Infinity;
    let maxH = -Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = grid[r][c];
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    const range = maxH - minH || 1;

    const colors = new Float32Array(pos.count * 3);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const h = grid[r][c];
        pos.setY(idx, h);
        const t = (h - minH) / range;
        const col = lerpNesColor(t);
        colors[idx * 3] = col.r;
        colors[idx * 3 + 1] = col.g;
        colors[idx * 3 + 2] = col.b;
      }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return { geometry: geo };
  }, [grid, xSize, zSize]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors flatShading />
    </mesh>
  );
}

function Labels({
  labels,
  grid,
  xSize,
  zSize,
}: {
  labels: LandscapeLabel[];
  grid: number[][];
  xSize: number;
  zSize: number;
}) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (!rows || !cols) return null;

  return (
    <>
      {labels.map((lbl, i) => {
        const r = Math.min(Math.max(Math.round(lbl.z), 0), rows - 1);
        const c = Math.min(Math.max(Math.round(lbl.x), 0), cols - 1);
        const h = grid[r]?.[c] ?? 0;
        const worldX = (c / (cols - 1) - 0.5) * xSize;
        const worldZ = (r / (rows - 1) - 0.5) * zSize;
        return (
          <Text
            key={i}
            position={[worldX, h + 0.5, worldZ]}
            fontSize={0.3}
            color="#E0F8D0"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.02}
            outlineColor="#0F380F"
          >
            {lbl.text}
          </Text>
        );
      })}
    </>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center size-full">
      <div className="flex flex-col items-center gap-3">
        <div className="relative size-8">
          <div className="absolute inset-0 border-2 border-primary animate-spin [animation-timing-function:steps(8)]" />
          <div className="absolute inset-1 bg-primary/20" />
        </div>
        <span className="font-[family-name:var(--font-pixel-body)] text-sm text-muted-foreground">
          LOADING 3D...
        </span>
      </div>
    </div>
  );
}

export function Landscape3D({ data, className }: Landscape3DProps) {
  const hasData =
    data.grid.length > 0 && (data.grid[0]?.length ?? 0) > 0;

  if (!hasData) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center border-2 border-border bg-card min-h-[320px]",
          className
        )}
      >
        <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
          NO TERRAIN DATA
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative border-2 border-border bg-[#0F380F] min-h-[320px]",
        className
      )}
    >
      <Suspense fallback={<LoadingFallback />}>
        <Canvas
          camera={{ position: [data.xSize * 0.8, data.xSize * 0.6, data.zSize * 0.8], fov: 50 }}
          style={{ width: "100%", height: "100%" }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 10, 5]} intensity={0.8} />
          <Terrain grid={data.grid} xSize={data.xSize} zSize={data.zSize} />
          {data.labels?.length ? (
            <Labels
              labels={data.labels}
              grid={data.grid}
              xSize={data.xSize}
              zSize={data.zSize}
            />
          ) : null}
          <OrbitControls enablePan enableZoom enableRotate />
        </Canvas>
      </Suspense>

      <div className="crt-scanline absolute inset-0 pointer-events-none" />
    </div>
  );
}
