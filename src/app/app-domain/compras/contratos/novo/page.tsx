import { FileText, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { db } from "@/db/client";
import { loadContractFormSelectors, loadContractOptions } from "@/db/repositories/procurement/instruments";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import ContratoForm from "../ContratoForm";

export const dynamic = "force-dynamic";

export default async function NovoContratoPage() {
  const context = await getTenantContextForModuleOperation("COMPRAS", "create");
  const database = context.database ?? db;
  const [{ processos, secretarias, unidadesGestoras, fornecedores }, governanceOptions] =
    await Promise.all([
      loadContractOptions(database),
      loadContractFormSelectors(database),
    ]);

  return (
    <PageFrame className="flex h-[calc(100vh-4rem)] max-w-5xl min-h-0 flex-col gap-2 overflow-hidden">
      <PageHeader
        title="Formalizar Novo Contrato"
        className="mb-0 shrink-0"
        icon={<FileText className="size-4 shrink-0 text-indigo-600" />}
        action={
          <Link
            href="/compras/contratos"
            className="inline-flex min-h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:h-7 sm:min-h-0"
          >
            <ArrowLeft className="size-3.5" />
            Voltar
          </Link>
        }
      />

      <ContratoForm
        processos={processos}
        secretarias={secretarias}
        unidadesGestoras={unidadesGestoras}
        fornecedores={fornecedores}
        governanceOptions={governanceOptions}
      />
    </PageFrame>
  );
}
