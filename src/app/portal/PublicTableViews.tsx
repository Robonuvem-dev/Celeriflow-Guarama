"use client";

import { useSyncExternalStore, type ReactNode } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function PublicTableViews({ views }: { views: { id: string; title: string; content: ReactNode }[] }) {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash.slice(1), () => "");
  const active = views.find((view) => view.id === hash) || views[0];
  return <div className="flex min-h-0 min-w-0 flex-col gap-1">
    <nav aria-label="Listagens publicadas" className="flex gap-2">{views.map((view) => <a key={view.id} href={`#${view.id}`} className="rounded border px-2 py-1 text-sm" aria-current={active?.id === view.id ? "page" : undefined}>{view.title}</a>)}</nav>
    {active && <section id={active.id} aria-label={active.title} className="flex min-h-0 min-w-0 flex-1 flex-col">{active.content}</section>}
  </div>;
}
