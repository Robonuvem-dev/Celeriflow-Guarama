"use client";
import { useState, type ReactNode } from "react";

export function PlanningRecordEditor({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={(event) => setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm underline">Editar / revisar registro</summary>{open && <div className="pt-3">{children}</div>}</details>;
}
