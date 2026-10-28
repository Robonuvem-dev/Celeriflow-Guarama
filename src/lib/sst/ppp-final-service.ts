import { z } from "zod";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { sstProgramGroups, sstPrograms } from "@/db/schema/sst-programs";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { sstRows } from "@/db/repositories/sst/sql";
import { readSstHistoricalResponsibilities } from "@/db/repositories/sst/functional";
import { sstContextConnection, sstDatabase } from "./database";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { portalPppReport } from "./closure-service";
import { missingPeriods } from "./closure-policy";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import type { FunctionalDocumentInput, DocumentLayoutPolicy } from "@/lib/portal-servidor/document-policy";
import type { FunctionalDocumentSource } from "@/lib/portal-servidor/document-sources";

export const pppTechnicalSchema = z.object({
  employeeId: z.string().min(1), budgetUnitId: z.string().min(1), from: z.iso.date(), until: z.iso.date(), proofVersionId: z.string().min(1),
  nit: z.string().regex(/^\d{11}$/), cnae: z.string().min(1), establishmentAddress: z.string().trim().min(5).max(1000),
  occupations: z.array(z.object({ functionalPeriodId: z.string().min(1), cbo: z.string().min(1), activities: z.string().trim().min(10).max(8000) }).strict()).min(1),
  groups: z.array(z.object({ programGroupId: z.string().min(1), programVersion: z.number().int().positive(), risks: z.array(z.object({ sourceRiskIndex: z.number().int().min(0), type: z.string().min(1), code: z.string().min(1), agent: z.string().min(1), intensity: z.string().min(1), unit: z.string().min(1), technique: z.string().min(1), epcEffective: z.boolean(), epiEffective: z.boolean(), ca: z.array(z.string().min(1)), legalReference: z.string().min(3) }).strict()) }).strict()).min(1),
}).strict().refine(value => value.until >= value.from && new Set(value.occupations.map(row => row.functionalPeriodId)).size === value.occupations.length && new Set(value.groups.map(row => row.programGroupId)).size === value.groups.length, "Período ou fontes PPP duplicadas.");

export async function approvePppTechnicalData(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = pppTechnicalSchema.parse(raw);
  if (!canPerformModuleOperation(context.user, "SST", "update") || !canPerformModuleOperation(context.user, "SST", "issueReports")) throw new AccessError("Reconhecimento PPP exige autorização técnica SST.", 403);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PPP:TECNICO:${input.employeeId}:${input.budgetUnitId}:${input.from}:${input.until}`}))`);
    const [proof] = await sstRows<{ hashSha256: string }>(tx, sql`SELECT v."hashSha256" FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.id=${input.proofVersionId} AND v.status='SIGNED' AND d.status IN ('Válido','Assinado') LIMIT 1`);
    if (!proof) throw new Error("Dados complementares PPP exigem laudo/documento de origem assinado no GED.");
    for (const occupation of input.occupations) {
      const [period] = await sstRows<{ id: string }>(tx, sql`SELECT p.id FROM "HrEmployeeFunctionalPeriod" p WHERE p.id=${occupation.functionalPeriodId} AND p."employeeId"=${input.employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND NOT p.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`);
      if (!period) throw new Error("Período funcional PPP não pertence ao titular/UG ou foi substituído.");
    }
    for (const group of input.groups) {
      const [source] = await tx.select({ risks: sstProgramGroups.risks }).from(sstProgramGroups).innerJoin(sstPrograms, eq(sstPrograms.id, sstProgramGroups.programId)).where(and(eq(sstProgramGroups.id, group.programGroupId), eq(sstPrograms.budgetUnitId, input.budgetUnitId), eq(sstPrograms.kind, "LTCAT"), eq(sstPrograms.version, group.programVersion))).limit(1);
      const riskCount = Array.isArray(source?.risks) ? source.risks.length : -1;
      if (riskCount < 0 || riskCount !== group.risks.length || new Set(group.risks.map(risk => risk.sourceRiskIndex)).size !== group.risks.length || group.risks.some(risk => risk.sourceRiskIndex >= riskCount || risk.epiEffective && !risk.ca.length)) throw new Error("Medições/agentes PPP devem corresponder a todos os riscos da versão LTCAT, com CA quando houver eficácia de EPI.");
    }
    const event = await enqueueHrIntegration(tx, { sourceKey: `PPP:TECNICO:${input.employeeId}:${input.budgetUnitId}:${input.from}:${input.until}:${input.proofVersionId}`, domain: "SST", environment: "INTERNO", eventType: "PPP_DADOS_TECNICOS_RECONHECIDOS", payload: { ...input, proofHash: proof.hashSha256, recognizedBy: context.user.id } });
    if (["REVOGADO", "SUPERADO"].includes(event.status)) throw new Error("Fonte técnica revogada/substituída exige nova versão assinada.");
    await tx.update(hrIntegrationEvents).set({ status: "SUPERADO" }).where(and(ne(hrIntegrationEvents.id, event.id), eq(hrIntegrationEvents.eventType, "PPP_DADOS_TECNICOS_RECONHECIDOS"), eq(hrIntegrationEvents.status, "PROCESSADO"), sql`${hrIntegrationEvents.payload}->>'employeeId'=${input.employeeId}`, sql`${hrIntegrationEvents.payload}->>'budgetUnitId'=${input.budgetUnitId}`, sql`${hrIntegrationEvents.payload}->>'from'=${input.from}`, sql`${hrIntegrationEvents.payload}->>'until'=${input.until}`));
    await tx.update(hrIntegrationEvents).set({ status: "PROCESSADO" }).where(eq(hrIntegrationEvents.id, event.id));
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
  const database = sstDatabase(context);
  const records = await database.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.domain, "SST"), eq(hrIntegrationEvents.eventType, "PPP_DADOS_TECNICOS_RECONHECIDOS"), eq(hrIntegrationEvents.status, "PROCESSADO"), sql`${hrIntegrationEvents.payload}->>'employeeId'=${context.user.employeeId!}`)).orderBy(desc(hrIntegrationEvents.createdAt), asc(hrIntegrationEvents.id));
  const schema = pppTechnicalSchema.safeExtend({ proofHash: z.string() });
  const technical = records.map(record => ({ ...schema.parse(record.payload), technicalSourceId: record.id })).find(record => record.budgetUnitId === policy.budgetUnitId && record.from === input.from && record.until === input.until);
  if (!technical) throw new Error("Reconheça CBO, atividades e agentes/medições PPP com comprovação técnica assinada.");
  const selectedExposures = exposures.filter(exposure => technical.groups.some(group => group.programGroupId === exposure.programGroupId && group.programVersion === exposure.version));
  const selectedGroups = await database.select({ id: sstProgramGroups.id, groupId: sstProgramGroups.groupId }).from(sstProgramGroups).where(inArray(sstProgramGroups.id, selectedExposures.map(exposure => exposure.programGroupId)));
  if (selectedExposures.some((exposure, index) => selectedExposures.slice(index + 1).some(other => other.functionalPeriodId === exposure.functionalPeriodId && other.programId !== exposure.programId && selectedGroups.find(group => group.id === other.programGroupId)?.groupId === selectedGroups.find(group => group.id === exposure.programGroupId)?.groupId && other.startsAt < exposure.endsAt && other.endsAt > exposure.startsAt))) throw new Error("Reconheça uma única versão LTCAT por GHE e intervalo; versões concorrentes não podem compor o PPP definitivo.");
  for (const period of periods) {
    const begin = new Date(Math.max(period.startsAt.getTime(), first.input.from.getTime())), end = new Date(Math.min(period.endsAt.getTime(), first.input.until.getTime()));
    if (missingPeriods(begin, end, selectedExposures.filter(exposure => exposure.functionalPeriodId === period.id)).length) throw new Error("As versões LTCAT tecnicamente reconhecidas não cobrem todo o período funcional.");
  }
  if (!(await sstRows<{ id: string }>(database, sql`SELECT v.id FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.id=${technical.proofVersionId} AND v."hashSha256"=${technical.proofHash} AND v.status='SIGNED' AND d.status IN ('Válido','Assinado') LIMIT 1`)).length) throw new Error("Laudo técnico PPP revogado ou indisponível.");
  const responsibilities = (await readSstHistoricalResponsibilities(database, { budgetUnitId: policy.budgetUnitId, from: first.input.from, until: first.input.until, environmentalOnly: true })).sort((a, b) => a.id.localeCompare(b.id));
  const rows: string[][] = [["ESTABELECIMENTO", policy.issuerCnpj, technical.cnae, technical.establishmentAddress], ["IDENTIFICAÇÃO", "NIT", technical.nit, ""]];
  for (const period of periods) {
    const occupation = technical.occupations.find(row => row.functionalPeriodId === period.id);
    if (!occupation) throw new Error("CBO/atividades ausentes para período funcional PPP.");
    rows.push(["PROFISSIOGRAFIA", `${period.startsAt.toISOString()} a ${period.endsAt.toISOString()} (fim exclusivo)`, occupation.cbo, `${String(period.snapshot.role || "")} · ${occupation.activities}`]);
  }
  for (const exposure of selectedExposures) {
    const group = technical.groups.find(row => row.programGroupId === exposure.programGroupId && row.programVersion === exposure.version);
    if (!group) throw new Error("Agentes/medições não correspondem à versão ambiental aplicável.");
    const nativeGroup = selectedGroups.find(group => group.id === exposure.programGroupId);
    if (!nativeGroup) throw new Error("Grupo ambiental PPP não encontrado.");
    const responsible = responsibilities.filter(row => !row.groupId || row.groupId === nativeGroup.groupId);
    if (missingPeriods(exposure.startsAt, exposure.endsAt, responsible.map(row => ({ startsAt: row.startsAt, endsAt: row.effectiveEndsAt }))).length) throw new Error("Responsabilidade técnica ambiental não cobre todo o período PPP.");
    for (const risk of group.risks) rows.push(["EXPOSIÇÃO", `${exposure.startsAt.toISOString()} a ${exposure.endsAt.toISOString()}`, `${risk.type} · ${risk.code} · ${risk.agent}`, `${risk.intensity} ${risk.unit} · técnica ${risk.technique} · EPC ${risk.epcEffective ? "eficaz" : "não eficaz"} · EPI ${risk.epiEffective ? "eficaz" : "não eficaz"} · CA ${risk.ca.join(", ")} · ${risk.legalReference}`]);
    for (const person of responsible) rows.push(["RESPONSÁVEL", person.snapshot.personName, person.snapshot.council, person.snapshot.sourceReference]);
  }
  return { fields: { matricula: [...new Set(periods.map(period => String(period.snapshot.registration || "")).filter(Boolean))].join(" · ") }, headers: ["Grupo", "Identificação / período", "Código / registro", "Informações de origem"], rows, snapshot: { periods, exposures: selectedExposures, technical, responsibilities, sourceComplete: true } };
}
