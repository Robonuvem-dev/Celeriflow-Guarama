"use client";

import type { ReactNode } from "react";
import { useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";

export function SstContent({ children }: { children: ReactNode }) {
  const workspace = useOptionalOperationalWorkspace();
  return workspace ? children : <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>;
}
