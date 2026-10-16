import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { portalPppReport } from "./closure-service";
import { missingPeriods } from "./closure-policy";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import type { FunctionalDocumentInput, DocumentLayoutPolicy } from "@/lib/portal-servidor/document-policy";
import type { FunctionalDocumentSource } from "@/lib/portal-servidor/document-sources";
import type { HistoricalTechnicalResponsibility } from "./functional-policy";

export const pppTechnicalSchema = z.object({
  employeeId: z.string().min(1), budgetUnitId: z.string().min(1), from: z.iso.date(), until: z.iso.date(), proofVersionId: z.string().min(1),
  nit: z.string().regex(/^\d{11}$/), cnae: z.string().min(1), establishmentAddress: z.string().trim().min(5).max(1000),
  occupations: z.array(z.object({ functionalPeriodId: z.string().min(1), cbo: z.string().min(1), activities: z.string().trim().min(10).max(8000) }).strict()).min(1),
  groups: z.array(z.object({ programGroupId: z.string().min(1), programVersion: z.number().int().positive(), risks: z.array(z.object({ sourceRiskIndex: z.number().int().min(0), type: z.string().min(1), code: z.string().min(1), agent: z.string().min(1), intensity: z.string().min(1), unit: z.string().min(1), technique: z.string().min(1), epcEffective: z.boolean(), epiEffective: z.boolean(), ca: z.array(z.string().min(1)), legalReference: z.string().min(3) }).strict()) }).strict()).min(1),
}).strict().refine(value => value.until >= value.from && new Set(value.occupations.map(row => row.functionalPeriodId)).size === value.occupations.length && new Set(value.groups.map(row => row.programGroupId)).size === value.groups.length, "Período ou fontes PPP duplicadas.");

export async function approvePppTechnicalData(context: AppContext, raw: unknown) {
  const input = pppTechnicalSchema.parse(raw);
  if (!canPerformModuleOperation(context.user, "SST", "update") || !canPerformModuleOperation(context.user, "SST", "issueReports")) throw new AccessError("Reconhecimento PPP exige autorização técnica SST.", 403);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PPP:TECNICO:${input.employeeId}:${input.budgetUnitId}:${input.from}:${input.until}`}))`;
    const proof = await tx.documentVersion.findFirst({ where: { id: input.proofVersionId, status: "SIGNED", document: { status: { in: ["Válido", "Assinado"] } } }, select: { hashSha256: true } });
    if (!proof) throw new Error("Dados complementares PPP exigem laudo/documento de origem assinado no GED.");
    for (const occupation of input.occupations) {
      const [period] = await tx.$queryRaw<{ id: string }[]>`SELECT p.id FROM "HrEmployeeFunctionalPeriod" p WHERE p.id=${occupation.functionalPeriodId} AND p."employeeId"=${input.employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND NOT p.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`;
      if (!period) throw new Error("Período funcional PPP não pertence ao titular/UG ou foi substituído.");
    }
    for (const group of input.groups) {
      const source = await tx.sstProgramExposureGroup.findFirst({ where: { id: group.programGroupId, program: { budgetUnitId: input.budgetUnitId, kind: "LTCAT", version: group.programVersion } }, select: { risks: true } });
      if (!source || !Array.isArray(source.risks) || source.risks.length !== group.risks.length || new Set(group.risks.map(risk => risk.sourceRiskIndex)).size !== group.risks.length || group.risks.some(risk => risk.sourceRiskIndex >= (source.risks as unknown[]).length || risk.epiEffective && !risk.ca.length)) throw new Error("Medições/agentes PPP devem corresponder a todos os riscos da versão LTCAT, com CA quando houver eficácia de EPI.");
    }
    const event = await enqueueHrIntegration(tx, { sourceKey: `PPP:TECNICO:${input.employeeId}:${input.budgetUnitId}:${input.from}:${input.until}:${input.proofVersionId}`, domain: "SST", environment: "INTERNO", eventType: "PPP_DADOS_TECNICOS_RECONHECIDOS", payload: { ...input, proofHash: proof.hashSha256, recognizedBy: context.user.id } });
    if (["REVOGADO", "SUPERADO"].includes(event.status)) throw new Error("Fonte técnica revogada/substituída exige nova versão assinada.");
    await tx.hrIntegrationEvent.updateMany({ where: { id: { not: event.id }, eventType: "PPP_DADOS_TECNICOS_RECONHECIDOS", status: "PROCESSADO", AND: [{ payload: { path: ["employeeId"], equals: input.employeeId } }, { payload: { path: ["budgetUnitId"], equals: input.budgetUnitId } }, { payload: { path: ["from"], equals: input.from } }, { payload: { path: ["until"], equals: input.until } }] }, data: { status: "SUPERADO" } });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    return event.id;
  });
}

export async function buildOwnFinalPppSource(context: AppContext, input: FunctionalDocumentInput, policy: DocumentLayoutPolicy): Promise<FunctionalDocumentSource> {
  const exclusiveUntil = new Date(new Date(`${input.until}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  const raw = { budgetUnitId: policy.budgetUnitId, from: input.from, until: exclusiveUntil };
  const first = await portalPppReport(context, raw);
  if (first.missingHistory.length || first.missingLtcat.length) throw new Error("Complete a história funcional e LTCAT do intervalo antes do PPP oficial.");
  const periods = [...first.periods], exposures = [...first.exposures];
  for (let page = 2; page <= Math.ceil(first.historyTotal / 20); page++) {
    const next = await portalPppReport(context, raw, page);
    if (next.historyTotal !== first.historyTotal) throw new Error("História PPP alterada durante a emissão.");
    periods.push(...next.periods); exposures.push(...next.exposures);
  }
  if (new Set(periods.map(period => period.id)).size !== first.historyTotal) throw new Error("História PPP inconsistente durante emissão.");
  const records = await context.prisma.hrIntegrationEvent.findMany({ where: { domain: "SST", eventType: "PPP_DADOS_TECNICOS_RECONHECIDOS", status: "PROCESSADO", payload: { path: ["employeeId"], equals: context.user.employeeId! } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const schema = pppTechnicalSchema.safeExtend({ proofHash: z.string() });
  const technical = records.map(record => ({ ...schema.parse(record.payload), technicalSourceId: record.id })).find(record => record.budgetUnitId === policy.budgetUnitId && record.from === input.from && record.until === input.until);
  if (!technical) throw new Error("Reconheça CBO, atividades e agentes/medições PPP com comprovação técnica assinada.");
  const selectedExposures = exposures.filter(exposure => technical.groups.some(group => group.programGroupId === exposure.programGroupId && group.programVersion === exposure.version));
  const selectedGroups = await context.prisma.sstProgramExposureGroup.findMany({ where: { id: { in: selectedExposures.map(exposure => exposure.programGroupId) } }, select: { id: true, groupId: true } });
  if (selectedExposures.some((exposure, index) => selectedExposures.slice(index + 1).some(other => other.functionalPeriodId === exposure.functionalPeriodId && other.programId !== exposure.programId && selectedGroups.find(group => group.id === other.programGroupId)?.groupId === selectedGroups.find(group => group.id === exposure.programGroupId)?.groupId && other.startsAt < exposure.endsAt && other.endsAt > exposure.startsAt))) throw new Error("Reconheça uma única versão LTCAT por GHE e intervalo; versões concorrentes não podem compor o PPP definitivo.");
  for (const period of periods) {
    const begin = new Date(Math.max(period.startsAt.getTime(), first.input.from.getTime())), end = new Date(Math.min(period.endsAt.getTime(), first.input.until.getTime()));
    if (missingPeriods(begin, end, selectedExposures.filter(exposure => exposure.functionalPeriodId === period.id)).length) throw new Error("As versões LTCAT tecnicamente reconhecidas não cobrem todo o período funcional.");
  }
  if (!await context.prisma.documentVersion.findFirst({ where: { id: technical.proofVersionId, hashSha256: technical.proofHash, status: "SIGNED", document: { status: { in: ["Válido", "Assinado"] } } }, select: { id: true } })) throw new Error("Laudo técnico PPP revogado ou indisponível.");
  const responsibilities = await context.prisma.$queryRaw<HistoricalTechnicalResponsibility[]>`SELECT r.*,v."createdAt" AS "revokedAt",LEAST(r."endsAt",COALESCE(v."createdAt",r."endsAt")) AS "effectiveEndsAt" FROM "SstTechnicalResponsibility" r LEFT JOIN "SstFoundationalRevocation" v ON v."responsibilityId"=r.id WHERE r."budgetUnitId"=${policy.budgetUnitId} AND r.kind='ENVIRONMENTAL' AND r."startsAt"<${first.input.until} AND LEAST(r."endsAt",COALESCE(v."createdAt",r."endsAt"))>${first.input.from} ORDER BY r.id`;
  const rows: string[][] = [["ESTABELECIMENTO", policy.issuerCnpj, technical.cnae, technical.establishmentAddress], ["IDENTIFICAÇÃO", "NIT", technical.nit, ""]];
  for (const period of periods) {
    const occupation = technical.occupations.find(row => row.functionalPeriodId === period.id);
    if (!occupation) throw new Error("CBO/atividades ausentes para período funcional PPP.");
    rows.push(["PROFISSIOGRAFIA", `${period.startsAt.toISOString()} a ${period.endsAt.toISOString()} (fim exclusivo)`, occupation.cbo, `${String(period.snapshot.role || "")} · ${occupation.activities}`]);
  }
  for (const exposure of selectedExposures) {
    const group = technical.groups.find(row => row.programGroupId === exposure.programGroupId && row.programVersion === exposure.version);
    if (!group) throw new Error("Agentes/medições não correspondem à versão ambiental aplicável.");
    const nativeGroup = await context.prisma.sstProgramExposureGroup.findUniqueOrThrow({ where: { id: exposure.programGroupId }, select: { groupId: true } });
    const responsible = responsibilities.filter(row => !row.groupId || row.groupId === nativeGroup.groupId);
    if (missingPeriods(exposure.startsAt, exposure.endsAt, responsible.map(row => ({ startsAt: row.startsAt, endsAt: row.effectiveEndsAt }))).length) throw new Error("Responsabilidade técnica ambiental não cobre todo o período PPP.");
    for (const risk of group.risks) rows.push(["EXPOSIÇÃO", `${exposure.startsAt.toISOString()} a ${exposure.endsAt.toISOString()}`, `${risk.type} · ${risk.code} · ${risk.agent}`, `${risk.intensity} ${risk.unit} · técnica ${risk.technique} · EPC ${risk.epcEffective ? "eficaz" : "não eficaz"} · EPI ${risk.epiEffective ? "eficaz" : "não eficaz"} · CA ${risk.ca.join(", ")} · ${risk.legalReference}`]);
    for (const person of responsible) rows.push(["RESPONSÁVEL", person.snapshot.personName, person.snapshot.council, person.snapshot.sourceReference]);
  }
  return { fields: { matricula: [...new Set(periods.map(period => String(period.snapshot.registration || "")).filter(Boolean))].join(" · ") }, headers: ["Grupo", "Identificação / período", "Código / registro", "Informações de origem"], rows, snapshot: { periods, exposures: selectedExposures, technical, responsibilities, sourceComplete: true } };
}
