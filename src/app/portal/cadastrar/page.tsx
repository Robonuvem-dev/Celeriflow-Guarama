import Link from "next/link";
import { CitizenRegistration } from "@/components/auth/CitizenRegistration";

export default function CitizenRegistrationPage() {
  return <main className="mx-auto max-w-xl space-y-5 px-4 py-10"><h1 className="text-3xl font-bold">Solicitar acesso ao Autoatendimento</h1><p className="text-sm leading-6 text-slate-600">Use uma conta verificada e solicite a conferência do seu vínculo municipal. Guarde o protocolo da solicitação.</p><CitizenRegistration /><Link href="/portal/entrar" className="text-sm font-semibold text-emerald-800 underline">Entrar com acesso já autorizado</Link></main>;
}
