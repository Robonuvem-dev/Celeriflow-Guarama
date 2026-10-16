import Link from "next/link";
import type { PrismaClient } from "@prisma/client";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxAssessmentAccessFilter, taxScopeSnapshot } from "@/lib/tributacao/scope";

export default async function EconomicProcesses({ prisma, registrationId }: { prisma: PrismaClient; registrationId: string }) {
  const { user } = await getTenantContextForModule("TRIBUTACAO");
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const profile = await prisma.taxRegistryEntry.findFirst({ where: { entityType: "ECONOMIC_REGISTRATION", entityId: registrationId, category: "ECONOMIC_PROFILE" }, orderBy: { version: "desc" } });
  const origin = taxScopeSnapshot(profile?.data);
  if (!origin.budgetUnitId || !origin.governmentEntityId || allowed && !allowed.includes(String(origin.budgetUnitId))) return null;
  const [assessments, licenses] = await Promise.all([
    prisma.taxAssessment.findMany({ where: { economicRegistrationId: registrationId, AND: [taxAssessmentAccessFilter([String(origin.budgetUnitId)]), { calculationSnapshot: { path: ["governmentEntityId"], equals: origin.governmentEntityId } }] }, select: { id: true } }),
    prisma.license.findMany({ where: { economicRegistrationId: registrationId }, select: { id: true } }),
  ]);
  const assessmentIds = assessments.map(row => row.id);
  const licenseIds = licenses.map(row => row.id);
  const links = [{ entityType: "ECONOMIC_REGISTRATION", entityId: registrationId }, ...assessmentIds.map(entityId => ({ entityType: "TAX_ASSESSMENT", entityId })), ...licenseIds.map(entityId => ({ entityType: "LICENSE", entityId }))];
  const [entries, cases, requests] = await Promise.all([
    prisma.taxRegistryEntry.findMany({ where: { OR: links, processId: { not: null }, AND: [{ data: { path: ["budgetUnitId"], equals: origin.budgetUnitId } }, { data: { path: ["governmentEntityId"], equals: origin.governmentEntityId } }] }, select: { processId: true } }),
    prisma.taxCaseLink.findMany({ where: { OR: links, processId: { not: null } }, select: { processId: true } }),
    prisma.taxServiceRequest.findMany({ where: { OR: [{ assessmentId: { in: assessmentIds } }, { licenseId: { in: licenseIds } }], processId: { not: null } }, select: { processId: true } }),
  ]);
  const processIds = [...new Set([...entries, ...cases, ...requests].flatMap(row => row.processId ? [row.processId] : []))];
  const processes = await prisma.process.findMany({ where: { id: { in: processIds } }, include: { processType: true, subject: true, currentDepartment: { select: { name: true } }, _count: { select: { movements: true, documents: true, dispatches: true } } }, orderBy: { createdAt: "desc" } });
  return <section className="max-h-64 shrink-0 space-y-2 overflow-auto rounded border bg-white p-3 text-xs"><h2 className="font-semibold">Processos vinculados à inscrição · todos os exercícios ({processes.length})</h2>{!processes.length && <p>Nenhum protocolo explicitamente vinculado à inscrição, seus lançamentos ou alvarás.</p>}{processes.map(process => <article key={process.id} className="rounded border p-2"><Link href={`/protocolos/processos/${process.id}`} className="font-semibold text-emerald-700 underline">{process.protocolNumber} · {process.status}</Link><p>{process.processType.name} · {process.subject.name} · aberto em {process.createdAt.toLocaleDateString("pt-BR")}</p><p>{process.description}</p><p>Setor: {process.currentDepartment?.name ?? "Não informado"} · {process._count.movements} trâmites · {process._count.documents} anexos · {process._count.dispatches} pareceres/despachos</p></article>)}</section>;
}
