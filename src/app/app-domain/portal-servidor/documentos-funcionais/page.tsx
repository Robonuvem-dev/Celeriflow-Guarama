import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalEvents, portalRows } from "@/db/repositories/portal-servidor/records";
import { portalStatements } from "@/db/repositories/portal-servidor/payroll";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { generatedArtifactSchema, listOwnDocumentModels } from "@/lib/portal-servidor/generated-documents";
import { ownReleasedStatementIds } from "@/lib/portal-servidor/payroll-publication";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { FunctionalEmissionForm } from "./EmissionForm";
export const dynamic = "force-dynamic";
export default async function FunctionalDocumentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const models = await listOwnDocumentModels(access.context);
  const executor = access.context.database ?? db;
  const contracts = await portalRows<{ id: string; registration: string; status: string }>(executor, sql`SELECT id,registration,status FROM "HrEmploymentContract" WHERE "employeeId"=${access.employee.id} ORDER BY registration`);
  const ids = await ownReleasedStatementIds(executor, access.employee.id);
  const statements = await portalStatements(executor, sql`s.id=ANY(${sql.param(ids)}::text[]) AND p.type IN ('Férias','Rescisão')`);
  const supplierRows = await portalRows<{ id: string; companyId: string | null; corporateName: string | null; personId: string | null; fullName: string | null }>(executor, sql`SELECT s.id,c.id AS "companyId",c."corporateName",p.id AS "personId",p."fullName" FROM "Supplier" s LEFT JOIN "Company" c ON c.id=s."companyId" LEFT JOIN "Person" p ON p.id=s."personId" WHERE s.id=ANY(${sql.param([...new Set(models.flatMap(model => model.policy.supplierIds))])}::text[]) AND s.status='Ativo'`);
  const suppliers = supplierRows.map(row => ({ id: row.id, company: row.companyId ? { corporateName: row.corporateName! } : null, person: row.personId ? { fullName: row.fullName! } : null }));
  const rows = await portalEvents(executor, sql`"eventType"='DOCUMENTO_FUNCIONAL_GERADO' AND payload->>'employeeId'=${access.employee.id}`);
  const page = Math.min(Math.max(1, Number.parseInt((await searchParams).page || "1") || 1), Math.max(1, Math.ceil(rows.length / 20)));
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Documentos financeiros e declarações" description="Documentos gerados das fontes RH/Folha/SST, nos modelos e autoridades configurados pela entidade." /><FunctionalEmissionForm initialKey={randomUUID()} models={models.map(model => ({ id: model.id, name: model.name, kinds: model.policy.kinds }))} contracts={contracts.map(contract => ({ id: contract.id, label: `${contract.registration} · ${contract.status}` }))} statements={statements.map(statement => ({ id: statement.id, label: `${statement.run.payroll.type} · ${statement.run.payroll.competence} · ${statement.id}` }))} suppliers={suppliers.map(supplier => ({ id: supplier.id, label: supplier.company?.corporateName || supplier.person?.fullName || supplier.id }))} />{!models.length && <p className="text-sm">O RH ainda não publicou modelos de geração para sua unidade/história funcional.</p>}<h2 className="text-sm font-semibold">Minhas emissões registradas</h2>{rows.slice((page - 1) * 20, page * 20).map(row => { const artifact = generatedArtifactSchema.parse(row.payload); return <article key={row.id} className="rounded border bg-white p-3 text-xs"><h3 className="font-semibold">{artifact.policy.title}</h3><p>{artifact.issuedAt.slice(0, 10)} · {row.status}{artifact.expiresAt ? ` · validade ${artifact.expiresAt.slice(0, 10)}` : ""}</p>{row.status !== "REVOGADO" && <a href={`/api/portal-servidor/documentos-funcionais/${row.id}`} className="mt-2 inline-block font-semibold text-emerald-800 underline">Consultar versão / assinatura</a>}</article>; })}<ErpPagination page={page} total={rows.length} pageSize={20} label="emissões" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} /></div>;
}
