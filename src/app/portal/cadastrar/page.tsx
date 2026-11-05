import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { CitizenRegistration } from "@/components/auth/CitizenRegistration";

export default function CitizenRegistrationPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0e4c7e]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0e4c7e]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Portal de Autoatendimento Municipal
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Solicitar ou Consultar Acesso ao Autoatendimento
        </h1>
        <p className="text-sm leading-6 text-slate-600">
          Selecione abaixo a forma de acesso desejada (conta existente, criação de nova conta, Conta Google ou consulta de protocolo). Guarde o número do protocolo gerado.
        </p>
      </div>

      <CitizenRegistration />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm shadow-2xs">
        <span className="text-slate-600">Já possui vínculo conferido e autorizado pelo município?</span>
        <Link
          href="/portal/entrar"
          className="inline-flex items-center gap-1.5 font-bold text-[#0e4c7e] hover:underline"
        >
          <ArrowLeft className="h-4 w-4 rotate-180" />
          Entrar com acesso já autorizado
        </Link>
      </div>
    </main>
  );
}
