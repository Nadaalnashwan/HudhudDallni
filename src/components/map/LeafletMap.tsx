"use client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { CATEGORY_META } from "@/lib/catalog";
import type { MapProps } from "./MapView";
import { pinHtml } from "./pin";

export default function LeafletMap({ origin, stops, alternatives, path, selectedId, onSelect }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([origin.lat, origin.lng], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    L.circleMarker([origin.lat, origin.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#2f80ed", fillOpacity: 1 })
      .bindTooltip("موقعك")
      .addTo(g);
    if (path.length > 1) {
      L.polyline(path.map((p) => [p.lat, p.lng]), { color: "#fff", weight: 9, opacity: 0.9 }).addTo(g);
      L.polyline(path.map((p) => [p.lat, p.lng]), { color: "#12a189", weight: 5 }).addTo(g);
    }
    alternatives.forEach((p) => {
      L.marker([p.location.lat, p.location.lng], {
        icon: L.divIcon({ className: "hh-marker", html: pinHtml("•", "#94a3b8", p.id === selectedId, true), iconSize: [26, 26], iconAnchor: [13, 26] }),
      })
        .on("click", () => onSelectRef.current(p))
        .addTo(g);
    });
    stops.forEach((p, i) => {
      L.marker([p.location.lat, p.location.lng], {
        zIndexOffset: 1000,
        icon: L.divIcon({ className: "hh-marker", html: pinHtml(String(i + 1), CATEGORY_META[p.category].color, p.id === selectedId), iconSize: [36, 36], iconAnchor: [18, 36] }),
      })
        .bindTooltip(p.name, { direction: "top", offset: [0, -34] })
        .on("click", () => onSelectRef.current(p))
        .addTo(g);
    });
  }, [origin, stops, alternatives, path, selectedId]);

  // Refit only when the set of chosen stops changes, not on selection.
  const key = stops.map((s) => s.id).join("|") + alternatives.length;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pts = [origin, ...stops.map((s) => s.location), ...alternatives.map((a) => a.location)];
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 15 });
    else m.setView([origin.lat, origin.lng], 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, origin]);

  return <div ref={el} className="h-full w-full" />;
}
