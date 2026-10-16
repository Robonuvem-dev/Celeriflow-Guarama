"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

type VisualOnlySensitiveValueProps = {
  value: string;
  label?: string;
  hiddenValue?: string;
  className?: string;
};

/** Visual concealment only: this does not authorize access or hide data from payloads, logs, or the network. */
export function VisualOnlySensitiveValue({
  value,
  label = "valor sensível",
  hiddenValue = "••••••••",
  className = "",
}: VisualOnlySensitiveValueProps) {
  const [isVisible, setIsVisible] = useState(false);
  const valueId = useId();

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <span id={valueId} className="min-w-0 break-all font-mono" aria-live="polite">
        {isVisible ? value : (
          <>
            <span aria-hidden="true">{hiddenValue}</span>
            <span className="sr-only">{label} oculto</span>
          </>
        )}
      </span>
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-controls={valueId}
        aria-pressed={isVisible}
        aria-label={`${isVisible ? "Ocultar" : "Revelar"} ${label}`}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e4c7e]"
      >
        {isVisible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </span>
  );
}
