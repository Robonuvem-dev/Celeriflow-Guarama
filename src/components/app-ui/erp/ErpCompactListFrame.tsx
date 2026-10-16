"use client";

import type { ReactNode } from "react";

/** Compact, content-sized page: short viewports scroll the page, never clip rows. */
export function ErpCompactListFrame({ toolbar, pagination, children }: { toolbar: ReactNode; pagination: ReactNode; children: ReactNode }) {
  return <section className="flex shrink-0 flex-col rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    <div className="shrink-0 border-b border-slate-200 px-3 py-1 dark:border-slate-800">{toolbar}</div>
    <div className="overflow-x-auto [&_table]:min-w-[760px] [&_table]:text-[11px] [&_th]:h-6 [&_th]:whitespace-nowrap [&_th]:px-2 [&_th]:py-0 [&_tbody_tr]:h-[22px] [&_td]:px-2 [&_td]:py-0 [&_td]:leading-[14px] [&_tbody_input]:h-5 [&_tbody_input]:py-0 [&_tbody_button]:min-h-5 [&_tbody_button]:py-0">
      {children}
    </div>
    <div className="shrink-0 border-t border-slate-200 px-3 py-1 dark:border-slate-800">{pagination}</div>
  </section>;
}
