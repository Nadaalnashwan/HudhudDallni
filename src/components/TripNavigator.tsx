"use client";
import { Car, CircleAlert, Flag, FlaskConical, ListOrdered, LocateFixed, MapPin, Navigation, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DISTRICTS } from "@/lib/catalog";
import { formatKm, formatMinutes, haversineKm } from "@/lib/geo";
import type { LatLng, Place, RouteResult } from "@/lib/types";
import { Spinner } from "./ui";

type TripPhase = "locating" | "need_origin" | "routing" | "navigating" | "feedback" | "next_prompt" | "done";

type TripState = {
  stops: Place[]; // the user's requested order, one leg at a time
  index: number; // current destination
  planId?: string;
  phase: TripPhase;
  origin?: LatLng;
  originLabel: string;
  fromGps: boolean;
  userPos?: LatLng; // live position while navigating with GPS
  route?: RouteResult;
  message?: string;
};

const ARRIVED_M = 120;

const geoError = (e: GeolocationPositionError) =>
  e.code === e.PERMISSION_DENIED
    ? "ما سمحت بالوصول لموقعك."
    : e.code === e.TIMEOUT
      ? "تأخر تحديد موقعك."
      : "ما قدرنا نحدد موقعك.";

/** In-app basic navigation: real start point (GPS or manual), road route, live position. */
export function useTrip() {
  const [trip, setTrip] = useState<TripState | null>(null);
  const watchId = useRef<number | null>(null);

  const stopWatch = () => {
    if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
    watchId.current = null;
  };
  useEffect(() => stopWatch, []);

  const routeTo = useCallback(async (origin: LatLng, originLabel: string, fromGps: boolean, base: TripState) => {
    const dest = base.stops[base.index];
    setTrip({ ...base, phase: "routing", origin, originLabel, fromGps, userPos: fromGps ? origin : undefined, route: undefined, message: undefined });
    let route: RouteResult | undefined;
    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: [origin, dest.location], steps: true }),
      });
      if (res.ok) route = await res.json();
    } catch {}
    // no route at all → still navigate with a clearly-labelled straight line
    route ??= { path: [origin, dest.location], legs: [], distanceMeters: Math.round(haversineKm(origin, dest.location) * 1000), source: "straight_line", error: "network" };
    setTrip((t) => (t ? { ...t, phase: "navigating", route } : t));
    stopWatch();
    if (fromGps && navigator.geolocation)
      watchId.current = navigator.geolocation.watchPosition(
        (p) => setTrip((t) => (t ? { ...t, userPos: { lat: p.coords.latitude, lng: p.coords.longitude } } : t)),
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
  }, []);

  const locate = useCallback(
    (base: TripState) => {
      setTrip({ ...base, phase: "locating", message: undefined });
      if (!navigator.geolocation) return setTrip({ ...base, phase: "need_origin", message: "المتصفح ما يدعم تحديد الموقع." });
      navigator.geolocation.getCurrentPosition(
        (p) => routeTo({ lat: p.coords.latitude, lng: p.coords.longitude }, "موقعك الحالي", true, base),
        (e) => setTrip({ ...base, phase: "need_origin", message: geoError(e) }),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    },
    [routeTo],
  );

  const start = (stops: Place[], index = 0, planId?: string) =>
    locate({ stops, index, planId, phase: "locating", originLabel: "موقعك الحالي", fromGps: false });

  return {
    trip,
    start,
    retryGps: () => trip && locate(trip),
    setManualOrigin: (loc: LatLng, label: string) => trip && routeTo(loc, label, false, trip),
    /** "إنهاء الرحلة" → visit confirmation for the current stop. */
    end: () => {
      stopWatch();
      setTrip((t) => (t ? { ...t, phase: "feedback" } : t));
    },
    afterFeedback: () => setTrip((t) => (t ? { ...t, phase: t.index < t.stops.length - 1 ? "next_prompt" : "done" } : t)),
    /** Next leg starts where the user is (GPS) or from the stop they just finished. */
    next: () => {
      if (!trip) return;
      const prev = trip.stops[trip.index];
      const base = { ...trip, index: trip.index + 1 };
      if (trip.fromGps) locate(base);
      else routeTo(prev.location, prev.name, false, base);
    },
    finishOuting: () => setTrip((t) => (t ? { ...t, phase: "done" } : t)),
    clear: () => {
      stopWatch();
      setTrip(null);
    },
  };
}

type Api = ReturnType<typeof useTrip>;

export function TripPanel({ api, onCancel }: { api: Api; onCancel: () => void }) {
  const { trip } = api;
  const [showSteps, setShowSteps] = useState(false);
  if (!trip || trip.phase === "feedback" || trip.phase === "done") return null;
  const dest = trip.stops[trip.index];
  const multi = trip.stops.length > 1;
  const r = trip.route;
  const remaining = trip.userPos ? haversineKm(trip.userPos, dest.location) * 1000 : undefined;

  return (
    <div className="pointer-events-auto w-full space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">{multi ? `المحطة ${trip.index + 1} من ${trip.stops.length}` : "الوجهة"}</p>
          <p className="flex items-center gap-1.5 truncate font-bold">
            <MapPin className="size-4 shrink-0 text-brand-600" aria-hidden /> {dest.name}
          </p>
        </div>
        <button onClick={onCancel} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background" aria-label="إلغاء الرحلة">
          <X className="size-4" />
        </button>
      </div>
      {dest.isDemo && (
        <p className="flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-[11px] text-amber-900">
          <FlaskConical className="size-3 shrink-0" aria-hidden /> موقع تجريبي: إحداثيات هذا المكان مولّدة للعرض وليست لمنشأة حقيقية.
        </p>
      )}

      {(trip.phase === "locating" || trip.phase === "routing") && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> {trip.phase === "locating" ? "نحدد موقعك الحالي…" : "نحسب المسار على الطرق…"}
        </p>
      )}

      {trip.phase === "need_origin" && (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-1.5 text-red-600">
            <CircleAlert className="size-4 shrink-0" aria-hidden /> {trip.message}
          </p>
          <p>حدّد نقطة البداية يدوياً: <b>اضغط على الخريطة</b> أو اختر حي:</p>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && api.setManualOrigin(DISTRICTS[e.target.value], `حي ${e.target.value}`)}
            className="w-full rounded-xl border border-line bg-background px-3 py-2"
            aria-label="اختر حي البداية"
          >
            <option value="" disabled>
              اختر حي البداية
            </option>
            {Object.keys(DISTRICTS).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button onClick={api.retryGps} className="inline-flex items-center gap-1 text-brand-700">
            <RotateCw className="size-3.5" aria-hidden /> حاول تحديد موقعي مرة ثانية
          </button>
        </div>
      )}

      {trip.phase === "navigating" && r && (
        <div className="space-y-2 text-sm">
          <p className="text-xs text-muted">من: {trip.originLabel}</p>
          {r.source !== "straight_line" ? (
            <p className="flex items-center gap-1.5 font-semibold">
              <Car className="size-4 text-brand-600" aria-hidden /> {formatKm(r.distanceMeters / 1000)}
              {r.durationSeconds ? ` • ${formatMinutes(r.durationSeconds)} قيادة تقريباً` : ""}
              <span className="text-[11px] font-normal text-muted">({r.source === "osrm" ? "حسب OSRM / OpenStreetMap" : "حسب Google Routes"})</span>
            </p>
          ) : (
            <p className="flex items-start gap-1.5 rounded-lg bg-red-100 p-2 text-xs text-red-800">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              تعذّر حساب مسار على الطرق حالياً. الخط على الخريطة مسافة مباشرة ({formatKm(r.distanceMeters / 1000)}) وليست مسافة قيادة.
            </p>
          )}
          {remaining !== undefined && (
            <p className={remaining <= ARRIVED_M ? "font-semibold text-brand-700" : "text-xs text-muted"}>
              {remaining <= ARRIVED_M ? "يبدو إنك وصلت! اضغط «إنهاء الرحلة»." : `المسافة المباشرة المتبقية: ${formatKm(remaining / 1000)}`}
            </p>
          )}
          <p className="flex items-center gap-1 text-[11px] text-muted">
            <LocateFixed className="size-3" aria-hidden />
            {trip.fromGps ? "تتبع موقعك مفعّل أثناء الرحلة." : "نقطة البداية يدوية — بدون تتبع للموقع."}
          </p>
          {r.steps && r.steps.length > 0 && (
            <div>
              <button onClick={() => setShowSteps((v) => !v)} className="inline-flex items-center gap-1 text-xs text-brand-700">
                <ListOrdered className="size-3.5" aria-hidden /> {showSteps ? "إخفاء" : "عرض"} الإرشادات ({r.steps.length})
              </button>
              {showSteps && (
                <ol className="mt-1 max-h-36 list-inside list-decimal space-y-0.5 overflow-y-auto text-xs">
                  {r.steps.map((s, i) => (
                    <li key={i}>
                      {s.text} {s.distanceMeters > 0 && <span className="text-muted">({formatKm(s.distanceMeters / 1000)})</span>}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-1 text-[10px] text-muted">إرشادات أساسية فقط — ليست ملاحة صوتية تفصيلية خطوة بخطوة.</p>
            </div>
          )}
          <button onClick={api.end} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700">
            <Flag className="size-4" aria-hidden /> إنهاء الرحلة
          </button>
        </div>
      )}

      {trip.phase === "next_prompt" && (
        <div className="space-y-2 text-sm">
          <p>
            المحطة الجاية: <b>{trip.stops[trip.index + 1].name}</b>
          </p>
          <button onClick={api.next} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 font-semibold text-white hover:bg-brand-600">
            <Navigation className="size-4" aria-hidden /> ابدأ الرحلة للمحطة التالية
          </button>
          <button onClick={api.finishOuting} className="w-full rounded-xl border border-line py-2">
            أنهي الطلعة هنا
          </button>
        </div>
      )}
    </div>
  );
}
