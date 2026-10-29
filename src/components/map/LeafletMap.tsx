"use client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { CATEGORY_META } from "@/lib/catalog";
import type { MapProps } from "./MapView";
import { CATEGORY_ICON_PATH } from "../icons";
import { altPinHtml, pinHtml, ROUTE_BLUE } from "./pin";

export default function LeafletMap({ origin, originLabel = "مكانك الحالي", stops, alternatives, path, selectedId, onSelect, fitKey, onMapClick }: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([origin.lat, origin.lng], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    map.current.on("click", (e: L.LeafletMouseEvent) => onMapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    // the container changes size when the assistant panel opens/closes — keep tiles and bounds correct
    const ro = new ResizeObserver(() => map.current?.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    L.circleMarker([origin.lat, origin.lng], { radius: 8, color: "#fff", weight: 3, fillColor: ROUTE_BLUE, fillOpacity: 1 })
      .bindTooltip(originLabel)
      .addTo(g);
    if (path.length > 1) {
      L.polyline(path.map((p) => [p.lat, p.lng]), { color: "#fff", weight: 9, opacity: 0.9 }).addTo(g);
      L.polyline(path.map((p) => [p.lat, p.lng]), { color: ROUTE_BLUE, weight: 5 }).addTo(g);
    }
    alternatives.forEach((p) => {
      L.marker([p.location.lat, p.location.lng], {
        icon: L.divIcon({ className: "hh-marker", html: altPinHtml(p.id === selectedId), iconSize: [18, 18], iconAnchor: [9, 9] }),
      })
        .on("click", () => onSelectRef.current(p))
        .addTo(g);
    });
    stops.forEach((p, i) => {
      L.marker([p.location.lat, p.location.lng], {
        zIndexOffset: 1000,
        icon: L.divIcon({ className: "hh-marker", html: pinHtml(CATEGORY_ICON_PATH[p.category], CATEGORY_META[p.category].color, p.id === selectedId, stops.length > 1 ? i + 1 : undefined), iconSize: [36, 44], iconAnchor: [18, 44] }),
      })
        .bindTooltip(p.name, { direction: "top", offset: [0, -42] })
        .on("click", () => onSelectRef.current(p))
        .addTo(g);
    });
  }, [origin, originLabel, stops, alternatives, path, selectedId]);

  useEffect(() => {
    el.current?.classList.toggle("cursor-crosshair", Boolean(onMapClick));
  }, [onMapClick]);

  // Refit only when the set of chosen stops changes, not on selection or live position updates.
  const key = fitKey ?? `${stops.map((s) => s.id).join("|")}${alternatives.length}@${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}`;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pts = [origin, ...stops.map((s) => s.location), ...alternatives.map((a) => a.location), ...(path.length > 1 ? [path[0], path[path.length - 1]] : [])];
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 15 });
    else m.setView([origin.lat, origin.lng], 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={el} className="h-full w-full" />;
}
