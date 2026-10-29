"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { planningNavigation } from "@/lib/planejamento/navigation";

export function CamaraPlanningLayoutShell({ children }: { children: ReactNode }) {
  const workspace = useOptionalOperationalWorkspace();
  // Operational routes already expose these links in the module navigation.
  if (workspace) return children;

  return <div className="space-y-2">
    <nav aria-label="Áreas do Planejamento da Câmara" className="flex flex-wrap gap-1 rounded-lg border bg-card p-2 text-xs">
      <Link href="/camara" className="rounded px-2 py-1 text-purple-700 hover:bg-accent">Câmara Municipal</Link>
      {planningNavigation("LEGISLATIVE").flatMap((group) => group.items).map((item) => <Link key={item.href} href={item.href} className="rounded px-2 py-1 hover:bg-accent">{item.title}</Link>)}
    </nav>
    {children}
  </div>;
}
