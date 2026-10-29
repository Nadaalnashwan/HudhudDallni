"use client";
import { BarChart3, ChevronLeft, CircleUserRound, Navigation, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { anchorLabel, CATEGORY_META, DISTRICTS, SUBCATEGORY_META, subcategoriesOf, TAG_LABELS } from "@/lib/catalog";
import { mergePreferences } from "@/lib/feedback";
import { formatKm, formatLeg, RIYADH_CENTER } from "@/lib/geo";
import type { IntentContext } from "@/lib/intent";
import {
  constraintsInput,
  describeConstraintChange,
  describeNewItinerary,
  describeSameShapeChange,
  HISTORY_LIMIT,
  regenerateInput,
  replaceAllInput,
  replaceStopInput,
  samePlaces,
  settingsOf,
  type PlanSettings,
  type StepInput,
} from "@/lib/planEdits";
import { clearPreferences, DEFAULT_PREFS, loadLastPlan, loadPreferences, loadVisits, markAssistantFeedbackAsked, savePlan, savePreferences, saveVisits, shouldAskForAssistantFeedback, storeStatus, type StoreStatus } from "@/lib/store";
import type { AssistantResponse, Category, ChatMessage, ConstraintEdit, LatLng, ParsedRequest, Place, Plan, PlaceTag, PlanStop, Preferences, Priority, StepSpec, Subcategory, Visit } from "@/lib/types";
import AssistantChat from "./AssistantChat";
import AssistantFeedbackSheet, { AssistantStatsSheet } from "./AssistantFeedback";
import { MishwarakLogo, MishwarakMark } from "./Brand";
import { CategoryIcon, DirectionsIcon } from "./icons";
import FeedbackFlow from "./FeedbackFlow";
import MapView from "./map/MapView";
import PlaceCard from "./PlaceCard";
import PlaceSheet from "./PlaceSheet";
import PlanPipeline from "./PlanPipeline";
import ThemeToggle from "./ThemeToggle";
import { TripPanel, useTrip } from "./TripNavigator";
import { SheetHandle, typeLabel } from "./ui";

const VISIT_DELAY_MS = 30 * 60 * 1000; // ask about a visit 30 min after the outing started
const uid = () => crypto.randomUUID();
const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "هلا والله! أنا مشوارك، مساعدك في هدهد.\nقول لي وش ودك تسوي وأنا أدور لك الأماكن وأرتب طلعتك على الخريطة.",
};
const QUICK_CATEGORIES = Object.keys(CATEGORY_META) as Category[];
const UNDO_VALUE = "تراجع";
const UNDO_OPTIONS = [{ label: "تراجع", value: UNDO_VALUE }];
const CHAT_CONTEXT_TURNS = 8;

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
  fallback?: StepInput["fallback"];
  avoid?: string[];
  avoidNames?: string[];
  seen?: string[];
  goal?: string; // kept on the plan, never sent to the planner
};

export default function HudhudApp() {
  const [config, setConfig] = useState<Config | null>(null);
  const [store, setStore] = useState<StoreStatus | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [userOrigin, setUserOrigin] = useState<Origin>({ loc: RIYADH_CENTER, label: "مكانك الحالي" });
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
  const [panelOpen, setPanelOpen] = useState(false); // map first; the assistant opens on demand
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [quotaNoticeShown, setQuotaNoticeShown] = useState(false);
  const [feedbackAsk, setFeedbackAsk] = useState<{ planId?: string } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  // Plans before each change (newest last), so "تراجع" can restore the map, cards and route together.
  const [undoStack, setUndoStack] = useState<Plan[]>([]);
  const rejected = useRef(new Set<string>()); // places the user turned down this session
  const shown = useRef(new Set<string>()); // every place a plan showed this session
  const pendingGoal = useRef<string | null>(null); // the request a clarifying question is about
  const tripApi = useTrip();
  const trip = tripApi.trip;

  // The plan card sits in the chat right under the reply that created or last changed it.
  const [planAfterId, setPlanAfterId] = useState<string | null>(null);
  const planMoved = useRef(false);
  const say = (m: Omit<ChatMessage, "id">) => {
    const id = uid();
    if (m.role === "assistant" && planMoved.current) {
      planMoved.current = false;
      setPlanAfterId(id);
    }
    setMessages((x) => [...x, { id, ...m }]);
  };

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
    const { goal, ...build } = a;
    let res: Response;
    try {
      res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...build,
          origin: a.origin.loc,
          originLabel: a.origin.label,
          avoid: [...new Set([...(a.avoid ?? []), ...rejected.current])],
          preferences: prefs,
        }),
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
    const next: Plan = { id: keepId ?? uid(), origin: a.origin.loc, originLabel: a.origin.label, district: a.district, priority: a.priority, stops, route, tags: a.tags, goal };
    if (plan && !samePlaces(plan, next)) setUndoStack((h) => [...h, plan].slice(-HISTORY_LIMIT));
    stops.forEach((s) => shown.current.add(s.place.id));
    setPlan(next);
    setFocus(null);
    savePlan(next);
    planMoved.current = true;
    return next;
  };

  const argsFrom = (p: Plan, steps = p.stops.map((s) => s.step)): BuildArgs => ({
    steps,
    origin: { loc: p.origin, label: p.originLabel },
    district: p.district,
    priority: p.priority,
    tags: p.tags ?? tags,
    goal: p.goal,
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
      const lines = p.stops.map((s, i) => `${i + 1}. ${typeLabel(s.step)}: ${s.place.name}${i ? ` — يبعد تقريباً ${formatKm(s.distanceFromPrevKm ?? 0)} عن ${s.anchorLabel}` : ""}`);
      say({ role: "assistant", text: `خطتك جاهزة:\n${lines.join("\n")}${prefsNote()}\nتقدر تغيّر أي وجهة أو تثبّتها من البطاقات أو تقول لي مثلاً «غير الكوفي» أو «خل المطعم إيطالي».` });
    }
  };

  const describeChange = (before: Plan, after: Plan, changedAt: number) => {
    const parts: string[] = [];
    after.stops.forEach((s, i) => {
      const label = anchorLabel(s.step.category, s.step.subcategory);
      if (before.stops[i]?.place.id === s.place.id) {
        if (i > changedAt)
          parts.push(s.locked ? `${label} مثبّت فما غيرته` : `${label} للحين الأنسب (${formatKm(s.distanceFromPrevKm ?? 0)} عن ${s.anchorLabel}) فخليته`);
        return;
      }
      const swapped = before.stops[i] && before.stops[i].step.category !== s.step.category;
      parts.push(i === changedAt ? (swapped ? `حطيت ${typeLabel(s.step)} بدال ${anchorLabel(before.stops[i].step.category, before.stops[i].step.subcategory)}: ${s.place.name}` : `غيّرت ${label} إلى ${s.place.name}`) : `وعشان يكون قريب، اخترت ${label}: ${s.place.name} (${formatKm(s.distanceFromPrevKm ?? 0)} عن ${s.anchorLabel})`);
    });
    const target = after.stops[changedAt];
    if (target && before.stops[changedAt]?.place.id === target.place.id)
      parts.unshift(`ما لقيت بديل مناسب لل${CATEGORY_META[target.step.category].label}، فخليته ${target.place.name}.`);
    say({ role: "assistant", text: parts.length ? parts.join("\n") : "ما لقيت بديل مناسب، فخليت الخطة مثل ما هي." });
  };

  /** Rebuild from index i: earlier stops and locked later stops stay; the rest re-anchor on the new chain. */
  const rebuildFrom = async (i: number, o: RebuildOpts) => {
    if (!plan || busyIndex !== null) return; // one plan update at a time
    setBusyIndex(i);
    if (o.exclude) rejected.current.add(plan.stops[i].place.id);
    const input = replaceStopInput(plan, i, o);
    const next = await runPlan({ ...argsFrom(plan, input.steps), ...input }, plan.id);
    setBusyIndex(null);
    if (!next) return;
    // One-stop result picked from its cards: the selection moves in place, with no repeat of the cards.
    if (plan.stops.length === 1 && next.stops.length === 1 && o.place) {
      planMoved.current = false;
      return;
    }
    describeChange(plan, next, i);
  };

  const replaceStop = (i: number, o: Omit<RebuildOpts, "place"> = {}) => {
    if (plan?.stops[i].locked) return say({ role: "assistant", text: "هالوجهة مثبّتة. فك التثبيت أول عشان أغيّرها." });
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
      say({ role: "assistant", text: `ضفت ${typeLabel(s.step)}: ${s.place.name} (يبعد تقريباً ${formatKm(s.distanceFromPrevKm ?? 0)} عن ${s.anchorLabel}).` });
    }
  };

  const noPlan = () => say({ role: "assistant", text: "ما عندك خطة للحين. قول لي وش ودك تسوي وأرتبها لك." });

  /**
   * Whole-plan edits. The reply is written from the planner's actual result, never from the
   * model's claim; "تراجع" is offered only when something really changed.
   */
  const runWholeEdit = async (
    input: StepInput & { settings?: PlanSettings },
    describe: (before: Plan, after: Plan) => { changed: boolean; text: string },
    rejectOld: boolean,
  ) => {
    if (!plan) return noPlan();
    const before = plan;
    const { settings = settingsOf(before), ...stepInput } = input;
    setBusy(true);
    const next = await runPlan(
      { ...stepInput, origin: { loc: settings.origin, label: settings.originLabel }, district: settings.district, priority: settings.priority, tags: settings.tags, goal: before.goal },
      before.id,
    );
    setBusy(false);
    if (!next) return; // runPlan already said why
    setTags(settings.tags);
    const d = describe(before, next);
    if (d.changed && rejectOld) before.stops.forEach((s) => !next.stops.some((n) => n.place.id === s.place.id) && rejected.current.add(s.place.id));
    say({ role: "assistant", text: d.text, options: d.changed ? UNDO_OPTIONS : undefined });
  };

  const replaceAll = (includeLocked?: boolean) => {
    if (!plan) return noPlan();
    return runWholeEdit(
      replaceAllInput(plan, { includeLocked, rejected: [...rejected.current], seen: [...shown.current] }),
      (b, a) => describeSameShapeChange(b, a, { headline: "غيّرت لك الأماكن:", unchanged: "ما لقيت أماكن بديلة غير اللي بالخطة، فخليتها مثل ما هي.", includeLocked }),
      true,
    );
  };

  const regenerate = (request?: ParsedRequest, includeLocked?: boolean) => {
    if (!plan) return noPlan();
    return runWholeEdit(regenerateInput(plan, request, { includeLocked, rejected: [...rejected.current], seen: [...shown.current] }), describeNewItinerary, true);
  };

  const editConstraints = (edit: ConstraintEdit) => {
    if (!plan) return noPlan();
    return runWholeEdit(constraintsInput(plan, edit, { rejected: [...rejected.current] }), (b, a) => describeConstraintChange(b, a, edit), false);
  };

  const undo = () => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return say({ role: "assistant", text: "ما فيه تغيير سابق أرجع له." });
    setUndoStack((h) => h.slice(0, -1));
    setPlan(prev);
    savePlan(prev);
    setFocus(null);
    setTags(prev.tags ?? []);
    planMoved.current = true;
    say({ role: "assistant", text: `رجّعت الخطة اللي قبل:\n${prev.stops.map((s, i) => `${i + 1}. ${typeLabel(s.step)}: ${s.place.name}`).join("\n")}` });
  };

  /** What Mishwarak needs to read a message in context. */
  const intentContext = (): IntentContext => ({
    planSteps:
      plan?.stops.map((s) => ({ category: s.step.category, subcategory: s.step.subcategory, locked: s.locked, name: s.place.name, placeId: s.place.id, distanceKm: s.distanceFromPrevKm })) ?? [],
    pending,
    plan: plan ? { district: plan.district, priority: plan.priority, tags: plan.tags ?? tags } : undefined,
    goal: plan?.goal ?? pendingGoal.current ?? undefined,
    history: messages
      .filter((m) => m.id !== WELCOME.id)
      .slice(-CHAT_CONTEXT_TURNS)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 280) })),
    rejectedIds: [...rejected.current].slice(-50),
    canUndo: undoStack.length > 0,
  });

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
      goal: subcategory ? `${CATEGORY_META[category].label} ${SUBCATEGORY_META[subcategory].label}` : CATEGORY_META[category].label,
    });
    setBusy(false);
    if (p) describeNew(p);
  };

  // --- chat
  const send = async (text: string) => {
    say({ role: "user", text });
    // The "تراجع" button works without a model round-trip.
    if (text === UNDO_VALUE && undoStack.length) return undo();
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, context: intentContext(), preferences: prefs }),
      });
      const out = (await res.json()) as AssistantResponse;
      const a = out.action;
      if (out.fallback === "quota" && !quotaNoticeShown) {
        setQuotaNoticeShown(true);
        say({ role: "assistant", text: "الفهم الذكي متوقف مؤقتاً، فبكمل معك بالفهم الأساسي." });
      }
      applyLearned(out.learned);
      if (a.type === "clarify") {
        const p = a.pending;
        setPending(p && (p.steps?.length || p.district || p.priority || p.tags?.length) ? p : undefined);
        if (!plan) pendingGoal.current = pendingGoal.current ? `${pendingGoal.current} — ${text}` : text;
        say({ role: "assistant", text: a.question || out.reply, options: a.options });
      } else if (a.type === "plan") {
        setPending(undefined);
        const goal = pendingGoal.current ? `${pendingGoal.current} — ${text}` : text;
        pendingGoal.current = null;
        say({ role: "assistant", text: out.reply });
        const req = a.request;
        setTags(req.tags);
        const district = req.district && DISTRICTS[req.district] ? req.district : undefined;
        const origin = district ? { loc: DISTRICTS[district], label: `حي ${district}` } : userOrigin;
        const steps = req.steps.map((s) => ({ ...s, tags: [...new Set([...(s.tags ?? []), ...req.tags])] }));
        setActiveCategory(steps.length === 1 ? steps[0].category : null);
        setBusy(true);
        const p = await runPlan({ steps, origin, district, priority: defaultPriority(req.priority), tags: req.tags, goal });
        if (p) describeNew(p);
      } else if (a.type === "modify") {
        // Edits report what the planner actually did, not what the model said it would do.
        if (!plan) noPlan();
        else if (a.op === "replace") await replaceStop(a.index, { step: a.step, nearer: a.nearer, onlyThis: a.onlyThis });
        else if (a.op === "lock" || a.op === "unlock") {
          const s = plan.stops[a.index];
          toggleLock(a.index, a.op === "lock");
          say({ role: "assistant", text: a.op === "lock" ? `ثبّت ${typeLabel(s.step)}: ${s.place.name}، ما راح يتغير.` : `فكّيت تثبيت ${typeLabel(s.step)}.` });
        } else if (plan.stops.length < 2) say({ role: "assistant", text: "هذي الوجهة الوحيدة بالخطة. قول لي وش تبي بدالها." });
        else await removeStop(a.index);
      } else if (a.type === "add") {
        await addStep(a.step, undefined, a.after);
      } else if (a.type === "replace_all") {
        await replaceAll(a.includeLocked);
      } else if (a.type === "regenerate") {
        await regenerate(a.request, a.includeLocked);
      } else if (a.type === "constraints") {
        await editConstraints(a.edit);
      } else if (a.type === "undo") {
        undo();
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
  const visitOf = (p: Place, planId: string): Visit => ({
    placeId: p.id,
    placeName: p.name,
    category: p.category,
    subcategory: p.subcategory,
    district: p.district,
    source: p.source,
    planId,
    status: "pending",
  });

  /** "ابدأ الرحلة": in-app navigation through the stops in the user's order, from `index`. */
  const startTrip = (stops: Place[], index = 0, planId?: string) => {
    setDetails(null);
    setFocus(null);
    if (!window.matchMedia("(min-width: 768px)").matches) setPanelOpen(false);
    const key = planId ?? uid();
    if (plan && planId === plan.id) {
      const started = { ...plan, startedAt: plan.startedAt ?? new Date().toISOString() };
      setPlan(started);
      savePlan(started);
    }
    const v = stops.slice(index).map((p) => visitOf(p, key));
    setVisits(v);
    saveVisits(v);
    tripApi.start(stops, index, key);
  };

  const startPlanTrip = () => plan && startTrip(plan.stops.map((s) => s.place), 0, plan.id);

  const finishVisit = (placeId: string, status: Visit["status"], message?: string) => {
    const next = visits.map((v) => (v.placeId === placeId && v.status === "pending" ? { ...v, status } : v));
    setVisits(next);
    saveVisits(next);
    if (message) say({ role: "assistant", text: message });
    if (!next.some((v) => v.status === "pending")) setFeedbackOn(false);
  };

  // An outing ended → once per outing (and not more than every 12 h) ask about Mishwarak itself.
  useEffect(() => {
    if (trip?.phase !== "done") return;
    const key = trip.planId ?? trip.stops[0]?.id;
    if (key && shouldAskForAssistantFeedback(key)) {
      markAssistantFeedbackAsked(key);
      setFeedbackAsk({ planId: trip.planId });
    }
    tripApi.clear();
  }, [trip?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // A one-stop plan shown as cards in the chat starts from its card; otherwise the plan card shows.
  const cardStop = plan?.stops.length === 1 && messages.some((m) => m.places?.some((p) => p.id === plan.stops[0].place.id)) ? plan.stops[0].place : undefined;
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
    // on phones the sheet would cover the card; on desktop the side panel can stay open
    if (!window.matchMedia("(min-width: 768px)").matches) setPanelOpen(false);
  };
  const focusedIsStop = focus && plan?.stops.some((s) => s.place.id === focus.place.id);
  const focusAnchor = plan && focus && focus.stopIndex > 0 ? plan.stops[focus.stopIndex - 1] : null;

  const showSearch = !panelOpen && !trip && !focus;
  const showPlanBar = plan && !panelOpen && !trip && !focus;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      {/* Map */}
      <div className={`absolute inset-0 ${panelOpen ? "md:right-[420px]" : ""}`}>
        {trip && trip.phase !== "done" ? (
          <MapView
            origin={trip.userPos ?? trip.origin ?? userOrigin.loc}
            originLabel={trip.userPos || !trip.origin ? "مكانك الحالي" : trip.originLabel}
            stops={trip.stops}
            alternatives={[]}
            path={trip.route?.path ?? []}
            selectedId={trip.stops[trip.index].id}
            onSelect={setDetails}
            fitKey={`trip-${trip.index}-${trip.phase}-${trip.route?.distanceMeters ?? 0}`}
            onMapClick={trip.phase === "need_origin" ? (p) => tripApi.setManualOrigin(p, "نقطة اخترتها على الخريطة") : undefined}
          />
        ) : (
          <MapView origin={plan?.origin ?? userOrigin.loc} stops={stopsOnMap} alternatives={altsOnMap} path={plan?.route?.path ?? []} selectedId={focus?.place.id} onSelect={selectOnMap} />
        )}
      </div>

      {/* Category chips over the map, as in Hudhud */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 z-[1000] space-y-2 p-3 ${panelOpen ? "md:right-[420px]" : ""}`}>
        {/* one swipeable row on phones; wraps on wider screens, where a hidden scrollbar can't be dragged */}
        <div className="pointer-events-auto flex gap-2 overflow-x-auto scrollbar-none md:flex-wrap">
          {QUICK_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => browse(c)}
              disabled={busy}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium shadow ${activeCategory === c ? "bg-brand-500 text-white" : "bg-surface"}`}
            >
              <CategoryIcon category={c} className={`size-4 ${activeCategory === c ? "" : "text-brand-500"}`} /> {CATEGORY_META[c].plural}
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
        {config && (
          <button
            onClick={() => setPrefsOpen(true)}
            className={`pointer-events-auto rounded-full px-2.5 py-0.5 text-[11px] font-medium shadow ${config.dbError ? "bg-red-100 text-red-800" : "bg-surface/90 text-muted"}`}
          >
            {config.dbError ? "تعذر تحميل الأماكن حالياً" : "نسخة تجريبية"}
          </button>
        )}
      </div>

      {/* Bottom stack: locate, trip or place card, plan bar, and the search sheet */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex flex-col gap-2 md:bottom-3 md:left-3 md:right-auto md:w-[26rem] ${panelOpen ? "max-md:bottom-[55dvh]" : ""} ${showSearch ? "" : "max-md:pb-3"}`}
      >
        <button
          onClick={() =>
            navigator.geolocation?.getCurrentPosition(
              (pos) => setUserOrigin({ loc: { lat: pos.coords.latitude, lng: pos.coords.longitude }, label: "مكانك الحالي" }),
              () => say({ role: "assistant", text: "ما قدرت أوصل لمكانك، بستخدم وسط الرياض." }),
            )
          }
          className="pointer-events-auto mx-3 flex size-11 items-center justify-center self-end rounded-full bg-surface shadow-lg md:mx-0"
          aria-label="مكاني الحالي"
        >
          <Navigation className="size-5 fill-brand-500 text-brand-500" />
        </button>

        {trip && (
          <div className={`pointer-events-auto mx-3 md:mx-0 ${panelOpen ? "max-md:hidden" : ""}`}>
            <TripPanel api={tripApi} onCancel={tripApi.clear} />
          </div>
        )}

        {focus && !trip && (
          <div className="pointer-events-auto relative mx-3 md:mx-0">
            <button onClick={() => setFocus(null)} className="absolute -top-3 left-2 z-10 flex size-7 items-center justify-center rounded-full bg-surface shadow" aria-label="إغلاق">
              <X className="size-4" />
            </button>
            <PlaceCard
              place={focus.place}
              from={focusAnchor?.place.location ?? plan?.origin}
              fromLabel={focusAnchor ? anchorLabel(focusAnchor.place.category, focusAnchor.place.subcategory) : plan?.originLabel}
              reason={plan?.stops.find((s) => s.place.id === focus.place.id)?.reason}
              badge={focusedIsStop ? `الوجهة ${plan!.stops.findIndex((s) => s.place.id === focus.place.id) + 1}` : "بديل"}
              onDetails={() => setDetails(focus.place)}
              chooseLabel={focusedIsStop ? "غيّره" : "اختره بداله"}
              onChoose={() => (focusedIsStop ? replaceStop(focus.stopIndex) : chooseAlternative(focus.place))}
            />
          </div>
        )}

        {showPlanBar && (
          <div className="pointer-events-auto mx-3 flex items-center gap-2 rounded-2xl bg-surface p-2 ps-3 shadow-lg md:mx-0">
            <button onClick={() => setPanelOpen(true)} className="flex min-w-0 flex-1 items-center gap-1 text-right">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{plan.stops.length > 1 ? `طلعتك: ${destinations(plan.stops.length)}` : plan.stops[0].place.name}</span>
                {plan.route && plan.route.distanceMeters > 0 && <span className="block text-xs text-muted">{formatLeg(plan.route.distanceMeters, plan.route.durationSeconds)}</span>}
              </span>
              <ChevronLeft className="size-4 shrink-0 text-muted" aria-hidden />
            </button>
            <button onClick={startPlanTrip} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600">
              <DirectionsIcon className="size-5" /> ابدأ رحلتك
            </button>
          </div>
        )}

        {showSearch && (
          <div className="pointer-events-auto rounded-t-3xl bg-surface px-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,.12)] md:rounded-3xl md:pt-3 md:shadow-lg">
            <div className="flex justify-center py-2 md:hidden">
              <span className="h-1 w-10 rounded-full bg-line" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPanelOpen(true)} className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-background pe-1.5 ps-4 text-sm text-muted">
                <Search className="size-5 shrink-0" aria-hidden />
                <span className="flex-1 truncate text-right">وين ودك تروح اليوم؟</span>
                <span className="flex h-8 w-9 shrink-0 items-center justify-center">
                  <MishwarakMark className="size-7" />
                </span>
              </button>
              <button onClick={() => setPrefsOpen(true)} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-background text-muted" aria-label="الإعدادات">
                <CircleUserRound className="size-6" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mishwarak: bottom sheet on mobile, side panel on desktop. Kept mounted while hidden so nothing resets. */}
      <aside
        aria-label="مشوارك"
        aria-hidden={!panelOpen}
        className={`absolute inset-x-0 bottom-0 z-[1100] h-[55dvh] flex-col rounded-t-3xl border-line bg-surface shadow-[0_-8px_30px_rgba(0,0,0,.12)] md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[420px] md:rounded-none md:border-l ${
          panelOpen ? "flex" : "hidden"
        }`}
      >
        <SheetHandle onClose={() => setPanelOpen(false)} label="إغلاق مشوارك" />
        <div className="flex items-center justify-between gap-2 px-4 pb-1 md:pt-3">
          <h2>
            <MishwarakLogo />
          </h2>
          <button onClick={() => setPanelOpen(false)} className="flex size-8 items-center justify-center rounded-full bg-background text-muted" aria-label="إغلاق مشوارك">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <AssistantChat
            messages={messages}
            busy={busy && busyIndex === null}
            disabled={busy || busyIndex !== null}
            chosenIds={stopsOnMap.map((p) => p.id)}
            startId={cardStop?.id}
            onStart={startPlanTrip}
            from={plan?.origin ?? userOrigin.loc}
            fromLabel={plan?.originLabel ?? userOrigin.label}
            onSend={send}
            onChoose={chooseAlternative}
            onDetails={setDetails}
            onSelect={selectOnMap}
            planAfterId={planAfterId}
            plan={
              plan && plan.stops.length > 0 && !cardStop ? (
                <div className="pb-1">
                  <PlanPipeline
                    plan={plan}
                    busyIndex={busyIndex}
                    selectedId={focus?.place.id}
                    onSelect={(i) => selectOnMap(plan.stops[i].place)}
                    onReplace={replaceStop}
                    onToggleLock={(i) => toggleLock(i)}
                    onRemove={removeStop}
                    onStart={startPlanTrip}
                  />
                </div>
              ) : null
            }
            header={
              messages.length <= 1 && !plan?.stops.length ? (
                // welcome screen
                <div className="flex justify-center pb-4 pt-8">
                  <MishwarakLogo markClassName="size-16" textClassName="text-3xl" />
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
          onStartTrip={() => {
            const idx = plan?.stops.findIndex((s) => s.place.id === details.id) ?? -1;
            if (plan && idx >= 0) startTrip(plan.stops.map((s) => s.place), idx, plan.id);
            else startTrip([details]);
          }}
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

      {trip?.phase === "feedback" ? (
        <FeedbackFlow
          key={`trip-${trip.index}`}
          visit={visitOf(trip.stops[trip.index], trip.planId ?? "")}
          prefs={prefs}
          onPrefs={updatePrefs}
          onFinish={(status, message) => {
            finishVisit(trip.stops[trip.index].id, status, message);
            tripApi.afterFeedback();
          }}
        />
      ) : (
        feedbackOn &&
        pendingVisit &&
        !trip && (
          <FeedbackFlow key={pendingVisit.placeId} visit={pendingVisit} prefs={prefs} onFinish={(st, m) => finishVisit(pendingVisit.placeId, st, m)} onPrefs={updatePrefs} />
        )
      )}

      {feedbackAsk && (
        <AssistantFeedbackSheet
          planId={feedbackAsk.planId}
          onDone={(message) => {
            setFeedbackAsk(null);
            if (message) say({ role: "assistant", text: message });
          }}
        />
      )}

      {statsOpen && <AssistantStatsSheet onClose={() => setStatsOpen(false)} />}

      {prefsOpen && (
        <SettingsSheet
          config={config}
          prefs={prefs}
          store={store}
          onChange={updatePrefs}
          onClear={resetPrefs}
          onStats={() => {
            setPrefsOpen(false);
            setStatsOpen(true);
          }}
          onClose={() => setPrefsOpen(false)}
        />
      )}
    </div>
  );
}

/** "وجهتين" / "3 وجهات" */
const destinations = (n: number) => (n === 2 ? "وجهتين" : `${n} ${n <= 10 ? "وجهات" : "وجهة"}`);

/** What this prototype runs on, in plain words. */
function aboutLines(config: Config | null, store: StoreStatus | null) {
  const lines: string[] = [];
  if (config?.dbError) lines.push("تعذر تحميل الأماكن حالياً");
  else if (config?.places === "supabase")
    lines.push(config.placesCount ? `${config.placesCount.toLocaleString("en-US")} مكان في الرياض، والتجريبي منها معلّم` : "أماكن في الرياض، والتجريبي منها معلّم");
  else if (config?.places === "demo") lines.push("أماكن تجريبية محفوظة داخل التطبيق");
  if (config) lines.push(config.ai === "gemini" ? "يفهم طلباتك بالذكاء الاصطناعي" : "يفهم طلباتك بالفهم الأساسي");
  if (store) lines.push(store.mode === "supabase" ? "تقييماتك وتفضيلاتك محفوظة لك بشكل خاص" : "تقييماتك وتفضيلاتك محفوظة على جهازك");
  return lines;
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

function SettingsSheet({
  config,
  prefs,
  store,
  onChange,
  onClear,
  onStats,
  onClose,
}: {
  config: Config | null;
  prefs: Preferences;
  store: StoreStatus | null;
  onChange: (p: Preferences) => void;
  onClear: () => void;
  onStats: () => void;
  onClose: () => void;
}) {
  const sub = (l: Subcategory[]) => l.map((s) => SUBCATEGORY_META[s].label);
  const empty = !prefs.likes.length && !prefs.cuisines.length && !prefs.cafeTypes.length && !prefs.neighborhoods.length && !prefs.avoid.length && !prefs.notes.length && !prefs.minRating && !prefs.budget && !prefs.distance;
  const row = "flex w-full items-center justify-between gap-3 rounded-xl bg-background p-3 text-sm";
  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface px-5 pb-5 md:max-w-md md:rounded-3xl md:pt-5">
        <SheetHandle onClose={onClose} />
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-lg font-bold">الإعدادات</h2>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full bg-background text-muted" aria-label="إغلاق">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className={`${row} py-1.5`}>
            <span>المظهر</span>
            <ThemeToggle />
          </div>
          <button onClick={onStats} className={row}>
            <span className="inline-flex items-center gap-2">
              <BarChart3 className="size-4 text-brand-600" aria-hidden /> مؤشرات مشوارك
            </span>
            <ChevronLeft className="size-4 text-muted" aria-hidden />
          </button>
        </div>

        <h3 className="pb-2 pt-5 font-bold">تفضيلاتي</h3>
        <div className="space-y-3">
          <label className={row}>
            <span>أسمح لـ مشوارك يحفظ ملاحظاتي ويستخدمها في الاقتراحات</span>
            <input type="checkbox" checked={prefs.consent} onChange={(e) => onChange({ ...prefs, consent: e.target.checked })} className="size-5 shrink-0 accent-brand-500" />
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
          {!empty && (
            <button onClick={onClear} className="w-full rounded-xl border border-red-200 py-2 text-sm text-red-600">
              امسح تفضيلاتي
            </button>
          )}
        </div>

        <h3 className="pb-2 pt-5 font-bold">عن النسخة التجريبية</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted">
          {aboutLines(config, store).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>

        <button onClick={onClose} className="mt-5 w-full rounded-full bg-brand-500 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
          تم
        </button>
      </div>
    </div>
  );
}
