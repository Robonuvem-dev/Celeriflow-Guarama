"use client";

import type { ComponentProps } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import FinanceOperationalList from "./FinanceOperationalList";

/** Contextual read view; the owning form and its complete payload stay mounted. */
export default function FinanceTablePanel({ description, ...list }: ComponentProps<typeof FinanceOperationalList> & { description?: string }) {
  return <OperationalTablePanel title={list.label} triggerLabel={`Consultar ${list.label}`} description={description}>
    <FinanceOperationalList {...list} />
  </OperationalTablePanel>;
}
