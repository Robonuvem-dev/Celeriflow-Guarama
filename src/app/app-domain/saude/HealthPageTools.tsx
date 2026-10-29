"use client";

import { Children, type ReactNode } from "react";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";

export function HealthPageTools({ children, label = "Operações" }: { children: ReactNode; label?: string }) {
  return <OperationalHeaderActions><OperationalFilters label={label}>{children}</OperationalFilters></OperationalHeaderActions>;
}

/** Explicit layout slots: the list first, supplementary context afterwards. */
export function HealthListRegion({ children }: { children: ReactNode }) {
  const [list, ...context] = Children.toArray(children);
  return <>{list}<HealthPageTools label="Contexto">{context}</HealthPageTools></>;
}

/** Operation feedback occupies the contextual header, never an extra grid row. */
export function HealthFeedback({ message, error = false }: { message: string; error?: boolean }) {
  if (!message) return null;
  return <OperationalHeaderActions><span className="sr-only" role={error ? "alert" : "status"}>{message}</span><OperationalFilters label={error ? "Erro da operação" : "Resultado da operação"}><p>{message}</p></OperationalFilters></OperationalHeaderActions>;
}
