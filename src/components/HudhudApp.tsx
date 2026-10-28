"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORY_META, DISTRICTS, TAG_LABELS } from "@/lib/catalog";
import { formatKm, RIYADH_CENTER } from "@/lib/geo";
import { DEFAULT_PREFS, loadLastPlan, loadPreferences, loadVisits, recordVisit, savePlan, savePreferences, saveVisits, storeMode } from "@/lib/store";
import type { AssistantResponse, Category, ChatMessage, LatLng, ParsedRequest, Place, Plan, PlaceTag, PlanStop, Preferences, Priority, StepSpec, Visit } from "@/lib/types";
import AssistantChat from "./AssistantChat";
import FeedbackFlow from "./FeedbackFlow";
import MapView from "./map/MapView";
import PlaceCard from "./PlaceCard";
import PlaceSheet from "./PlaceSheet";
import PlanPipeline from "./PlanPipeline";

const VISIT_DELAY_MS = 30 * 60 * 1000; // ask about a visit 30 min after the outing started
const uid = () => crypto.randomUUID();
const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "هلا والله! أنا مساعد هدهد الذكي 🐦\nقول لي وش ودك تسوي وأنا أدور لك الأماكن وأرتب طلعتك على الخريطة.",
};
const QUICK_CATEGORIES: { label: string; prompt: string }[] = [
  { label: "☕ كوفي", prompt: "أبي قهوة" },
  { label: "🍽️ مطاعم", prompt: "أبي مطعم" },
  { label: "🏋️ أندية", prompt: "أبي نادي" },
  { label: "🍰 حلا", prompt: "أبي حلا" },
  { label: "🌳 حدائق", prompt: "أبي ممشى" },
  { label: "🛍️ مولات", prompt: "أبي مول" },
];

type Origin = { loc: LatLng; label: string };
type BuildArgs = {
  steps: StepSpec[];
  origin: Origin;
  priority: Priority;
  tags: PlaceTag[];
  keep?: (Place | null)[];
  locked?: boolean[];
  excluded?: string[][];
};

export default function HudhudApp() {
  const [config, setConfig] = useState<{ places: string; ai: string } | null>(null);
  const [userOrigin, setUserOrigin] = useState<Origin>({ loc: RIYADH_CENTER, label: "موقعك" });
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [pending, setPending] = useState<Partial<ParsedRequest> | undefined>();
  const [tags, setTags] = useState<PlaceTag[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ place: Place; stopIndex: number } | null>(null);
  const [details, setDetails] = useState<Place | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [feedbackOn, setFeedbackOn] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [prefsOpen, setPrefsOpen] = useState(false);

  const say = (m: Omit<ChatMessage, "id">) => setMessages((x) => [...x, { id: uid(), ...m }]);

  // --- boot: config, saved prefs, a started outing waiting for feedback
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig).catch(() => {});
    loadPreferences().then(setPrefs);
    const last = loadLastPlan();
    if (last?.startedAt) setPlan(last);
    setVisits(loadVisits());
  }, []);

  const pendingVisit = visits.find((v) => v.status === "pending");
  const checkReturn = useCallback(() => {
    const last = loadLastPlan();
    if (pendingVisit && last?.startedAt && Date.now() - Date.parse(last.startedAt) > VISIT_DELAY_MS) setFeedbackOn(true);
  }, [pendingVisit]);
  useEffect(() => {
    checkReturn();
    const onVis = () => document.visibilityState === "visible" && checkReturn();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [checkReturn]);

  // --- planning
  const runPlan = async (a: BuildArgs, keepId?: string): Promise<Plan | null> => {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...a, origin: a.origin.loc, originLabel: a.origin.label, preferences: prefs }),
    });
    if (!res.ok) return null;
    const { stops, route } = (await res.json()) as { stops: PlanStop[]; route: Plan["route"] };
    if (!stops.length) return null;
    const next: Plan = { id: keepId ?? uid(), origin: a.origin.loc, originLabel: a.origin.label, priority: a.priority, stops, route };
    setPlan(next);
    setFocus(null);
    savePlan(next);
    return next;
  };

  const argsFrom = (p: Plan, steps = p.stops.map((s) => s.step)): BuildArgs => ({
    steps,
    origin: { loc: p.origin, label: p.originLabel },
    priority: p.priority,
    tags,
  });

  const prefsNote = () =>
    prefs.consent && prefs.likes.length ? `\n🧠 حطيت بالاعتبار تفضيلاتك: ${prefs.likes.map((t) => TAG_LABELS[t]).join("، ")}` : "";

  const describeNew = (p: Plan) => {
    if (p.stops.length === 1) {
      const s = p.stops[0];
      say({ role: "assistant", text: `أنسب خيار لك: ${s.place.name}\n💡 ${s.reason}${prefsNote()}\nوهذي بدائل لو حبيت تغيّر 👇`, places: [s.place, ...s.alternatives] });
    } else {
      const lines = p.stops.map((s, i) => `${i + 1}. ${CATEGORY_META[s.step.category].emoji} ${s.place.name}${i ? ` — ${formatKm(s.distanceFromPrevKm ?? 0)} عن ${s.anchorLabel}` : ""}`);
      say({ role: "assistant", text: `خطتك جاهزة ✨\n${lines.join("\n")}${prefsNote()}\nتقدر تغيّر أي محطة أو تثبّتها من البطاقات أو تقول لي مثلاً «غير الكوفي».` });
    }
  };

  const describeChange = (before: Plan, after: Plan, changedAt: number) => {
    const parts: string[] = [];
    after.stops.forEach((s, i) => {
      const label = "ال" + CATEGORY_META[s.step.category].label;
      if (before.stops[i]?.place.id === s.place.id) {
        if (i > changedAt)
          parts.push(s.locked ? `${label} مثبّت 📌 ما غيرته` : `${label} للحين الأنسب (${formatKm(s.distanceFromPrevKm ?? 0)} عن ${s.anchorLabel}) فخليته`);
        return;
      }
      parts.push(i === changedAt ? `غيّرت ${label} إلى ${s.place.name}` : `وعشان يكون قريب، اخترت ${label}: ${s.place.name} (${formatKm(s.distanceFromPrevKm ?? 0)} عن ${s.anchorLabel})`);
    });
    say({ role: "assistant", text: parts.length ? parts.join("\n") : "حدّثت الخطة.", places: after.stops.length === 1 ? [after.stops[0].place, ...after.stops[0].alternatives] : undefined });
  };

  /** Rebuild from index i: earlier stops and locked later stops stay; the rest re-anchor on the new chain. */
  const rebuildFrom = async (i: number, override: { place?: Place; exclude?: boolean }) => {
    if (!plan) return;
    setBusyIndex(i);
    const keep = plan.stops.map((s, j) => (j < i ? s.place : j === i ? override.place ?? null : s.locked ? s.place : null));
    const excluded = plan.stops.map((s, j) => (j === i && override.exclude ? [...s.excluded, s.place.id] : s.excluded));
    const next = await runPlan({ ...argsFrom(plan), keep, excluded, locked: plan.stops.map((s, j) => (j === i ? false : s.locked)) }, plan.id);
    setBusyIndex(null);
    if (next) describeChange(plan, next, i);
  };

  const replaceStop = (i: number) => {
    if (plan?.stops[i].locked) return say({ role: "assistant", text: "هالمحطة مثبّتة 📌 فك التثبيت أول عشان أغيّرها." });
    return rebuildFrom(i, { exclude: true });
  };

  const chooseAlternative = (place: Place) => {
    if (!plan) return;
    const i = focus?.stopIndex ?? plan.stops.findIndex((s) => s.step.category === place.category);
    if (i < 0) return addStep({ category: place.category, placeName: place.name }, place);
    return rebuildFrom(i, { place });
  };

  const toggleLock = (i: number, value?: boolean) => {
    if (!plan) return;
    const stops = plan.stops.map((s, j) => (j === i ? { ...s, locked: value ?? !s.locked } : s));
    const next = { ...plan, stops };
    setPlan(next);
    savePlan(next);
  };

  const removeStop = async (i: number) => {
    if (!plan || plan.stops.length < 2) return;
    setBusy(true);
    const rest = plan.stops.filter((_, j) => j !== i);
    const next = await runPlan(
      {
        ...argsFrom(plan, rest.map((s) => s.step)),
        keep: rest.map((s, j) => (j < i || s.locked ? s.place : null)),
        locked: rest.map((s) => s.locked),
        excluded: rest.map((s) => s.excluded),
      },
      plan.id,
    );
    setBusy(false);
    if (next) say({ role: "assistant", text: `شلت ${CATEGORY_META[plan.stops[i].step.category].label} من الخطة${i < rest.length ? " وحدّثت اللي بعده" : ""}.` });
  };

  const addStep = async (step: StepSpec, place?: Place) => {
    setBusy(true);
    const base = plan;
    const steps = [...(base?.stops.map((s) => s.step) ?? []), step];
    const next = await runPlan(
      {
        ...(base ? argsFrom(base, steps) : { steps, origin: userOrigin, priority: "balanced" as Priority, tags }),
        keep: [...(base?.stops.map((s) => s.place) ?? []), place ?? null],
        locked: [...(base?.stops.map((s) => s.locked) ?? []), false],
        excluded: [...(base?.stops.map((s) => s.excluded) ?? []), []],
      },
      base?.id,
    );
    setBusy(false);
    if (next) {
      const s = next.stops[next.stops.length - 1];
      say({ role: "assistant", text: `ضفت ${CATEGORY_META[s.step.category].label}: ${s.place.name} (${formatKm(s.distanceFromPrevKm ?? 0)} عن ${s.anchorLabel}).` });
    }
  };

  // --- chat
  const send = async (text: string) => {
    say({ role: "user", text });
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          context: { planSteps: plan?.stops.map((s) => ({ category: s.step.category, locked: s.locked })) ?? [], pending },
          preferences: prefs,
        }),
      });
      const out = (await res.json()) as AssistantResponse;
      const a = out.action;
      if (a.type === "clarify") {
        setPending(a.pending);
        say({ role: "assistant", text: a.question || out.reply, options: a.options });
      } else if (a.type === "plan") {
        setPending(undefined);
        say({ role: "assistant", text: out.reply });
        const req = a.request;
        setTags(req.tags);
        const origin = req.district && DISTRICTS[req.district] ? { loc: DISTRICTS[req.district], label: `حي ${req.district}` } : userOrigin;
        const steps = req.steps.map((s) => ({ ...s, tags: [...new Set([...(s.tags ?? []), ...req.tags])] }));
        setBusy(true);
        const p = await runPlan({ steps, origin, priority: req.priority ?? "balanced", tags: req.tags });
        if (p) describeNew(p);
        else say({ role: "assistant", text: "ما لقيت أماكن مناسبة 😔 جرب حي ثاني أو طلب مختلف." });
      } else if (a.type === "modify") {
        say({ role: "assistant", text: out.reply });
        if (a.op === "replace") await replaceStop(a.index);
        else if (a.op === "lock") toggleLock(a.index, true);
        else if (a.op === "unlock") toggleLock(a.index, false);
        else await removeStop(a.index);
      } else if (a.type === "add") {
        await addStep(a.step);
      } else {
        say({ role: "assistant", text: out.reply });
      }
    } catch {
      say({ role: "assistant", text: "صار خطأ بالاتصال، جرب مرة ثانية." });
    } finally {
      setBusy(false);
    }
  };

  // --- outing + post-visit feedback
  const startOuting = () => {
    if (!plan) return;
    const started = { ...plan, startedAt: new Date().toISOString() };
    setPlan(started);
    savePlan(started);
    const v: Visit[] = started.stops.map((s) => ({ placeId: s.place.id, placeName: s.place.name, category: s.step.category, planId: started.id, status: "pending" }));
    setVisits(v);
    saveVisits(v);
    say({ role: "assistant", text: "بالتوفيق في طلعتك! 🚗 فتحت لك المسار، ولما ترجع للتطبيق بسألك عن تجربتك." });
    const pts = started.stops.map((s) => `${s.place.location.lat},${s.place.location.lng}`);
    const url = `https://www.google.com/maps/dir/?api=1&origin=${plan.origin.lat},${plan.origin.lng}&destination=${pts[pts.length - 1]}&waypoints=${pts.slice(0, -1).join("|")}&travelmode=driving`;
    window.open(url, "_blank", "noopener");
  };

  const finishVisit = (status: Visit["status"], message?: string) => {
    if (!pendingVisit) return;
    const next = visits.map((v) => (v === pendingVisit ? { ...v, status } : v));
    setVisits(next);
    saveVisits(next);
    recordVisit({ ...pendingVisit, status });
    if (message) say({ role: "assistant", text: message });
    if (!next.some((v) => v.status === "pending")) setFeedbackOn(false);
  };

  const updatePrefs = (p: Preferences) => {
    setPrefs(p);
    savePreferences(p);
  };

  // --- map data
  const stopsOnMap = useMemo(() => plan?.stops.map((s) => s.place) ?? [], [plan]);
  const altsOnMap = useMemo(() => {
    if (!plan) return [];
    const i = focus?.stopIndex ?? (plan.stops.length === 1 ? 0 : -1);
    return i >= 0 ? plan.stops[i]?.alternatives ?? [] : [];
  }, [plan, focus]);
  const selectOnMap = (p: Place) => {
    if (!plan) return setFocus({ place: p, stopIndex: -1 });
    const idx = plan.stops.findIndex((s) => s.place.id === p.id);
    const altIdx = plan.stops.findIndex((s) => s.alternatives.some((a) => a.id === p.id));
    setFocus({ place: p, stopIndex: idx >= 0 ? idx : altIdx });
    setPanelOpen(false);
  };
  const focusedIsStop = focus && plan?.stops.some((s) => s.place.id === focus.place.id);
  const focusAnchor = plan && focus && focus.stopIndex > 0 ? plan.stops[focus.stopIndex - 1] : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      {/* Map */}
      <div className="absolute inset-0 md:left-0 md:right-[420px]">
        <MapView origin={plan?.origin ?? userOrigin.loc} stops={stopsOnMap} alternatives={altsOnMap} path={plan?.route?.path ?? []} selectedId={focus?.place.id} onSelect={selectOnMap} />
      </div>

      {/* Top bar (Hudhud-style search) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] space-y-2 p-3 md:right-[420px]">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-surface p-2 shadow-lg">
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand-500 text-lg text-white">🐦</div>
          <button onClick={() => setPanelOpen(true)} className="flex-1 text-right text-sm text-muted">
            وين ودك تروح اليوم؟
          </button>
          <button onClick={() => setPanelOpen(true)} className="rounded-xl bg-gradient-to-l from-brand-500 to-teal-400 px-3 py-1.5 text-sm font-medium text-white md:hidden">
            ✨ اسأل هدهد
          </button>
          <button onClick={() => setPrefsOpen(true)} className="flex size-9 items-center justify-center rounded-xl hover:bg-background" aria-label="تفضيلاتي">
            ⚙️
          </button>
        </div>
        <div className="pointer-events-auto flex gap-2 overflow-x-auto scrollbar-none">
          {QUICK_CATEGORIES.map((c) => (
            <button key={c.label} onClick={() => (setPanelOpen(true), send(c.prompt))} disabled={busy} className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-sm shadow">
              {c.label}
            </button>
          ))}
        </div>
        {config && (config.places === "demo" || config.ai === "rules") && (
          <div className="pointer-events-auto inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] text-amber-900 shadow">
            🧪 وضع تجريبي:{config.places === "demo" ? " أماكن تجريبية" : ""}
            {config.places === "demo" && config.ai === "rules" ? " •" : ""}
            {config.ai === "rules" ? " فهم الطلبات بقواعد محلية (بدون Groq)" : ""}
            {storeMode() === "local" ? " • الحفظ على الجهاز" : ""}
          </div>
        )}
      </div>

      {/* Locate me */}
      <button
        onClick={() =>
          navigator.geolocation?.getCurrentPosition(
            (pos) => setUserOrigin({ loc: { lat: pos.coords.latitude, lng: pos.coords.longitude }, label: "موقعك" }),
            () => say({ role: "assistant", text: "ما قدرت أوصل لموقعك، بستخدم وسط الرياض." }),
          )
        }
        className="absolute bottom-[calc(45dvh+12px)] left-3 z-[1000] flex size-11 items-center justify-center rounded-full bg-surface text-lg shadow-lg md:bottom-6"
        aria-label="موقعي"
      >
        ◎
      </button>

      {/* Selected place card on the map */}
      {focus && (
        <div className="absolute inset-x-3 bottom-[calc(45dvh+12px)] z-[1000] mx-auto max-w-sm md:bottom-6 md:right-[436px] md:left-auto md:w-80">
          <button onClick={() => setFocus(null)} className="absolute -top-3 left-2 z-10 flex size-7 items-center justify-center rounded-full bg-surface text-sm shadow" aria-label="إغلاق">
            ✕
          </button>
          <PlaceCard
            place={focus.place}
            from={focusAnchor?.place.location ?? plan?.origin}
            fromLabel={focusAnchor ? "ال" + CATEGORY_META[focusAnchor.step.category].label : plan?.originLabel}
            reason={plan?.stops.find((s) => s.place.id === focus.place.id)?.reason}
            badge={focusedIsStop ? `المحطة ${plan!.stops.findIndex((s) => s.place.id === focus.place.id) + 1}` : "بديل"}
            onDetails={() => setDetails(focus.place)}
            chooseLabel={focusedIsStop ? "🔄 غيّره" : "✓ اختره بداله"}
            onChoose={() => (focusedIsStop ? replaceStop(focus.stopIndex) : chooseAlternative(focus.place))}
          />
        </div>
      )}

      {/* Assistant panel: bottom sheet on mobile, side panel on desktop */}
      <aside
        className={`absolute inset-x-0 bottom-0 z-[1100] flex flex-col rounded-t-3xl bg-surface shadow-[0_-8px_30px_rgba(0,0,0,.12)] transition-[height] md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[420px] md:rounded-none ${
          panelOpen ? "h-[45dvh]" : "h-14"
        }`}
      >
        <button onClick={() => setPanelOpen((o) => !o)} className="flex items-center justify-between px-4 pb-2 pt-3 md:pointer-events-none">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-line md:hidden" />
        </button>
        <div className="flex items-center justify-between px-4 pb-2 max-md:-mt-2">
          <h2 className="font-bold">✨ مساعد هدهد الذكي</h2>
          {plan?.startedAt && pendingVisit && (
            <button onClick={() => setFeedbackOn(true)} className="rounded-full bg-amber-100 px-2 py-1 text-[11px] text-amber-900">
              ⏩ محاكاة الرجوع بعد الزيارة
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <AssistantChat
            messages={messages}
            busy={busy && busyIndex === null}
            chosenIds={stopsOnMap.map((p) => p.id)}
            from={plan?.origin ?? userOrigin.loc}
            fromLabel={plan?.originLabel ?? userOrigin.label}
            onSend={send}
            onChoose={chooseAlternative}
            onDetails={setDetails}
            onSelect={selectOnMap}
            header={
              plan && plan.stops.length > 0 ? (
                <div className="pb-1">
                  <PlanPipeline
                    plan={plan}
                    busyIndex={busyIndex}
                    selectedId={focus?.place.id}
                    onSelect={(i) => selectOnMap(plan.stops[i].place)}
                    onReplace={replaceStop}
                    onToggleLock={(i) => toggleLock(i)}
                    onRemove={removeStop}
                    onStart={startOuting}
                  />
                </div>
              ) : null
            }
          />
        </div>
      </aside>

      {details && (
        <PlaceSheet
          place={details}
          onClose={() => setDetails(null)}
          onAddToPlan={
            plan?.stops.some((s) => s.place.id === details.id)
              ? undefined
              : () => {
                  const p = details;
                  setDetails(null);
                  if (plan?.stops.some((s) => s.alternatives.some((a) => a.id === p.id))) chooseAlternative(p);
                  else addStep({ category: p.category as Category, placeName: p.name }, p);
                }
          }
        />
      )}

      {feedbackOn && pendingVisit && <FeedbackFlow key={pendingVisit.placeId} visit={pendingVisit} prefs={prefs} onFinish={finishVisit} onPrefs={updatePrefs} />}

      {prefsOpen && <PrefsSheet prefs={prefs} onChange={updatePrefs} onClose={() => setPrefsOpen(false)} />}
    </div>
  );
}

function PrefsSheet({ prefs, onChange, onClose }: { prefs: Preferences; onChange: (p: Preferences) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full space-y-3 rounded-t-3xl bg-surface p-5 md:max-w-md md:rounded-3xl">
        <h2 className="text-lg font-bold">🧠 تفضيلاتي</h2>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-background p-3 text-sm">
          <span>أسمح للمساعد يحفظ ملاحظاتي ويستخدمها في الاقتراحات</span>
          <input type="checkbox" checked={prefs.consent} onChange={(e) => onChange({ ...prefs, consent: e.target.checked })} className="size-5 accent-brand-500" />
        </label>
        <div className="space-y-1 text-sm">
          <p className="text-muted">أفضّل:</p>
          <p>{prefs.likes.length ? prefs.likes.map((t) => TAG_LABELS[t]).join("، ") : "لا شيء محفوظ بعد"}</p>
          {prefs.avoid.length > 0 && (
            <>
              <p className="pt-1 text-muted">أتجنب:</p>
              <p>{prefs.avoid.join("، ")}</p>
            </>
          )}
          {prefs.minRating && <p className="pt-1">أقل تقييم مفضّل: {prefs.minRating}</p>}
          {prefs.notes.length > 0 && (
            <>
              <p className="pt-1 text-muted">ملاحظاتي:</p>
              <ul className="list-inside list-disc">{prefs.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onChange({ ...DEFAULT_PREFS, consent: prefs.consent })} className="flex-1 rounded-xl border border-red-200 py-2 text-sm text-red-600">
            امسح تفضيلاتي
          </button>
          <button onClick={onClose} className="flex-1 rounded-xl bg-brand-500 py-2 text-sm text-white">
            تم
          </button>
        </div>
      </div>
    </div>
  );
}
