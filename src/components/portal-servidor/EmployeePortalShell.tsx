"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "firebase/auth";
import { BadgeCheck, LogOut } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { portalServidorNavigation } from "@/app/app-domain/portal-servidor/navigation";

export function EmployeePortalShell({ children, institutionName, userName }: { children: React.ReactNode; institutionName: string; userName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/session/logout", { method: "POST" });
      if (!response.ok) throw new Error("Não foi possível encerrar a sessão. Tente novamente.");
      await signOut(auth);
      router.replace("/portal-servidor/entrar");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível encerrar a sessão.");
    } finally { setPending(false); }
  }
  return <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-100 text-slate-900">
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-white px-3 py-2 sm:px-5">
      <div className="flex min-w-0 items-center gap-2"><BadgeCheck className="size-5 shrink-0 text-emerald-700" aria-hidden="true" /><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{institutionName}</p><p className="truncate text-[11px] text-slate-500">Portal do Servidor · {userName}</p></div></div>
      <nav aria-label="Conta funcional" className="flex items-center gap-3 text-xs font-semibold"><Link href="/portal" className="text-slate-600 hover:underline">Portal institucional</Link><Link href="/portal-servidor/seguranca" className="text-slate-600 hover:underline">Minha senha</Link><button type="button" onClick={logout} disabled={pending} className="inline-flex h-7 items-center gap-1.5 rounded border border-slate-300 px-2 hover:bg-slate-50 disabled:opacity-50"><LogOut className="size-3.5" />{pending ? "Saindo…" : "Sair"}</button></nav>
    </header>
    {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">{error}</p>}
    <div className="flex min-h-0 flex-1 overflow-hidden p-2 sm:p-3"><ModuleShell moduleTitle="Portal do Servidor" moduleCaption="Autosserviço funcional" moduleIcon="badgeCheck" navigation={portalServidorNavigation} backHref="/portal" backLabel="Portal institucional">{children}</ModuleShell></div>
  </div>;
}
