import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalRows } from "@/db/repositories/portal-servidor/records";
import { portalEmployeeProfile } from "@/db/repositories/portal-servidor/profile";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listMyRecertificationCampaigns } from "@/lib/rh/recertification";
import { recertificationDetailsSchema, type RecertificationDetails } from "@/lib/rh/recertification-details";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { ProposalForm } from "./ProposalForm";

export const dynamic = "force-dynamic";
export default async function RecertificationPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const executor = access.context.database ?? db;
  const employee = await portalEmployeeProfile(executor, access.employee.id);
  if (!employee) throw new Error("Registro não encontrado.");
  if (!employee.person) return <p className="p-4">Vinculação ao Cadastro Único pendente.</p>;
  const campaigns = await listMyRecertificationCampaigns(executor, employee.id);
  const documentRows = await portalRows<{ id: string; versionNumber: number; title: string }>(executor, sql`SELECT v.id,v."versionNumber",d.title FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.status IN ('FINAL','SIGNED') AND d."personId"=${employee.person.id} AND d.status='Válido' ORDER BY v."createdAt" DESC,v.id`);
  const documents = documentRows.map(({ title, ...row }) => ({ ...row, document: { title } }));
  const page = Math.min(Math.max(1, Number.parseInt((await searchParams).page || "1") || 1), Math.max(1, Math.ceil(campaigns.length / 20))), now = new Date();
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Recadastramento" description="Propostas e comprovação aplicadas ao Cadastro Único somente após conferência e deferimento do RH." action={<Link href="/portal-servidor/solicitacoes-rh">Meus pedidos</Link>} />
    {campaigns.slice((page - 1) * 20, page * 20).map(campaign => {
      const payload = campaign.request?.payload as { proposal?: Record<string, string>; details?: unknown } | undefined;
      const saved = recertificationDetailsSchema.safeParse(payload?.details);
      const details: RecertificationDetails = saved.success ? saved.data : {
        addresses: campaign.sections.includes("ENDERECOS") ? employee.person!.addresses.map(row => ({ id: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), zipCode: row.zipCode || "", streetName: row.streetName || "", number: row.number || "", complement: row.complement || "", referencePoint: row.referencePoint || "", addressType: row.addressType || "Residencial", zone: row.zone || "", neighborhoodId: row.neighborhoodId })) : [],
        dependents: campaign.sections.includes("DEPENDENTES") ? employee.dependents.filter(row => row.cpf && row.birthDate).map(row => ({ id: row.id, expectedUpdatedAt: row.updatedAt.toISOString(), cpf: row.cpf!, name: row.name, birthDate: row.birthDate!.toISOString().slice(0, 10), relationship: row.relationship, irrfDependent: row.irrfDependent, familyWage: row.familyWage })) : [], previousEmployment: [], documentVersionIds: [],
      };
      // Corrections use the current canonical version; the superseded proposal remains in audit history.
      details.addresses = details.addresses.map(row => ({ ...row, expectedUpdatedAt: row.id ? employee.person!.addresses.find(address => address.id === row.id)?.updatedAt.toISOString() || row.expectedUpdatedAt : undefined }));
      details.dependents = details.dependents.map(row => ({ ...row, expectedUpdatedAt: row.id ? employee.dependents.find(dependent => dependent.id === row.id)?.updatedAt.toISOString() || row.expectedUpdatedAt : undefined }));
      const canReply = (!campaign.request || campaign.request.status === "PENDENTE_CORRECAO") && now >= new Date(campaign.startsAt) && now <= new Date(campaign.endsAt);
      return <section key={campaign.id} className="rounded border bg-white p-3 text-xs"><h2 className="text-sm font-semibold">{campaign.name}</h2><p>{new Date(campaign.startsAt).toLocaleString("pt-BR")} até {new Date(campaign.endsAt).toLocaleString("pt-BR")}</p><p className="mt-2 whitespace-pre-wrap">{campaign.instructions}</p>{campaign.request && <p className="mt-2 whitespace-pre-wrap font-semibold">{campaign.request.status} · {campaign.request.decision || "Aguardando análise do RH"}</p>}{canReply ? <ProposalForm key={`${campaign.id}:${campaign.request?.decidedAt?.toISOString() || "new"}`} campaignRuleId={campaign.id} sections={campaign.sections} canUpload={Boolean(campaign.evidenceDocumentClassCode)} initialDetails={details} documents={documents.map(document => ({ id: document.id, title: `${document.document.title} · versão ${document.versionNumber}` }))} values={Object.fromEntries(campaign.fields.map(field => [field, payload?.proposal?.[field] ?? employee.person![field] ?? ""]))} /> : !campaign.request && <p>Fora do período de resposta.</p>}</section>;
    })}
    {!campaigns.length && <p className="text-sm">Nenhuma campanha atribuída ao seu cadastro.</p>}
    <ErpPagination page={page} total={campaigns.length} pageSize={20} label="campanhas" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} />
  </div>;
}
