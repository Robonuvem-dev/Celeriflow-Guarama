import { ArrowLeft, UserRound } from "lucide-react";
import Link from "next/link";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import NovaPessoaFisicaForm from "./NovaPessoaFisicaForm";

export default function NovaPessoaFisicaPage() {
  return (
    <PageFrame className="max-w-4xl space-y-4">
      <PageHeader
        title="Nova Pessoa Física"
        icon={<UserRound className="size-4 shrink-0 text-[#0e4c7e]" />}
        action={
          <Link
            href="/cadastros/pessoas-fisicas"
            className="inline-flex h-7 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="size-3.5" />
            Voltar
          </Link>
        }
      />
      <NovaPessoaFisicaForm />
    </PageFrame>
  );
}
