import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertPropertyCadastralAccess } from "@/lib/tributacao/property-access";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { FiscalRecordWorkspace } from "../../cadastros-fiscais/FiscalRecordWorkspace";
import { getFiscalRegistryWorkspaceData } from "../../cadastros-fiscais/data";
import { PropertyCadastralTools } from "./PropertyCadastralTools";
import PropertyHistory from "./PropertyHistory";
import PropertyStructure from "./PropertyStructure";
import { db, databaseConnection } from "@/db/client";
import { readFiscalPropertyCard } from "@/db/repositories/taxation-pages/cadastral-details";
import { listFiscalProperties } from "@/db/repositories/taxation-pages/lookups";

export const dynamic = "force-dynamic";

export default async function RealEstateDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ at?: string }> }) {
  const { id } = await params;
  const { at } = await searchParams;
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  await assertPropertyCadastralAccess(database, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, id);
  const estate = await readFiscalPropertyCard(database, id);
  if (!estate) notFound();
  const [workspace, estateOptions] = await Promise.all([getFiscalRegistryWorkspaceData(database, "REAL_ESTATE", id), listFiscalProperties(database, { order: true })]);
  const owner = estate.taxpayer?.company?.corporateName ?? estate.taxpayer?.person?.fullName ?? "Sem titular vinculado";
  const structure = <PropertyStructure database={databaseConnection} actor={{ usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }} id={id}/>;
  const links = [{ label: "Perfil imobiliário completo", href: `/tributacao/imoveis/${id}/perfil`, description: "Inscrição, terreno/unidade/rural, coproprietários, correspondência e mapa" }, { label: "Bloqueio e liberação de alterações", href: `/tributacao/imoveis/${id}/bloqueio`, description: "Controle pelo supervisor administrativo" }, ...(estate.taxpayer ? [{ label: owner, href: `/tributacao/pessoas/${estate.taxpayer.id}`, description: "Cadastro fiscal" }, ...estate.taxpayer.economicRegistrations.map((item) => ({ label: `Inscrição ${item.municipalInsc}`, href: `/tributacao/economico/${item.id}`, description: "Unidade econômica relacionada" }))] : [])];
  return <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
    <ErpPageTitle title={`Ficha do imóvel ${estate.municipalInsc ?? estate.registration ?? ""}`} description={`${estate.propertyType ?? "Imóvel"} · ${estate.streetName ?? "endereço não informado"}, ${estate.number ?? "s/n"} · ${owner}`} icon={<Home className="size-4 text-emerald-600" />} action={<div className="flex items-center gap-2"><PropertyCadastralTools estateId={id} landArea={estate.landArea ?? 0} builtArea={estate.builtArea ?? 0} estates={estateOptions.map((item) => ({ id: item.id, label: item.municipalInsc ?? item.registration ?? item.streetName ?? item.id }))} /><Link href="/tributacao/imoveis" className="inline-flex h-7 items-center gap-1 rounded border bg-white px-2 text-xs font-semibold"><ArrowLeft className="size-3.5" />Voltar</Link></div>} />
    {structure}<PropertyHistory database={database} id={id} at={at} /><FiscalRecordWorkspace entityType="REAL_ESTATE" entityId={id} entries={workspace.entries} links={links} processes={workspace.processes} documents={workspace.documents} />
  </div>;
}

