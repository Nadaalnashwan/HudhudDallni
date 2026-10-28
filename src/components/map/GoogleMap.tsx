"use client";
import { AdvancedMarker, APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { CATEGORY_META } from "@/lib/catalog";
import type { LatLng } from "@/lib/types";
import type { MapProps } from "./MapView";
import { pinHtml } from "./pin";

function Pin({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function Overlay({ origin, stops, alternatives, path }: Pick<MapProps, "origin" | "stops" | "alternatives" | "path">) {
  const map = useMap();

  useEffect(() => {
    if (!map || path.length < 2) return;
    const casing = new google.maps.Polyline({ path, strokeColor: "#ffffff", strokeWeight: 9, map });
    const line = new google.maps.Polyline({ path, strokeColor: "#12a189", strokeWeight: 5, map });
    return () => {
      casing.setMap(null);
      line.setMap(null);
    };
  }, [map, path]);

  const key = stops.map((s) => s.id).join("|") + alternatives.length;
  useEffect(() => {
    if (!map) return;
    const pts: LatLng[] = [origin, ...stops.map((s) => s.location), ...alternatives.map((a) => a.location)];
    if (pts.length < 2) {
      map.setCenter(origin);
      return;
    }
    const b = new google.maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    map.fitBounds(b, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, origin]);

  return null;
}

export default function GoogleMap(props: MapProps) {
  const { origin, stops, alternatives, selectedId, onSelect } = props;
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY!} language="ar" region="SA">
      <Map
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID"}
        defaultCenter={origin}
        defaultZoom={12}
        disableDefaultUI
        gestureHandling="greedy"
        className="h-full w-full"
      >
        <AdvancedMarker position={origin} title="موقعك">
          <div className="size-4 rounded-full border-[3px] border-white bg-[#2f80ed] shadow" />
        </AdvancedMarker>
        {alternatives.map((p) => (
          <AdvancedMarker key={p.id} position={p.location} title={p.name} onClick={() => onSelect(p)}>
            <Pin html={pinHtml(CATEGORY_META[p.category].emoji, "#94a3b8", p.id === selectedId, true)} />
          </AdvancedMarker>
        ))}
        {stops.map((p, i) => (
          <AdvancedMarker key={p.id} position={p.location} title={p.name} onClick={() => onSelect(p)} zIndex={1000}>
            <Pin html={pinHtml(String(i + 1), CATEGORY_META[p.category].color, p.id === selectedId)} />
          </AdvancedMarker>
        ))}
        <Overlay {...props} />
      </Map>
    </APIProvider>
  );
}
