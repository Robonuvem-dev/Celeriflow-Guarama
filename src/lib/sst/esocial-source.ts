import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "./access";
import { assertDisciplineAccess } from "./clinical-access";
import { hashSource, type EsocialKind, type SourceEnvelope } from "./esocial-contract";
import { readCatForEsocial } from "./accident-service";
import { readCatLayoutForEsocial } from "./accident-layout-service";
import { catLayoutProvenance } from "./accident-layout-policy";
import { getAuthorizedHistoricalExposure } from "./functional-service";
import type { FunctionalScope } from "./functional-policy";
import { asoCorrectionVersion } from "./aso-flow-policy";

// Stable DTOs for the domain owners. Fiscal codes and historical exposure are
// deliberately required rather than inferred from prose or current positions.
export const catEsocialSource = z.object({
  sourceId: z.string(), sourceVersion: z.string(), budgetUnitId: z.string(), employeeId: z.string(),
  accidentDate: z.string(), workerCpf: z.string(), registration: z.string(),
  fiscalCategory: z.string(), accidentTypeCode: z.string(), causativeAgentCode: z.string(),
  bodyPartCode: z.string(), situationCode: z.string(), medicalCid: z.string(),
  physicianCrm: z.string(), physicianCrmUf: z.string(),
});
export const exposureEsocialSource = z.object({
  sourceId: z.string(), sourceVersion: z.string(), budgetUnitId: z.string(), employeeId: z.string(),
  historyId: z.string(), startsAt: z.string(), workerCpf: z.string(), registration: z.string(),
  fiscalCategory: z.string(), environmentDescription: z.string(), activities: z.string(),
  risks: z.array(z.object({ table24Code: z.string(), assessmentType: z.string(), technicalSourceId: z.string() })).min(1),
  responsibleCpf: z.string(), responsibleCouncil: z.string(),
});
const fiscalExamTypes: Record<string, string> = { ADMISSIONAL: "0", PERIODICO: "1", RETORNO_TRABALHO: "2", MUDANCA_RISCOS: "3", MONITORACAO: "4", DEMISSIONAL: "9" };

export async function loadEsocialSource(context: AppContext, kind: EsocialKind, sourceId: string, budgetUnitId: string): Promise<SourceEnvelope> {
  await assertSstClinicalAccess(context, budgetUnitId);
  if (kind === "S2220") {
    await assertDisciplineAccess(context, budgetUnitId, "MEDICINE");
    const aso = await context.prisma.sstAso.findFirst({ where: { id: sourceId, budgetUnitId }, include: { exams: { orderBy: { id: "asc" } } } });
    if (!aso) throw new Error("ASO não encontrado na UG autorizada.");
    const [correction] = await context.prisma.$queryRaw<{ id: string; kind: string; replacementAsoId: string | null; requestHash: string }[]>`SELECT id,kind,"replacementAsoId","requestHash" FROM "SstAsoCorrection" WHERE "asoId"=${aso.id}`;
    const [rectifies] = await context.prisma.$queryRaw<{ id: string; asoId: string; requestHash: string }[]>`SELECT id,"asoId","requestHash" FROM "SstAsoCorrection" WHERE "replacementAsoId"=${aso.id}`;
    const snapshot = z.object({ cpf: z.string().nullable(), registration: z.string().nullable(), examinerName: z.string() }).parse(aso.snapshot);
    const missing = ["RH: categoria fiscal histórica e vínculo RET", "Médico: CRM e UF estruturados", ...aso.exams.map((exam) => `Exame ${exam.id}: procedimento oficial Tabela 27 e proveniência do mapeamento`)];
    if (correction) missing.push(correction.kind === "ANNULMENT" ? "ASO anulado: origem bloqueada; exclusão fiscal exige recibo e fluxo eSocial" : `ASO retificado: usar versão sucessora ${correction.replacementAsoId}; retificação fiscal exige recibo de origem`);
    if (rectifies) missing.push(`ASO sucessor do original ${rectifies.asoId}: vincular recibo de origem e retificação fiscal autorizada`);
    if (!aso.employeeId) missing.push("Candidato sem vínculo RET: evento não transmissível");
    if (!snapshot.cpf || !/^\d{11}$/.test(snapshot.cpf)) missing.push("CPF válido do trabalhador");
    if (!snapshot.registration) missing.push("Matrícula canônica do vínculo");
    if (!fiscalExamTypes[aso.kind]) missing.push("Tipo ASO sem correspondência fiscal confirmada");
    if (!["APTO", "INAPTO"].includes(aso.result)) missing.push("Conclusão condicional: correspondência fiscal autorizada pendente");
    const data = { aso: { id: aso.id, snapshot: aso.snapshot, kind: aso.kind, result: aso.result, performedAt: aso.performedAt.toISOString(), examinerCouncil: aso.examinerCouncil }, correction: correction || null, rectifies: rectifies || null, exams: aso.exams.map((exam) => ({ id: exam.id, name: exam.name, kind: exam.kind, performedAt: exam.performedAt.toISOString(), source: exam.source })) };
    const sourceVersion = asoCorrectionVersion(asoCorrectionVersion(aso.requestHash, correction), rectifies);
    return { kind, sourceId, sourceVersion, budgetUnitId, employeeId: aso.employeeId, sourceHash: hashSource(data), data, missing };
  }
  if (kind === "S2210") {
    const { cat, evidence } = await readCatForEsocial(context, sourceId);
    if (cat.budgetUnitId !== budgetUnitId) throw new Error("CAT de outra UG.");
    // Keep the domain owner's typed envelope intact. The INSS registration
    // preview matches catLayout.layout.requestHash against accepted production
    // evidence; neither the printed template nor a manual originalReceipt is an
    // official eSocial acceptance. Both medical and administrative versions are
    // covered by sourceHash/sourceVersion and survive later layout revisions.
    const catLayout = await readCatLayoutForEsocial(context, sourceId);
    const data = { cat: { id: cat.id, occurredAt: cat.occurredAt.toISOString(), kind: cat.kind, snapshot: cat.snapshot, data: cat.data }, evidence: evidence.map((entry) => ({ id: entry.id, kind: entry.kind, version: entry.version, data: entry.data, requestHash: entry.requestHash })), catLayout };
    const missing = ["RH: CPF, matrícula e categoria fiscal históricos / vínculo RET", "CAT: códigos oficiais de agente, parte atingida, situação e natureza da lesão", "CAT: tipo/local/emitente conforme leiaute eSocial", "Atendimento: CID fiscal e CRM/UF estruturados com proveniência"];
    if (!catLayout) missing.push("CAT: versão do formulário INSS ainda não registrada");
    else {
      if (catLayout.layout.mode !== "COMPLETE" || !catLayout.medical) missing.push("CAT: formulário INSS em rascunho ou sem atendimento médico vinculado");
      if (catLayout.layout.catId !== cat.id || catLayout.layout.layoutVersion !== catLayoutProvenance.version || catLayout.layout.templateSha256 !== catLayoutProvenance.sha256) missing.push("CAT: proveniência do formulário INSS incompatível com a versão oficial conferida");
    }
    const sourceHash = hashSource(data);
    return { kind, sourceId, sourceVersion: sourceHash, budgetUnitId, employeeId: cat.employeeId, sourceHash, data, missing };
  }
  const periods = await context.prisma.$queryRaw<FunctionalScope[]>`SELECT p.* FROM "HrEmployeeFunctionalPeriod" p WHERE p.id=${sourceId} AND p."budgetUnitId"=${budgetUnitId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`;
  const period = periods[0];
  if (!period) throw new Error("Período funcional canônico não encontrado na UG.");
  const history = await getAuthorizedHistoricalExposure(context, period.employeeId, budgetUnitId, period.startsAt, period.endsAt);
  const data = { period: { ...period, startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString() }, ltcat: history.exposure.filter((entry) => entry.kind === "LTCAT"), responsibilities: history.responsibilities };
  const missing = ["RH: CPF, matrícula e categoria fiscal históricos / vínculo RET", "LTCAT: agentes oficiais Tabela 24, avaliação quantitativa/qualitativa e técnica", "Atividades históricas e estabelecimento de trabalho estruturados", "Responsável técnico: CPF/conselho e proveniência fiscal"];
  if (!data.ltcat.length) missing.push("Período sem LTCAT histórico aplicável");
  const sourceHash = hashSource(data);
  return { kind, sourceId, sourceVersion: sourceHash, budgetUnitId, employeeId: period.employeeId, sourceHash, data, missing };
}
