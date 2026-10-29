"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { EmployeePortalShell } from "@/components/portal-servidor/EmployeePortalShell";
import { OperationalHeaderActions, useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";

export function PortalLayoutShell({ children, institutionName, userName }: { children: ReactNode; institutionName: string; userName: string }) {
  const workspace = useOptionalOperationalWorkspace();
  return workspace ? <><OperationalHeaderActions><Link href="/portal">Portal institucional</Link><Link href="/portal-servidor/seguranca">Minha senha</Link></OperationalHeaderActions>{children}</> : <EmployeePortalShell institutionName={institutionName} userName={userName}>{children}</EmployeePortalShell>;
}
