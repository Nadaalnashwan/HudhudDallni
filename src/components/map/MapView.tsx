"use client";
import dynamic from "next/dynamic";
import type { LatLng, Place } from "@/lib/types";

export type MapProps = {
  origin: LatLng;
  stops: Place[]; // chosen plan stops, numbered in order
  alternatives: Place[]; // secondary pins (other options)
  path: LatLng[];
  selectedId?: string;
  onSelect: (p: Place) => void;
};

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });
const GoogleMap = dynamic(() => import("./GoogleMap"), { ssr: false });

/** Google Maps when a browser key is configured, otherwise an OpenStreetMap fallback for Demo Mode. */
export default function MapView(props: MapProps) {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ? <GoogleMap {...props} /> : <LeafletMap {...props} />;
}
