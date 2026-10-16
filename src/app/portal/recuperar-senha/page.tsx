import Link from "next/link";
import { CitizenPasswordRecovery } from "@/components/auth/CitizenPasswordRecovery";

export default function RecoveryPage() { return <main className="mx-auto max-w-md space-y-5 px-4 py-10"><h1 className="text-2xl font-bold">Recuperar senha</h1><CitizenPasswordRecovery /><Link href="/portal/entrar" className="text-sm font-semibold text-emerald-800 underline">Voltar ao login</Link></main>; }
