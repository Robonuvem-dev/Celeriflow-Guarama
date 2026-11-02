import { PasswordRecoveryForm } from "./PasswordRecoveryForm";
import { Suspense } from "react";

export default function EmployeePasswordRecoveryPage() {
  return <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-8"><Suspense fallback={<p>Carregando…</p>}><PasswordRecoveryForm /></Suspense></main>;
}
