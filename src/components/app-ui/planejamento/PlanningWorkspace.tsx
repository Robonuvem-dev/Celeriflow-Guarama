import { Children, isValidElement, type ReactNode } from "react";
import { ContextualTables } from "./ContextualTables";

// Explicitly marked, direct sections are list areas; every other child remains
// available in Contexto e operações, including the existing navigation and forms.
export function PlanningWorkspace({ children, initialArea }: { children: ReactNode; initialArea?: string }) {
  const areas: { id: string; label: string; content: ReactNode }[] = [];
  const context: ReactNode[] = [];
  Children.toArray(children).forEach(child => {
    if (isValidElement<{ "data-table-area"?: string; "aria-label"?: string; children?: ReactNode }>(child) && child.props["data-table-area"]) {
      areas.push({ id: child.props["data-table-area"], label: child.props["aria-label"] ?? child.props["data-table-area"], content: child.props.children });
    } else context.push(child);
  });
  return <ContextualTables areas={areas} initialArea={initialArea}>{context}</ContextualTables>;
}
