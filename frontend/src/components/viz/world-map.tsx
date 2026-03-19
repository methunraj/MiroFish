"use client";

import { useMemo } from "react";
import Map, { Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { cn } from "@/lib/utils";

interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  value: number;
  color: string;
  group: string;
}

interface MapRegion {
  id: string;
  value: number;
  color: string;
}

interface WorldMapData {
  markers: MapMarker[];
  regions?: MapRegion[];
}

interface WorldMapProps {
  data: WorldMapData;
  className?: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

function PixelMarker({ marker }: { marker: MapMarker }) {
  return (
    <div className="group relative flex flex-col items-center">
      <div
        className="border-2 px-1.5 py-0.5 text-[8px] font-[family-name:var(--font-pixel)] leading-none shadow-[2px_2px_0px_rgba(0,0,0,0.6)] transition-transform group-hover:scale-110"
        style={{
          borderColor: marker.color,
          backgroundColor: `${marker.color}33`,
          color: marker.color,
        }}
      >
        {marker.value}
      </div>
      <div
        className="mt-0.5 text-[6px] font-[family-name:var(--font-pixel)] uppercase tracking-wider text-center whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: marker.color }}
      >
        {marker.label}
      </div>
    </div>
  );
}

export function WorldMap({ data, className }: WorldMapProps) {
  const bounds = useMemo(() => {
    if (!data.markers.length) return { latitude: 20, longitude: 0, zoom: 1.5 };
    const lats = data.markers.map((m) => m.lat);
    const lngs = data.markers.map((m) => m.lng);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      zoom: data.markers.length === 1 ? 4 : 1.5,
    };
  }, [data.markers]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center border-2 border-border bg-card min-h-[320px]",
          className
        )}
      >
        <div className="flex flex-col items-center gap-3 text-center p-8">
          <div className="size-12 border-2 border-dashed border-muted-foreground/40 flex items-center justify-center">
            <span className="text-lg text-muted-foreground/60">🗺</span>
          </div>
          <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-destructive">
            MAP REQUIRES MAPBOX TOKEN
          </span>
          <span className="text-xs text-muted-foreground max-w-xs">
            Set NEXT_PUBLIC_MAPBOX_TOKEN in your environment to enable the map.
          </span>
        </div>
      </div>
    );
  }

  if (!data.markers.length) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center border-2 border-border bg-card min-h-[320px]",
          className
        )}
      >
        <span className="font-[family-name:var(--font-pixel)] text-[10px] uppercase tracking-wider text-muted-foreground">
          NO MAP DATA
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative border-2 border-border overflow-hidden min-h-[320px]",
        className
      )}
    >
      <Map
        initialViewState={bounds}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        attributionControl={false}
      >
        {data.markers.map((marker, i) => (
          <Marker
            key={`${marker.label}-${i}`}
            latitude={marker.lat}
            longitude={marker.lng}
            anchor="bottom"
          >
            <PixelMarker marker={marker} />
          </Marker>
        ))}
      </Map>

      {/* CRT scanline overlay */}
      <div className="crt-scanline absolute inset-0 pointer-events-none" />
    </div>
  );
}
