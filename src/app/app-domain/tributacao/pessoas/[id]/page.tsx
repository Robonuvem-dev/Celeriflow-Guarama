import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { FiscalRecordWorkspace } from "../../cadastros-fiscais/FiscalRecordWorkspace";
import { getFiscalRegistryWorkspaceData } from "../../cadastros-fiscais/data";
import { db } from "@/db/client";
import { readFiscalTaxpayerCard } from "@/db/repositories/taxation-pages/cadastral-details";

export const dynamic = "force-dynamic";

export default async function PessoaFiscalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("TRIBUTACAO"); const database = context.database ?? db;
  const taxpayer = await readFiscalTaxpayerCard(database, id);
  if (!taxpayer) notFound();
  const workspace = await getFiscalRegistryWorkspaceData(database, "TAXPAYER", id);
  const name = taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? "Cadastro fiscal";
  const document = taxpayer.company?.cnpj ?? taxpayer.person?.cpf ?? "Não informado";
  const links = [
    ...taxpayer.economicRegistrations.map((item) => ({ label: `Inscrição ${item.municipalInsc}`, href: `/tributacao/economico/${item.id}`, description: item.status })),
    ...taxpayer.realEstates.map((item) => ({ label: `Imóvel ${item.municipalInsc ?? item.registration ?? item.id}`, href: `/tributacao/imoveis/${item.id}`, description: item.status })),
    ...taxpayer.taxCaseLinks.flatMap((item) => item.processId ? [{ label: "Processo vinculado", href: `/protocolos/processos/${item.processId}`, description: item.purpose ?? undefined }] : []),
  ];
  return <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5"><ErpPageTitle title={name} description={`${document} · ${taxpayer.municipalInsc ?? "sem inscrição fiscal"}`} icon={<UserRound className="size-4 text-emerald-600" />} action={<Link href="/tributacao/pessoas" className="inline-flex h-7 items-center gap-1 rounded border bg-white px-2 text-xs font-semibold"><ArrowLeft className="size-3.5" />Voltar</Link>} /><FiscalRecordWorkspace entityType="TAXPAYER" entityId={id} entries={workspace.entries} links={links} processes={workspace.processes} documents={workspace.documents} /></div>;
}

