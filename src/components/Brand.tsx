import { useId } from "react";

/** Mishwarak's mark: a route through two stops that ends at the destination (blue). */
export function MishwarakMark({ className = "size-8" }: { className?: string }) {
  const id = `mk${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#fff" />
        <circle cx="48" cy="14" r="13.5" fill="#000" />
      </mask>
      <path mask={`url(#${id})`} d="M12 56 L12 44 Q12 33 23 33 L37 33 Q48 33 48 22 L48 16" stroke="#12D98A" strokeWidth="8" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="52" r="4" fill="#fff" />
      <circle cx="30" cy="33" r="4" fill="#fff" />
      <circle cx="48" cy="14" r="9" fill="#2086FF" />
    </svg>
  );
}

/** Mark and name, written in Latin letters and read "مشوارك". */
export function MishwarakLogo({ markClassName = "size-8", textClassName = "text-lg" }: { markClassName?: string; textClassName?: string }) {
  return (
    <span dir="ltr" className="inline-flex items-center gap-1.5">
      <MishwarakMark className={markClassName} />
      <span className={`font-bold tracking-tight ${textClassName}`}>Mishwarak</span>
    </span>
  );
}
