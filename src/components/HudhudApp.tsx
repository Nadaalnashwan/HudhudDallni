"use client";
import { Bird, Brain, Check, Database, FastForward, FlaskConical, LocateFixed, Settings, Sparkles, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORY_META, DISTRICTS, SUBCATEGORY_META, subcategoriesOf, TAG_LABELS } from "@/lib/catalog";
import { mergePreferences } from "@/lib/feedback";
import { formatKm, RIYADH_CENTER } from "@/lib/geo";
import { clearPreferences, DEFAULT_PREFS, loadLastPlan, loadPreferences, loadVisits, savePlan, savePreferences, saveVisits, storeStatus, type StoreStatus } from "@/lib/store";
import type { AssistantResponse, Category, ChatMessage, LatLng, ParsedRequest, Place, Plan, PlaceTag, PlanStop, Preferences, Priority, StepSpec, Subcategory, Visit } from "@/lib/types";
import AssistantChat from "./AssistantChat";
import { CategoryIcon } from "./icons";
import FeedbackFlow from "./FeedbackFlow";
import MapView from "./map/MapView";
import PlaceCard from "./PlaceCard";
import PlaceSheet from "./PlaceSheet";
import PlanPipeline from "./PlanPipeline";
import { typeLabel } from "./ui";

const VISIT_DELAY_MS = 30 * 60 * 1000; // ask about a visit 30 min after the outing started
const uid = () => crypto.randomUUID();
const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "هلا والله! أنا مساعد هدهد الذكي.\nقول لي وش ودك تسوي وأنا أدور لك الأماكن وأرتب طلعتك على الخريطة.",
};
const QUICK_CATEGORIES: Category[] = ["cafe", "restaurant", "gym", "dessert", "park", "mall", "entertainment"];

type Config = { places: Place["source"]; placesCount?: number; dbError?: string; ai: "gemini" | "rules"; aiModel?: string };
type RebuildOpts = { place?: Place; exclude?: boolean; step?: Partial<StepSpec>; nearer?: boolean; onlyThis?: boolean };

type Origin = { loc: LatLng; label: string };
type BuildArgs = {
  steps: StepSpec[];
  origin: Origin;
  district?: string;
  priority: Priority;
  tags: PlaceTag[];
  keep?: (Place | null)[];
  locked?: boolean[];
  excluded?: string[][];
  nearest?: boolean[];
};

export default function HudhudApp() {
  const [config, setConfig] = useState<Config | null>(null);
  const [store, setStore] = useState<StoreStatus | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
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
  const [quotaNoticeShown, setQuotaNoticeShown] = useState(false);

  const say = (m: Omit<ChatMessage, "id">) => setMessages((x) => [...x, { id: uid(), ...m }]);

  // --- boot: config, saved prefs, a started outing waiting for feedback
  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig).catch(() => {});
    loadPreferences().then(setPrefs);
    storeStatus().then(setStore);
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
  /** Calls the planner; surfaces database failures instead of silently swapping data sources. */
  const runPlan = async (a: BuildArgs, keepId?: string): Promise<Plan | null> => {
    let res: Response;
    try {
      res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...a, origin: a.origin.loc, originLabel: a.origin.label, preferences: prefs }),
      });
    } catch {
      say({ role: "assistant", text: "صار خطأ بالاتصال، جرب مرة ثانية." });
      return null;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      say({
        role: "assistant",
        text:
          err.error === "database_unavailable"
            ? "تعذر الاتصال بقاعدة بيانات الأماكن حالياً، فما أقدر أقترح أماكن الحين. جرب بعد شوي."
            : "صار خطأ أثناء تجهيز الخطة، جرب مرة ثانية.",
      });
      return null;
    }
    const { stops, route } = (await res.json()) as { stops: PlanStop[]; route: Plan["route"] };
    if (!stops.length) {
      say({ role: "assistant", text: "ما لقيت أماكن مطابقة لطلبك في البيانات. جرب نوع أو حي ثاني." });
      return null;
    }
    const next: Plan = { id: keepId ?? uid(), origin: a.origin.loc, originLabel: a.origin.label, district: a.district, priority: a.priority, stops, route };
    setPlan(next);
    setFocus(null);
    savePlan(next);
    return next;
  };

  const argsFrom = (p: Plan, steps = p.stops.map((s) => s.step)): BuildArgs => ({
    steps,
    origin: { loc: p.origin, label: p.originLabel },
    district: p.district,
    priority: p.priority,
    tags,
  });

  const prefsNote = () => {
    if (!prefs.consent) return "";
    const items = [...prefs.likes.map((t) => TAG_LABELS[t]), ...[...prefs.cuisines, ...prefs.cafeTypes].map((s) => SUBCATEGORY_META[s].label)];
    return items.length ? `\nحطيت بالاعتبار تفضيلاتك المحفوظة: ${[...new Set(items)].join("، ")}` : "";
  };

  const describeNew = (p: Plan) => {
    if (p.stops.length === 1) {
      const s = p.stops[0];
      say({ role: "assistant", text: `أنسب خيار لك: ${s.place.name}\n${s.reason}${prefsNote()}\nوهذي بدائل لو حبيت تغيّر:`, places: [s.place, ...s.alternatives] });
    } else {
      const lines = p.stops.map((s, i) => `${i + 1}. ${typeLabel(s.step)}: ${s.place.name}${i ? ` — ${formatKm(s.distanceFromPrevKm ?? 0)} بخط مستقيم عن ${s.anchorLabel}` : ""}`);
      say({ role: "assistant", text: `خطتك جاهزة:\n${lines.join("\n")}${prefsNote()}\nتقدر تغيّر أي محطة أو تثبّتها من البطاقات أو تقول لي مثلاً «غير الكوفي» أو «خل المطعم إيطالي».` });
    }
  };

  const describeChange = (before: Plan, after: Plan, changedAt: number) => {
    const parts: string[] = [];
    after.stops.forEach((s, i) => {
      const label = "ال" + CATEGORY_META[s.step.category].label;
      if (before.stops[i]?.place.id === s.place.id) {
        if (i > changedAt)
          parts.push(s.locked ? `${label} مثبّت فما غيرته` : `${label} للحين الأنسب (${formatKm(s.distanceFromPrevKm ?? 0)} عن ${s.anchorLabel}) فخليته`);
        return;
      }
      const swapped = before.stops[i] && before.stops[i].step.category !== s.step.category;
      parts.push(i === changedAt ? (swapped ? `حطيت ${typeLabel(s.step)} بدال ${"ال" + CATEGORY_META[before.stops[i].step.category].label}: ${s.place.name}` : `غيّرت ${label} إلى ${s.place.name}`) : `وعشان يكون قريب، اخترت ${label}: ${s.place.name} (${formatKm(s.distanceFromPrevKm ?? 0)} عن ${s.anchorLabel})`);
    });
    say({ role: "assistant", text: parts.length ? parts.join("\n") : "حدّثت الخطة.", places: after.stops.length === 1 ? [after.stops[0].place, ...after.stops[0].alternatives] : undefined });
  };

  /** Rebuild from index i: earlier stops and locked later stops stay; the rest re-anchor on the new chain. */
  const rebuildFrom = async (i: number, o: RebuildOpts) => {
    if (!plan || busyIndex !== null) return; // one plan update at a time
    setBusyIndex(i);
    // "بس" keeps everything after the changed stop; otherwise only locked stops survive.
    const keep = plan.stops.map((s, j) => (j < i ? s.place : j === i ? o.place ?? null : s.locked || o.onlyThis ? s.place : null));
    const excluded = plan.stops.map((s, j) => (j === i && o.exclude ? [...s.excluded, s.place.id] : s.excluded));
    const steps = plan.stops.map((s, j) => (j === i && o.step ? { ...s.step, ...o.step } : s.step));
    const next = await runPlan(
      {
        ...argsFrom(plan, steps),
        keep,
        excluded,
        locked: plan.stops.map((s, j) => (j === i ? false : s.locked)),
        nearest: plan.stops.map((_, j) => j === i && Boolean(o.nearer)),
      },
      plan.id,
    );
    setBusyIndex(null);
    if (next) describeChange(plan, next, i);
  };

  const replaceStop = (i: number, o: Omit<RebuildOpts, "place"> = {}) => {
    if (plan?.stops[i].locked) return say({ role: "assistant", text: "هالمحطة مثبّتة. فك التثبيت أول عشان أغيّرها." });
    // A new type is a new search; only a plain "غير" excludes the current pick.
    return rebuildFrom(i, { exclude: !o.step, ...o });
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
    if (next) say({ role: "assistant", text: `شلت ${typeLabel(plan.stops[i].step)} من الخطة${i < rest.length ? " وحدّثت اللي بعده" : ""}.` });
  };

  /** Inserts a stop after `after` (default: at the end). Stops after it re-anchor unless locked. */
  const addStep = async (step: StepSpec, place?: Place, after?: number) => {
    setBusy(true);
    const base = plan?.stops ?? [];
    const at = after === undefined ? base.length : after + 1;
    const insert = <T,>(list: T[], v: T) => [...list.slice(0, at), v, ...list.slice(at)];
    const next = await runPlan(
      {
        ...(plan ? argsFrom(plan, insert(base.map((s) => s.step), step)) : { steps: [step], origin: userOrigin, priority: defaultPriority(), tags }),
        keep: insert(base.map((s, j) => (j < at || s.locked ? s.place : null)), place ?? null),
        locked: insert(base.map((s) => s.locked), false),
        excluded: insert(base.map((s) => s.excluded), []),
      },
      plan?.id,
    );
    setBusy(false);
    if (next) {
      const s = next.stops[Math.min(at, next.stops.length - 1)];
      say({ role: "assistant", text: `ضفت ${typeLabel(s.step)}: ${s.place.name} (${formatKm(s.distanceFromPrevKm ?? 0)} بخط مستقيم عن ${s.anchorLabel}).` });
    }
  };

  /** Stable tastes Gemini heard in chat are saved only if the user allowed learning. */
  const applyLearned = (u: AssistantResponse["learned"]) => {
    if (!u) return;
    const items = [...(u.likes ?? []).map((t) => TAG_LABELS[t]), ...[...(u.cuisines ?? []), ...(u.cafeTypes ?? [])].map((x) => SUBCATEGORY_META[x].label), ...(u.neighborhoods ?? []), ...(u.avoid ?? []).map((a) => `تتجنب ${a}`)];
    if (u.budget === "low") items.push("ميزانية اقتصادية");
    if (u.distance) items.push(u.distance === "distance" ? "تفضّل الأقرب" : "تفضّل الأعلى تقييماً");
    if (!items.length) return;
    if (prefs.consent) {
      updatePrefs(mergePreferences(prefs, u));
      say({ role: "assistant", text: `سجّلت تفضيلك: ${items.join("، ")}. تقدر تشوفه أو تمسحه من الإعدادات.` });
    } else {
      say({ role: "assistant", text: `لاحظت إنك ذكرت: ${items.join("، ")}. إذا تبيني أتذكره للمرات الجاية فعّل حفظ التفضيلات من الإعدادات.` });
    }
  };

  /** A learned distance/rating preference applies only when the user didn't state one. */
  const defaultPriority = (stated?: Priority): Priority =>
    stated && stated !== "balanced" ? stated : prefs.consent && prefs.distance ? prefs.distance : stated ?? "balanced";

  /** Category chips and subcategory filters: a direct, filtered database query (no chat round-trip). */
  const browse = async (category: Category, subcategory?: Subcategory) => {
    setActiveCategory(category);
    setPanelOpen(true);
    setPending(undefined);
    say({ role: "user", text: subcategory ? `${CATEGORY_META[category].plural}: ${SUBCATEGORY_META[subcategory].label}` : CATEGORY_META[category].plural });
    setBusy(true);
    const keepArea = plan && plan.stops.length === 1 ? { loc: plan.origin, label: plan.originLabel, district: plan.district } : null;
    const p = await runPlan({
      steps: [{ category, subcategory }],
      origin: keepArea ? { loc: keepArea.loc, label: keepArea.label } : userOrigin,
      district: keepArea?.district,
      priority: defaultPriority(plan?.priority),
      tags: [],
    });
    setBusy(false);
    if (p) describeNew(p);
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
          context: { planSteps: plan?.stops.map((s) => ({ category: s.step.category, subcategory: s.step.subcategory, locked: s.locked })) ?? [], pending },
          preferences: prefs,
        }),
      });
      const out = (await res.json()) as AssistantResponse;
      const a = out.action;
      if (out.fallback === "quota" && !quotaNoticeShown) {
        setQuotaNoticeShown(true);
        say({ role: "assistant", text: "خدمة Gemini وصلت حدّها حالياً، فبكمل بالفهم المحلي لين ترجع." });
      }
      applyLearned(out.learned);
      if (a.type === "clarify") {
        setPending(a.pending);
        say({ role: "assistant", text: a.question || out.reply, options: a.options });
      } else if (a.type === "plan") {
        setPending(undefined);
        say({ role: "assistant", text: out.reply });
        const req = a.request;
        setTags(req.tags);
        const district = req.district && DISTRICTS[req.district] ? req.district : undefined;
        const origin = district ? { loc: DISTRICTS[district], label: `حي ${district}` } : userOrigin;
        const steps = req.steps.map((s) => ({ ...s, tags: [...new Set([...(s.tags ?? []), ...req.tags])] }));
        setActiveCategory(steps.length === 1 ? steps[0].category : null);
        setBusy(true);
        const p = await runPlan({ steps, origin, district, priority: defaultPriority(req.priority), tags: req.tags });
        if (p) describeNew(p);
      } else if (a.type === "modify") {
        say({ role: "assistant", text: out.reply });
        if (a.op === "replace") await replaceStop(a.index, { step: a.step, nearer: a.nearer, onlyThis: a.onlyThis });
        else if (a.op === "lock") toggleLock(a.index, true);
        else if (a.op === "unlock") toggleLock(a.index, false);
        else await removeStop(a.index);
      } else if (a.type === "add") {
        await addStep(a.step, undefined, a.after);
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
    const v: Visit[] = started.stops.map((s) => ({
      placeId: s.place.id,
      placeName: s.place.name,
      category: s.step.category,
      subcategory: s.place.subcategory,
      district: s.place.district,
      source: s.place.source,
      planId: started.id,
      status: "pending",
    }));
    setVisits(v);
    saveVisits(v);
    say({ role: "assistant", text: "بالتوفيق في طلعتك! المسار على الخريطة، ولما ترجع للتطبيق بسألك عن تجربتك." });
  };

  const finishVisit = (status: Visit["status"], message?: string) => {
    if (!pendingVisit) return;
    const next = visits.map((v) => (v === pendingVisit ? { ...v, status } : v));
    setVisits(next);
    saveVisits(next);
    if (message) say({ role: "assistant", text: message });
    if (!next.some((v) => v.status === "pending")) setFeedbackOn(false);
  };

  const updatePrefs = (p: Preferences) => {
    setPrefs(p);
    savePreferences(p);
  };
  const resetPrefs = () => {
    setPrefs({ ...DEFAULT_PREFS, consent: prefs.consent });
    clearPreferences();
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
          <div className="flex size-9 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Bird className="size-5" aria-hidden />
          </div>
          <button onClick={() => setPanelOpen(true)} className="flex-1 text-right text-sm text-muted">
            وين ودك تروح اليوم؟
          </button>
          <button onClick={() => setPanelOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-l from-brand-500 to-teal-400 px-3 py-1.5 text-sm font-medium text-white md:hidden">
            <Sparkles className="size-4" aria-hidden /> اسأل هدهد
          </button>
          <button onClick={() => setPrefsOpen(true)} className="flex size-9 items-center justify-center rounded-xl text-muted hover:bg-background" aria-label="تفضيلاتي">
            <Settings className="size-5" />
          </button>
        </div>
        <div className="pointer-events-auto flex gap-2 overflow-x-auto scrollbar-none">
          {QUICK_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => browse(c)}
              disabled={busy}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm shadow ${activeCategory === c ? "bg-brand-500 text-white" : "bg-surface"}`}
            >
              <CategoryIcon category={c} className="size-4" /> {CATEGORY_META[c].plural}
            </button>
          ))}
        </div>
        {activeCategory && subcategoriesOf(activeCategory).length > 1 && (
          <div className="pointer-events-auto flex gap-1.5 overflow-x-auto scrollbar-none">
            {[undefined, ...subcategoriesOf(activeCategory)].map((sub) => {
              const current = plan?.stops.length === 1 ? plan.stops[0].step : undefined;
              const on = current?.category === activeCategory && current.subcategory === sub;
              return (
                <button
                  key={sub ?? "all"}
                  onClick={() => browse(activeCategory, sub)}
                  disabled={busy}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs shadow-sm ${on ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-line bg-surface"}`}
                >
                  {sub ? SUBCATEGORY_META[sub].label : "الكل"}
                </button>
              );
            })}
          </div>
        )}
        {config && <SourceBanner config={config} store={store} />}
      </div>

      {/* Locate me */}
      <button
        onClick={() =>
          navigator.geolocation?.getCurrentPosition(
            (pos) => setUserOrigin({ loc: { lat: pos.coords.latitude, lng: pos.coords.longitude }, label: "موقعك" }),
            () => say({ role: "assistant", text: "ما قدرت أوصل لموقعك، بستخدم وسط الرياض." }),
          )
        }
        className="absolute bottom-[calc(45dvh+12px)] left-3 z-[1000] flex size-11 items-center justify-center rounded-full bg-surface shadow-lg md:bottom-6"
        aria-label="موقعي"
      >
        <LocateFixed className="size-5 text-brand-600" />
      </button>

      {/* Selected place card on the map */}
      {focus && (
        <div className="absolute inset-x-3 bottom-[calc(45dvh+12px)] z-[1000] mx-auto max-w-sm md:bottom-6 md:right-[436px] md:left-auto md:w-80">
          <button onClick={() => setFocus(null)} className="absolute -top-3 left-2 z-10 flex size-7 items-center justify-center rounded-full bg-surface shadow" aria-label="إغلاق">
            <X className="size-4" />
          </button>
          <PlaceCard
            place={focus.place}
            from={focusAnchor?.place.location ?? plan?.origin}
            fromLabel={focusAnchor ? "ال" + CATEGORY_META[focusAnchor.step.category].label : plan?.originLabel}
            reason={plan?.stops.find((s) => s.place.id === focus.place.id)?.reason}
            badge={focusedIsStop ? `المحطة ${plan!.stops.findIndex((s) => s.place.id === focus.place.id) + 1}` : "بديل"}
            onDetails={() => setDetails(focus.place)}
            chooseLabel={focusedIsStop ? "غيّره" : "اختره بداله"}
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
          <h2 className="inline-flex items-center gap-1.5 font-bold">
            <Sparkles className="size-4 text-brand-600" aria-hidden /> مساعد هدهد الذكي
          </h2>
          {plan?.startedAt && pendingVisit && (
            <button onClick={() => setFeedbackOn(true)} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] text-amber-900">
              <FastForward className="size-3" aria-hidden /> محاكاة الرجوع بعد الزيارة
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <AssistantChat
            messages={messages}
            busy={busy && busyIndex === null}
            disabled={busy || busyIndex !== null}
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

      {prefsOpen && <PrefsSheet prefs={prefs} store={store} onChange={updatePrefs} onClear={resetPrefs} onClose={() => setPrefsOpen(false)} />}
    </div>
  );
}

/** Always tells the user which data they are looking at, and when something is down. */
function SourceBanner({ config, store }: { config: Config; store: StoreStatus | null }) {
  const pill = "pointer-events-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] shadow";
  return (
    <div className="flex flex-wrap gap-1.5">
      {config.places === "supabase" && config.dbError && (
        <span className={`${pill} bg-red-100 text-red-800`}>
          <TriangleAlert className="size-3" aria-hidden /> تعذر الاتصال بقاعدة البيانات
        </span>
      )}
      {config.places === "supabase" && !config.dbError && (
        <span className={`${pill} bg-surface text-muted`}>
          <Database className="size-3" aria-hidden /> {config.placesCount?.toLocaleString("ar-SA")} مكان تجريبي من قاعدة البيانات
        </span>
      )}
      {config.places === "demo" && (
        <span className={`${pill} bg-amber-100 text-amber-900`}>
          <FlaskConical className="size-3" aria-hidden /> بيانات محلية تجريبية (قاعدة البيانات غير مهيأة)
        </span>
      )}
      {config.ai === "gemini" && (
        <span className={`${pill} bg-surface text-muted`}>
          <Sparkles className="size-3" aria-hidden /> فهم الطلبات: Gemini
        </span>
      )}
      {config.ai === "rules" && (
        <span className={`${pill} bg-surface text-muted`}>
          <Brain className="size-3" aria-hidden /> فهم الطلبات بقواعد محلية (Gemini غير مفعّل)
        </span>
      )}
      {store?.mode === "local" && (
        <span className={`${pill} bg-amber-100 text-amber-900`} title={store.reason}>
          <FlaskConical className="size-3" aria-hidden /> التقييمات والتفضيلات محفوظة على الجهاز
        </span>
      )}
    </div>
  );
}

function PrefList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-muted">{title}</p>
      <p>{items.join("، ")}</p>
    </div>
  );
}

function PrefsSheet({ prefs, store, onChange, onClear, onClose }: { prefs: Preferences; store: StoreStatus | null; onChange: (p: Preferences) => void; onClear: () => void; onClose: () => void }) {
  const sub = (l: Subcategory[]) => l.map((s) => SUBCATEGORY_META[s].label);
  const empty = !prefs.likes.length && !prefs.cuisines.length && !prefs.cafeTypes.length && !prefs.neighborhoods.length && !prefs.avoid.length && !prefs.notes.length && !prefs.minRating && !prefs.budget && !prefs.distance;
  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full space-y-3 rounded-t-3xl bg-surface p-5 md:max-w-md md:rounded-3xl">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold">
          <Brain className="size-5 text-brand-600" aria-hidden /> تفضيلاتي
        </h2>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-background p-3 text-sm">
          <span>أسمح للمساعد يحفظ ملاحظاتي ويستخدمها في الاقتراحات</span>
          <input type="checkbox" checked={prefs.consent} onChange={(e) => onChange({ ...prefs, consent: e.target.checked })} className="size-5 accent-brand-500" />
        </label>
        <div className="space-y-2 text-sm">
          {empty && <p className="text-muted">لا شيء محفوظ بعد.</p>}
          <PrefList title="أفضّل:" items={prefs.likes.map((t) => TAG_LABELS[t])} />
          <PrefList title="المطابخ المفضلة:" items={sub(prefs.cuisines)} />
          <PrefList title="نوع الكوفي المفضل:" items={sub(prefs.cafeTypes)} />
          <PrefList title="الأحياء المفضلة:" items={prefs.neighborhoods} />
          <PrefList title="الميزانية:" items={prefs.budget === "low" ? ["اقتصادي"] : []} />
          <PrefList title="الترتيب المفضل:" items={prefs.distance === "distance" ? ["الأقرب"] : prefs.distance === "rating" ? ["الأعلى تقييماً"] : []} />
          <PrefList title="أتجنب:" items={prefs.avoid} />
          <PrefList title="أقل تقييم مفضّل:" items={prefs.minRating ? [String(prefs.minRating)] : []} />
          <PrefList title="ملاحظاتي:" items={prefs.notes} />
        </div>
        <p className="text-[11px] text-muted">
          {store?.mode === "supabase" ? "محفوظة في حسابك المجهول على قاعدة البيانات، ومحمية بحيث ما يشوفها غيرك." : "محفوظة على هذا الجهاز فقط (وضع تجريبي)."}
        </p>
        <div className="flex gap-2">
          <button onClick={onClear} className="flex-1 rounded-xl border border-red-200 py-2 text-sm text-red-600">
            امسح تفضيلاتي
          </button>
          <button onClick={onClose} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand-500 py-2 text-sm text-white">
            <Check className="size-4" aria-hidden /> تم
          </button>
        </div>
      </div>
    </div>
  );
}
