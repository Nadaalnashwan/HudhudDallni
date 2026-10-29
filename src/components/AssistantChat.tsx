"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import type { ChatMessage, LatLng, Place } from "@/lib/types";
import { latinDigits } from "@/lib/geo";
import PlaceCard from "./PlaceCard";
import { Spinner } from "./ui";

const SUGGESTIONS = ["أبي قهوة", "أبي أتغدى", "أبي أتعشى", "أبي كوفي هادي", "خطط لي طلعة"];

type Props = {
  messages: ChatMessage[];
  busy: boolean; // shows the typing indicator
  disabled?: boolean; // blocks new input while any plan update is in flight
  chosenIds: string[];
  from: LatLng;
  fromLabel: string;
  onSend: (text: string) => void;
  onChoose: (p: Place) => void;
  onDetails: (p: Place) => void;
  onSelect: (p: Place) => void;
  /** The place a one-stop plan settled on: its card gets "ابدأ رحلتك" instead of "اختره". */
  startId?: string;
  onStart?: () => void;
  header?: React.ReactNode;
  /** The current plan card, shown right after message `planAfterId` (or at the end if that message isn't found). */
  plan?: React.ReactNode;
  planAfterId?: string | null;
};

export default function AssistantChat({ messages, busy, disabled = busy, chosenIds, from, fromLabel, onSend, onChoose, onDetails, onSelect, startId, onStart, header, plan, planAfterId }: Props) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, planAfterId]);
  // a newly picked card slides into view inside its row
  const cards = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (startId) cards.current?.querySelector(`[data-place="${CSS.escape(startId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [startId]);
  const planAnchored = Boolean(plan) && messages.some((m) => m.id === planAfterId);

  const submit = (t: string) => {
    if (!t.trim() || disabled) return;
    onSend(t.trim());
    setText("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={cards} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {header}
        {messages.map((m, idx) => (
          <Fragment key={m.id}>
            <div className={m.role === "user" ? "flex justify-start" : "flex justify-end"}>
              <div className={`max-w-[92%] space-y-2 ${m.role === "user" ? "" : "w-full"}`}>
                <div
                  className={`whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-6 ${
                    m.role === "user" ? "rounded-br-sm bg-brand-500 text-white" : "rounded-bl-sm bg-background"
                  }`}
                >
                  {latinDigits(m.text)}
                </div>
                {m.options && idx === messages.length - 1 && (
                  <div className="flex flex-wrap gap-2">
                    {m.options.map((o) => (
                      <button key={o.label} onClick={() => submit(o.value)} className="rounded-full border border-brand-500 bg-surface px-3 py-1 text-sm text-brand-700 hover:bg-brand-50">
                        {latinDigits(o.label)}
                      </button>
                    ))}
                  </div>
                )}
                {m.places && (
                  <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-none">
                    {m.places.map((p) => {
                      const chosen = chosenIds.includes(p.id);
                      const start = p.id === startId;
                      return (
                        <div key={p.id} data-place={p.id} className="shrink-0">
                          <PlaceCard
                            compact
                            place={p}
                            from={from}
                            fromLabel={fromLabel}
                            badge={chosen ? "✓ اختيارك" : undefined}
                            selected={chosen}
                            onSelect={() => onSelect(p)}
                            onDetails={() => onDetails(p)}
                            onChoose={chosen ? undefined : () => onChoose(p)}
                            onStart={start ? onStart : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {planAnchored && m.id === planAfterId && plan}
          </Fragment>
        ))}
        {!planAnchored && plan}
        {busy && (
          <div className="flex justify-end">
            <div className="flex items-center gap-2 rounded-2xl bg-background px-3 py-2 text-sm text-muted">
              <Spinner /> مشوارك يدوّر لك...
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="border-t border-line bg-surface p-3">
        <div className="mb-2 flex gap-2 overflow-x-auto scrollbar-none">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => submit(s)} disabled={disabled} className="shrink-0 rounded-full bg-background px-3 py-1 text-xs hover:bg-brand-50 disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => (e.preventDefault(), submit(text))} className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب طلبك... مثلاً: نادي وبعده كوفي وبعده مطعم"
            className="min-w-0 flex-1 rounded-full border border-line bg-background px-4 py-2.5 text-sm outline-none focus:border-brand-500"
          />
          <button disabled={disabled || !text.trim()} className="flex size-10 items-center justify-center rounded-full bg-brand-500 text-white disabled:opacity-40" aria-label="إرسال">
            <span className="-scale-x-100">➤</span>
          </button>
        </form>
      </div>
    </div>
  );
}
